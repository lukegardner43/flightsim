#!/usr/bin/env node
/* Reading a roof out of a lidar surface.

   The input is a normalised height model — DSM minus DTM, one metre per
   sample, in metres above the ground beneath. Everything here works on the
   samples that fall inside one building footprint, and answers the four
   questions the renderer actually asks:

     how high are the eaves        (where the wall stops)
     how high is the ridge         (where the roof stops)
     which way does the ridge run  (roof:direction)
     what shape is it              (flat, gabled, hipped, pyramidal)

   The point of doing it here rather than trusting the DSM raw is that a
   1 m grid over a 7 m house is about forty samples, several of which are
   half wall and half garden. So: percentiles rather than min and max, and
   shape decided from profiles rather than from any single pixel.

   No dependencies, no I/O — so it can be tested against a surface whose
   answers are known.
*/
'use strict';

/* ---- geometry ---- */
function pip(px, py, ring) {                       /* even-odd point in polygon */
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* The smallest rectangle that holds the footprint, and its angle. A British
   house is a rectangle; the ridge runs along one of these two axes, which is
   why finding them first makes the rest easy. Rotating calipers on the convex
   hull would be exact; every edge direction is close enough and simpler. */
function orientedBox(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const dx = ring[j][0] - ring[i][0], dy = ring[j][1] - ring[i][1];
    const L = Math.hypot(dx, dy);
    if (L < 0.5) continue;
    const ux = dx / L, uy = dy / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of ring) {
      const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uy, u0, u1, v0, v1 };
  }
  return best;
}
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* ---- the fit ----
   ring   footprint in metres, [[E,N], ...], any winding
   sample(E, N) -> height above ground in metres, or NaN outside the data
*/
function collect(ring, sample, opt) {
  opt = opt || {};
  const STEP = opt.step || 1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ring) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  const box = orientedBox(ring);
  if (!box) return null;

  /* collect the samples, and where each one sits in the building's own frame */
  const h = [], us = [], vs = [];
  for (let y = Math.floor(y0) + 0.5; y < y1; y += STEP) {
    for (let x = Math.floor(x0) + 0.5; x < x1; x += STEP) {
      if (!pip(x, y, ring)) continue;
      const z = sample(x, y);
      if (!isFinite(z)) continue;
      h.push(z);
      us.push(x * box.ux + y * box.uy - box.u0);
      vs.push(-x * box.uy + y * box.ux - box.v0);
    }
  }
  if (h.length < 4) return { n: h.length, ok: false };
  const rawN = h.length;
  const bboxN = Math.max(1, Math.round((x1 - x0) * (y1 - y0) / (STEP * STEP)));

  /* Throw the garden away first.

     An OS footprint is the wall FACE, so a metre-grid laid over it catches a
     ring of ground all the way round, and on a small house that can be forty
     per cent of the samples. Every percentile below is then measuring the
     lawn: a semi-detached house came out with its eaves at zero. So the
     samples are cut to those plausibly on the building — above a floor set
     from the building's own height, not an absolute — and everything after
     this point works on the roof alone. */
  let sorted0 = h.slice().sort((a, b) => a - b);
  const hi = pct(sorted0, 0.90);
  const floor = Math.max(1.5, hi * 0.30);
  const kh = [], ku = [], kv = [];
  for (let i = 0; i < h.length; i++)
    if (h[i] >= floor) { kh.push(h[i]); ku.push(us[i]); kv.push(vs[i]); }
  if (kh.length < 4) return { n: rawN, ok: false };
  return { ok: true, h: kh, us: ku, vs: kv, box: box, rawN: rawN, bboxN: bboxN,
           uLen: box.u1 - box.u0, vLen: box.v1 - box.v0 };
}

/* Everything the renderer asks, from one set of samples. Split out from the
   collecting so that one PART of a roof can be described exactly the way the
   whole of it is. */
function describe(c, h, us, vs, uLen, vLen) {
  const box = c.box;
  const sorted = h.slice().sort((a, b) => a - b);
  /* Over a pitched roof the heights are spread almost evenly between eaves and
     ridge — the roof is a ramp and every band of it has the same area. So the
     eaves are near the BOTTOM of the distribution, not a quarter up: a quarter
     up a 3.4 m pitch is most of a metre of wall that is not there. A low
     percentile rather than the minimum, because the outline is the wall face
     and the samples along it are half garden. */
  const eaves = pct(sorted, 0.08);
  /* Not the top: a chimney is two or three samples and read as the ridge it
     made an eight metre house eleven metres tall. */
  const ridge = pct(sorted, 0.94);
  const med = pct(sorted, 0.5);
  if (!(ridge > 1.2)) return { n: h.length, ok: false };      /* not a building */

  const rel = ridge - eaves;

  /* mean height profile along each axis of the box: along the ridge it is
     flat, across it, it climbs to a peak and comes down again */
  function profile(coord, len, nb) {
    const sum = new Array(nb).fill(0), cnt = new Array(nb).fill(0);
    for (let i = 0; i < h.length; i++) {
      let b = Math.floor(coord[i] / len * nb);
      if (b < 0) b = 0; if (b >= nb) b = nb - 1;
      /* clipped at the ridge: a chimney is roof furniture, and left in it
         lifted one bin of the along-ridge profile far enough to make a
         gabled house look hipped */
      sum[b] += Math.min(h[i], ridge); cnt[b]++;
    }
    const out = [];
    for (let b = 0; b < nb; b++) out.push(cnt[b] ? sum[b] / cnt[b] : NaN);
    return out;
  }
  function spread(p) {
    const v = p.filter(isFinite);
    if (v.length < 3) return 0;
    return Math.max.apply(null, v) - Math.min.apply(null, v);
  }
  const NB = 7;
  const pu = profile(us, uLen, NB), pv = profile(vs, vLen, NB);
  const su = spread(pu), sv = spread(pv);

  const aspect = Math.max(uLen, vLen) / Math.max(0.5, Math.min(uLen, vLen));
  let shape, bearing = null;
  if (rel < Math.max(0.9, ridge * 0.10)) {
    shape = 'flat';
  } else if (aspect < 1.15 && Math.abs(su - sv) < 0.30 * Math.max(su, sv)) {
    /* A pyramid is the one roof with no ridge at all, and what says so is
       geometry, not the profile: a SQUARE plan that falls away just as fast
       in both directions. Telling it from a hip by how much the ends drop
       called every hipped bungalow a pyramid; allowing 1.35 of aspect called
       a hipped detached house on a 13 by 10 plan one too, and that shape is
       most of suburban Britain. */
    shape = 'pyramidal';
  } else {
    /* the ridge runs along whichever axis the profile is flatter over */
    const alongU = su <= sv;
    const along = alongU ? pu : pv;
    const across = alongU ? pv : pu;
    /* a ridge that sags at both ends is hipped; one that stays up to the
       gable ends is gabled */
    const inner = along.slice(1, NB - 1).filter(isFinite);
    const mid = inner.length ? Math.max.apply(null, inner) : ridge;
    const ends = [along[0], along[NB - 1]].filter(isFinite);
    const endDrop = ends.length ? mid - Math.min.apply(null, ends) : 0;
    shape = endDrop > Math.max(0.5, rel * 0.30) ? 'hipped' : 'gabled';
    /* roof:direction is the compass bearing the SLOPE faces, so it is across
       the ridge; the ridge itself runs 90 degrees off it. */
    const rx = alongU ? box.ux : -box.uy, ry = alongU ? box.uy : box.ux;
    let deg = Math.atan2(rx, ry) * 180 / Math.PI;             /* bearing of the ridge */
    deg = ((deg % 180) + 180) % 180;
    bearing = Math.round(deg);
  }
  /* The apex of a pyramid is one sample wide, so every percentile misses it.
     Only for that shape is the very top believed, and only within reach of
     the 99th, so a chimney on a hip cannot become a spire. */
  let top = ridge;
  if (shape === 'pyramidal') top = Math.min(sorted[sorted.length - 1], ridge + rel * 0.45);
  return {
    ok: true, n: h.length,
    eaves: eaves, ridge: top, median: med,
    roofH: Math.max(0, top - eaves),
    shape: shape, bearing: bearing
  };
}
function fitRoof(ring, sample, opt) {
  const c = collect(ring, sample, opt);
  if (!c || !c.ok) return c || null;
  const d = describe(c, c.h, c.us, c.vs, c.uLen, c.vLen);
  if (!d.ok) return { n: c.rawN, ok: false };
  /* how much of the footprint had data at all, and how much of it read as
     building rather than garden — a half-covered building is a
     half-believable measurement */
  d.fill = c.rawN / c.bboxN;
  d.onRoof = c.h.length / Math.max(1, c.rawN);
  return d;
}
/* ---- the massing inside the footprint ----

   One height per building is a lie about most British houses. A two-storey
   front with a single-storey rear extension, a terrace where one house has a
   loft conversion and its neighbour does not, a barn with a lean-to — the
   lidar shows every one of those as a clean step, and drawing them as one box
   throws it away.

   This finds the steps. Walk along one axis of the footprint in slices, take
   the median height of each, and group consecutive slices that agree. What
   comes back is the same description fitRoof gives, once per part, plus where
   along the axis the part starts and stops.

   One axis, not two, and the one with the bigger step in it. Two would let a
   semi-detached pair with a rear extension turn into four boxes on evidence
   that does not support four, and the common British cases — front/back and
   along-the-terrace — are each a single axis.
*/
function fitParts(ring, sample, opt) {
  opt = opt || {};
  const c = collect(ring, sample, opt);
  if (!c || !c.ok) return null;
  const SLICE = opt.slice || 2;                  /* metres per slice */
  const TOL = opt.tol || 1.2;                    /* same storey, near enough */
  const MINRUN = opt.minRun || 4.5;              /* nothing shorter is a part */
  const MINSTEP = opt.minStep || 1.6;            /* below this it is one building */

  function slices(coord, len) {
    const nb = Math.max(2, Math.round(len / SLICE));
    const bins = [];
    for (let i = 0; i < nb; i++) bins.push([]);
    for (let i = 0; i < c.h.length; i++) {
      let b = Math.floor(coord[i] / len * nb);
      if (b < 0) b = 0; if (b >= nb) b = nb - 1;
      bins[b].push(c.h[i]);
    }
    return bins.map(v => v.length >= 2 ? pct(v.slice().sort((a, b) => a - b), 0.6) : NaN);
  }
  function segment(med) {
    /* fill the odd empty slice from its neighbours so one gap does not
       chop a building in half */
    for (let i = 0; i < med.length; i++) {
      if (isFinite(med[i])) continue;
      const a = i > 0 ? med[i - 1] : NaN, b = i + 1 < med.length ? med[i + 1] : NaN;
      med[i] = isFinite(a) && isFinite(b) ? (a + b) / 2 : (isFinite(a) ? a : b);
    }
    if (!med.every(isFinite)) return null;
    const seg = [];
    let start = 0, sum = med[0], n = 1;
    for (let i = 1; i < med.length; i++) {
      if (Math.abs(med[i] - sum / n) <= TOL) { sum += med[i]; n++; continue; }
      seg.push({ a: start, b: i, mean: sum / n });
      start = i; sum = med[i]; n = 1;
    }
    seg.push({ a: start, b: med.length, mean: sum / n });
    return seg;
  }
  /* absorb a run too short to believe into whichever neighbour it is closer to */
  function tidy(seg, len, nb) {
    const per = len / nb;
    let changed = true;
    while (changed && seg.length > 1) {
      changed = false;
      for (let i = 0; i < seg.length; i++) {
        if ((seg[i].b - seg[i].a) * per >= MINRUN) continue;
        const L = i > 0 ? seg[i - 1] : null, R = i + 1 < seg.length ? seg[i + 1] : null;
        const into = !L ? R : (!R ? L :
          (Math.abs(L.mean - seg[i].mean) <= Math.abs(R.mean - seg[i].mean) ? L : R));
        if (!into) break;
        into.a = Math.min(into.a, seg[i].a); into.b = Math.max(into.b, seg[i].b);
        seg.splice(i, 1); changed = true; break;
      }
    }
    return seg;
  }
  /* The slice that straddles the step reads as neither height, and left alone
     it becomes a part of its own: a house with a rear extension came out as
     three boxes with a sliver of ramp between them. Any two neighbours closer
     together than a real step get merged back. */
  function fuse(seg) {
    let changed = true;
    while (changed && seg.length > 1) {
      changed = false;
      for (let i = 0; i + 1 < seg.length; i++) {
        if (Math.abs(seg[i].mean - seg[i + 1].mean) >= MINSTEP) continue;
        const wa = seg[i].b - seg[i].a, wb = seg[i + 1].b - seg[i + 1].a;
        seg[i].mean = (seg[i].mean * wa + seg[i + 1].mean * wb) / (wa + wb);
        seg[i].b = seg[i + 1].b;
        seg.splice(i + 1, 1);
        changed = true; break;
      }
    }
    return seg;
  }

  const cand = [];
  for (const ax of ['u', 'v']) {
    const coord = ax === 'u' ? c.us : c.vs, len = ax === 'u' ? c.uLen : c.vLen;
    if (len < MINRUN * 2) continue;
    const med = slices(coord, len);
    const nb = med.length;
    let seg = segment(med);
    if (!seg) continue;
    seg = fuse(tidy(seg, len, nb));
    if (seg.length < 2) continue;
    let lo = Infinity, hi = -Infinity;
    for (const g of seg) { lo = Math.min(lo, g.mean); hi = Math.max(hi, g.mean); }
    if (hi - lo < MINSTEP) continue;
    cand.push({ ax, seg, nb, len, step: hi - lo, coord });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => b.step - a.step);          /* the clearer step wins */
  const w = cand[0];

  /* describe each part from its own samples, exactly as a whole roof is */
  const parts = [];
  const inset = SLICE * 0.6;
  for (let gi = 0; gi < w.seg.length; gi++) {
    const g = w.seg[gi];
    const t0 = g.a / w.nb, t1 = g.b / w.nb;
    const lo = t0 * w.len, hi = t1 * w.len;
    /* The step between two parts is a WALL, and the slice that straddles it
       is half of each roof. Sampled as though it were roof it dragged a two
       storey house's eaves down by more than a metre. So each part is
       described from its own middle, stepping back from any boundary it
       shares with a neighbour — but not from the ends of the building, where
       there is nothing to step back from. */
    const sLo = lo + (gi > 0 ? inset : 0);
    const sHi = hi - (gi < w.seg.length - 1 ? inset : 0);
    const h = [], us = [], vs = [];
    for (let i = 0; i < c.h.length; i++) {
      const t = w.coord[i];
      if (t < sLo || t > sHi) continue;
      h.push(c.h[i]); us.push(c.us[i]); vs.push(c.vs[i]);
    }
    if (h.length < 4) return null;               /* all or nothing */
    const uLen = w.ax === 'u' ? (hi - lo) : c.uLen;
    const vLen = w.ax === 'v' ? (hi - lo) : c.vLen;
    const d = describe(c, h, us, vs, uLen, vLen);
    if (!d.ok) return null;
    d.t0 = t0; d.t1 = t1;
    parts.push(d);
  }
  /* the axis, as a compass bearing, so the sim can rebuild the cut lines
     without knowing anything about the box this was measured in */
  const ax = w.ax === 'u' ? [c.box.ux, c.box.uy] : [-c.box.uy, c.box.ux];
  let deg = Math.atan2(ax[0], ax[1]) * 180 / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  return { bearing: Math.round(deg), axis: w.ax, step: w.step, parts: parts };
}
module.exports = { fitRoof, fitParts, collect, describe, orientedBox, pip, pct };
