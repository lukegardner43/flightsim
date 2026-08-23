#!/usr/bin/env node
/* Does a building actually exist where each landmark model expects one?

     node packs/check-model-sites.js

   A model's `near` is the only thing placing it when OpenStreetMap has no
   building of that name, and a coordinate written from memory is exactly the
   sort of thing that is wrong by half a mile without anybody noticing.
   Polesden Lacey was placed on Polesden Lacey Farm, 800 m north of the house,
   twice. This holds every model's coordinate up against the surveyed
   footprints in the packs and says what is actually there.

   It cannot tell you a coordinate is RIGHT — only that something the right
   size is there, or that nothing is. A model whose site is empty, or whose
   biggest neighbour is a shed, is one to check by hand.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { bng } = require('./grid-square.js');

const root = path.join(__dirname, '..');
const models = [];
for (const f of fs.readdirSync(path.join(root, 'models')).filter(f => f.endsWith('.json')))
  for (const m of JSON.parse(fs.readFileSync(path.join(root, 'models', f), 'utf8')).models || [])
    if (m.near) models.push(m);

const rings = [];
global.TF_PACK = d => {
  const q = d.q || 1e6;
  for (const a of d.buildings) {
    const pts = [];
    let lat = a[0], lon = a[1];
    pts.push([lat / q, lon / q]);
    for (let i = 2; i < a.length; i += 2) { lat += a[i]; lon += a[i + 1]; pts.push([lat / q, lon / q]); }
    rings.push({ pts: pts, h: (d.heights && d.heights[rings.length]) || 0,
                 p: (d.parts && d.parts[rings.length]) || null });
  }
};
/* The tallest box the surface was split into, which is the number to hold a
   model's main mass against. One reading covers a whole footprint, so a house
   with lower wings reads lower than its main block — the massing is what
   tells the two apart, and comparing an authored main block against a
   whole-footprint average understates it every time. */
function tallestPart(p) {
  if (!p || p.length < 3) return 0;
  let top = 0;
  for (let i = 2; i < p.length; i += 2) {
    const v = p[i]; if (!v) continue;
    const h = topOf(v);
    if (h > top) top = h;
  }
  return top;
}
/* The biggest piece of GROUND the surface was split into, and how much of the
   footprint it is. A spire is never the biggest piece of ground — which is
   why this is the number to hold a model's fabric against, and an average
   over the whole footprint is not. */
function widestBox(p) {
  if (!p || p.length < 3) return null;
  let span = 0, h = 0;
  for (let i = 1; i + 1 < p.length; i += 2) {
    const t = p[i], s = (((t >> 8) & 255) - (t & 255)) / 255;
    if (s > span && p[i+1]) { span = s; h = topOf(p[i+1]); }
  }
  return span ? { span: span, h: h } : null;
}
/* and the model's fabric: the part that is most of the BUILDING, plan times
   height. Not the largest by plan — Thorncroft's widest is a 32% terrace
   1.5 m high — and not the tallest, which is the spire. */
function fabric(m, footArea) {
  let best = null, most = 0;
  for (const p of m.parts || []) {
    const plan = p.on === 'footprint' ? 1
               : (p.wF||0)*(p.dF||0) > 0 ? p.wF * p.dF
               : (p.w||0)*(p.d||0) > 0 ? (p.w * p.d) / footArea : 0;
    const v = plan * (p.height || 0);
    if (v > most) { most = v; best = p; }
  }
  return best;
}
/* A pack file starts with TF_PACK(. Anything else in this directory is a
   tool, and requiring a tool RUNS it: packs/boxes.js got loaded as a pack by
   this loader, hit its own command line with no arguments, and called
   process.exit(0) — which stopped the build dead and made the checker print
   nothing and return success. Renaming it fixed today's instance; this stops
   the next one. */
function isPack(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(8);
    return fs.readSync(fd, b, 0, 8, 0) === 8 && b.toString('utf8') === 'TF_PACK(';
  } catch (e) { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {} }
}
const packs = fs.readdirSync(path.join(root, 'packs'))
  .filter(f => f.endsWith('.js') && isPack(path.join(root, 'packs', f)));
for (const f of packs) require(path.join(root, 'packs', f));
if (!rings.length) { console.error('no packs to check against'); process.exit(1); }
console.log('checking ' + models.length + ' models against ' + rings.length.toLocaleString() +
            ' surveyed footprints from ' + packs.join(', ') + '\n');

/* is the model's own coordinate inside this footprint? Distance to a
   centroid cannot answer that: a 7,000 m2 range has a centroid 40 m from
   parts of itself, and a neighbour's centroid can be nearer than the
   building's own. */
function inside(pts, lat, lon) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][0], xi = pts[i][1], yj = pts[j][0], xj = pts[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function stats(pts, lat0) {
  const mLat = 110540, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  let a2 = 0, cl = 0, co = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const px = p[1] * mLon, py = p[0] * mLat, qx = q[1] * mLon, qy = q[0] * mLat;
    const c = px * qy - qx * py;
    a2 += c; cl += (p[0] + q[0]) * c; co += (p[1] + q[1]) * c;
  }
  return { area: Math.abs(a2) / 2, lat: cl / (3 * a2), lon: co / (3 * a2) };
}
/* ---- what the model claims, against what the laser saw ----

   These heights were authored from a written brief and photographs. Nothing
   has ever checked them, and until the lidar landed there was nothing to
   check them against.

   Compare the MAIN MASS, not the tallest thing on the model. The fit
   deliberately drops anything standing well above the roof, because a chimney
   read as a ridge made an eight metre house eleven metres tall — so measuring
   Polesden Lacey's clock lantern against Polesden Lacey's roof and calling
   the difference an error is a mistake I made on the first pass of this.

   Two things this cannot settle, and both matter:
     * one reading covers the WHOLE footprint, so a house with lower wings
       reads lower than its main block. The measurement is a floor, not the
       height of the tallest part. The pack's massing carries the steps.
     * a spire is a needle. St Nicolas' is a 4.8 m square, and on a metre grid
       blurred over a metre and a half the apex is smeared away. Lidar informs
       the main mass; it must never overrule an authored spire. */
/* bit 29: the height fields are half-metres, not decimetres — how a tower
   over 102.3 m fits in ten bits. Clear on every pack built before that. */
function unpackH(v){ const u = ((v >> 29) & 1) ? 2 : 10;
                     return { eaves:(v & 1023)/u, roofH:((v >> 10) & 255)/u }; }
function topOf(v){ const m = unpackH(v); return m.eaves + m.roofH; }
/* What the model would read if you flew a laser over it.

   Picking "the main mass" is the wrong question, and I asked it twice. A part
   is sized three ways — `on:'footprint'` is the surveyed outline itself,
   wF/dF are FRACTIONS of it, w/d are metres — and sorting by metres alone
   skipped every range of Polesden Lacey (four wings at 17.2 m, written as
   fractions) to settle on the 5x2 m stone entrance surround. Sorting by
   fraction instead put Thorncroft's main mass at 1.5 m, because its widest
   fractional part is a terrace.

   The measurement is an area-weighted average of roof height over a
   footprint. So the model's comparable number is the same thing: every part
   weighted by its plan area, in the same units, which the surveyed area
   makes possible. That is symmetric, needs no judgement about which box
   matters, and cannot be defeated by a wide low terrace or a tall thin
   chimney — both are weighted by exactly what they cover.

   The tallest part is reported beside it, because a spire is the one thing a
   metre grid cannot see and must never be allowed to overrule. */
function modelProfile(m, footArea) {
  const ps = m.parts || [];
  let sum = 0, area = 0, tallest = 0, what = '';
  for (const p of ps) {
    /* `height` in the JSON is ALREADY roof-inclusive — the builder converts
       the authored eaves to OSM's whole-building height on the way out — so
       adding roofHeight to it counts the roof twice. It did, and every
       authored figure this printed was a roof too tall: the Anchor read
       15.8 m when the model is 10.8. */
    const h = (p.height || 0);
    let a = 0;
    if (p.on === 'footprint') a = footArea;
    else if ((p.wF || 0) * (p.dF || 0) > 0) a = p.wF * p.dF * footArea;
    else if ((p.w || 0) * (p.d || 0) > 0) a = p.w * p.d;
    if (!(a > 0)) continue;
    sum += a * h; area += a;
    if (h > tallest) { tallest = h; what = p.note || p.type || ''; }
  }
  if (!(area > 0)) return null;
  return { h: sum / area, tallest: tallest, what: what };
}
function ref(lat, lon) {
  const b = bng(lat, lon);
  if (!b) return '(outside the grid)';
  const p = v => ('0000' + Math.floor(v)).slice(-4);
  return b.square + ' ' + p((b.E % 100000) / 10) + ' ' + p((b.N % 100000) / 10);
}

let suspect = 0, checked = 0, off = 0, unmeasured = 0, astray = 0;
for (const m of models) {
  const [tlat, tlon] = m.near;
  const mLat = 110540, mLon = 111320 * Math.cos(tlat * Math.PI / 180);
  const found = [];
  for (const r of rings) {
    const s = stats(r.pts, tlat);
    const d = Math.hypot((s.lat - tlat) * mLat, (s.lon - tlon) * mLon);
    if (d < 400) found.push({ s, d, h: r.h, p: r.p, on: inside(r.pts, tlat, tlon) });
  }
  found.sort((a, b) => b.s.area - a.s.area);
  const best = found[0];
  /* the same rule the sim uses to put a model on a surveyed footprint, which
     is what this is checking — including that standing inside a ring beats
     any amount of area or nearness, and skips the shed floor meant for
     guesses */
  const claim = found.filter(x => x.on).sort((a, b) => b.s.area - a.s.area)[0] ||
    found.filter(x => x.d <= Math.min(m.radius || 500, m.packRadius || 220) && x.s.area > 200)
      .sort((a, b) => (b.s.area / (1 + b.d / 100)) - (a.s.area / (1 + a.d / 100)))[0];
  const line = m.id.padEnd(14) + ref(tlat, tlon).padEnd(14);
  if (!best) { console.log(line + 'NOTHING within 400 m — check this one'); suspect++; continue; }
  const note = !claim ? '  <-- nothing it would anchor on'
             : claim.on ? ''                       /* it is standing on it */
             : claim.s.area < 400 ? '  <-- would anchor on something small'
             : '';
  if (note) suspect++;
  console.log(line + 'biggest near: ' + Math.round(best.s.area).toString().padStart(5) + ' m2 at ' +
    Math.round(best.d).toString().padStart(3) + ' m' +
    (claim ? ';  would take ' + Math.round(claim.s.area) + ' m2 ' +
      (claim.on ? 'it stands on' : 'at ' + Math.round(claim.d) + ' m') : '') + note);
  /* Compare against the building the model STANDS ON, or against nothing.

     The anchor above is "biggest nearby, discounted by distance", which is
     the right rule for placing a model and the wrong one for checking its
     height: it put St Nicolas' church against a 2,494 m2 building 173 m away
     and read 5.4 m, then called the church ten metres too tall. Fetcham Park
     and St Mary's Fetcham — a house and a church — both anchored on the same
     footprint. A reading from the building next door is worse than no
     reading, because it looks like an answer.

     So: the footprint containing the model's own coordinate, or one whose
     centroid is within 30 m, and otherwise say plainly that nothing here can
     settle the height. */
  /* the footprint the SIM will draw this model on, and only when it is close
     enough to be the building rather than its neighbour. Two rules that both
     try to answer "which building is this" will disagree eventually, and when
     they do the height gets checked against something the model is not. */
  const site = claim && (claim.on || claim.d <= 30) ? claim : null;
  const mm = modelProfile(m, site ? site.s.area : (claim ? claim.s.area : 500));
  if (mm && !site) {
    astray++;
    console.log(' '.repeat(28) + 'averages ' + mm.h.toFixed(1) +
                ' m over its own plan; nothing under this coordinate to check it against' +
                (claim ? ' (nearest is ' + Math.round(claim.d) + ' m away)' : ''));
  }
  if (site && mm) {
    if (!site.h) { unmeasured++; console.log(' '.repeat(28) + 'averages ' + mm.h.toFixed(1) +
                    ' m over its own plan; that footprint has no lidar reading yet'); }
    else {
      const u = unpackH(site.h), whole = u.eaves + u.roofH;
      const top = tallestPart(site.p);
      const box = widestBox(site.p);
      const fab = fabric(m, site.s.area);
      const gotFab = box ? box.h : whole;
      const wantFab = fab ? (fab.height || 0) : mm.h;
      const d = wantFab - gotFab;
      checked++;
      const verdict = Math.abs(d) < 2.5 ? '' :
        '   <-- ' + Math.abs(d).toFixed(1) + ' m ' + (d > 0 ? 'taller' : 'shorter');
      if (verdict) off++;
      console.log(' '.repeat(28) + 'the fabric:   ' + wantFab.toFixed(1).padStart(5) +
                  ' m authored, ' + gotFab.toFixed(1).padStart(5) + ' m measured' + verdict +
                  (box ? '   (the ' + (box.span * 100).toFixed(0) + '% of the footprint at one height)'
                       : '   (the whole footprint; not split)'));
      /* and the tallest thing on each, which is where a spire lives and where
         the metre grid gives up */
      console.log(' '.repeat(28) + 'tallest part: ' + mm.tallest.toFixed(1).padStart(5) +
                  ' m authored, ' + (top ? top.toFixed(1).padStart(5) + ' m measured' : '    — not split') +
                  (mm.what ? '   (' + String(mm.what).slice(0, 40) + ')' : ''));
    }
  }
}
console.log('\n' + (suspect ? suspect + ' model site(s) worth checking by hand' : 'every model has a substantial building where it expects one'));
if (checked) {
  console.log(checked + ' stand on a measured footprint; ' + off +
              (off === 1 ? ' disagrees' : ' disagree') + ' with it by more than 2.5 m' +
              (unmeasured ? ', ' + unmeasured + ' sit on ground not measured yet' : '') +
              (astray ? ', and ' + astray + (astray === 1 ? ' has' : ' have') +
                        ' no building under the coordinate at all' : ''));
  if (off) console.log('Both numbers are the biggest piece of ground at one height — the ' +
                       'model\'s fabric against the surface\'s. A footprint holding two ' +
                       'buildings has no single answer, and that is what a gap here usually ' +
                       'means: run  node packs/show-boxes.js <id>  and look at the split.');
} else if (unmeasured) {
  console.log('no landmark sits on measured ground yet — run "Build a place" over these tiles');
}
