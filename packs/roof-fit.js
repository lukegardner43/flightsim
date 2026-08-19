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
function fitRoof(ring, sample, opt) {
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
  h.length = 0; us.length = 0; vs.length = 0;
  for (let i = 0; i < kh.length; i++) { h.push(kh[i]); us.push(ku[i]); vs.push(kv[i]); }

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
  const uLen = box.u1 - box.u0, vLen = box.v1 - box.v0;

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
    shape: shape, bearing: bearing,
    /* how much of the footprint actually had data — a half-covered building
       is a half-believable measurement */
    /* how much of the footprint had data at all, and how much of it read as
       building rather than garden — a half-covered building is a
       half-believable measurement */
    fill: rawN / Math.max(1, Math.round((x1 - x0) * (y1 - y0) / (STEP * STEP))),
    onRoof: h.length / Math.max(1, rawN)
  };
}
module.exports = { fitRoof, orientedBox, pip, pct };
