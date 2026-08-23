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
    rings.push({ pts: pts, h: (d.heights && d.heights[rings.length]) || 0 });
  }
};
const packs = fs.readdirSync(path.join(root, 'packs')).filter(f => /^[a-z0-9]+\.js$/.test(f) &&
  !/^(make-pack|grid-square|plan-tiles|check-model-sites)\.js$/.test(f));
for (const f of packs) require(path.join(root, 'packs', f));
if (!rings.length) { console.error('no packs to check against'); process.exit(1); }
console.log('checking ' + models.length + ' models against ' + rings.length.toLocaleString() +
            ' surveyed footprints from ' + packs.join(', ') + '\n');

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
function unpackH(v){ return { eaves:(v & 1023)/10, roofH:((v >> 10) & 255)/10 }; }
function mainMass(m){
  const ps = m.parts || [];
  let main = ps.find(p => p.on === 'footprint');
  if (!main) main = ps.slice().sort((a,b) => (b.w||0)*(b.d||0) - (a.w||0)*(a.d||0))[0];
  return main ? (main.height||0) + (main.roofHeight||0) : 0;
}
function ref(lat, lon) {
  const b = bng(lat, lon);
  if (!b) return '(outside the grid)';
  const p = v => ('0000' + Math.floor(v)).slice(-4);
  return b.square + ' ' + p((b.E % 100000) / 10) + ' ' + p((b.N % 100000) / 10);
}

let suspect = 0, checked = 0, off = 0, unmeasured = 0;
for (const m of models) {
  const [tlat, tlon] = m.near;
  const mLat = 110540, mLon = 111320 * Math.cos(tlat * Math.PI / 180);
  const found = [];
  for (const r of rings) {
    const s = stats(r.pts, tlat);
    const d = Math.hypot((s.lat - tlat) * mLat, (s.lon - tlon) * mLon);
    if (d < 400) found.push({ s, d, h: r.h });
  }
  found.sort((a, b) => b.s.area - a.s.area);
  const best = found[0];
  const claim = found.filter(x => x.d <= Math.min(m.radius || 500, m.packRadius || 220) && x.s.area > 200)
    .sort((a, b) => (b.s.area / (1 + b.d / 100)) - (a.s.area / (1 + a.d / 100)))[0];
  const line = m.id.padEnd(14) + ref(tlat, tlon).padEnd(14);
  if (!best) { console.log(line + 'NOTHING within 400 m — check this one'); suspect++; continue; }
  const note = !claim ? '  <-- nothing it would anchor on'
             : claim.s.area < 400 ? '  <-- would anchor on something small'
             : '';
  if (note) suspect++;
  console.log(line + 'biggest near: ' + Math.round(best.s.area).toString().padStart(5) + ' m2 at ' +
    Math.round(best.d).toString().padStart(3) + ' m' +
    (claim ? ';  would take ' + Math.round(claim.s.area) + ' m2 at ' + Math.round(claim.d) + ' m' : '') + note);
  const want = mainMass(m);
  if (claim && want) {
    if (!claim.h) { unmeasured++; console.log(' '.repeat(28) + 'main mass ' + want.toFixed(1) +
                    ' m authored; that footprint has no lidar reading yet'); }
    else {
      const u = unpackH(claim.h), got = u.eaves + u.roofH, d = want - got;
      checked++;
      const verdict = Math.abs(d) < 2.5 ? '' :
        '   <-- ' + Math.abs(d).toFixed(1) + ' m ' + (d > 0 ? 'taller than measured' : 'shorter than measured');
      if (verdict) off++;
      console.log(' '.repeat(28) + 'main mass ' + want.toFixed(1).padStart(5) + ' m authored, ' +
                  got.toFixed(1).padStart(5) + ' m measured' + verdict);
    }
  }
}
console.log('\n' + (suspect ? suspect + ' model site(s) worth checking by hand' : 'every model has a substantial building where it expects one'));
if (checked) {
  console.log(checked + ' had a lidar reading to check the height against; ' + off +
              ' disagree by more than 2.5 m' +
              (unmeasured ? ', and ' + unmeasured + ' more sit on ground not measured yet' : ''));
  if (off) console.log('A footprint with lower wings reads lower than its main block, so ' +
                       'some of that gap is real and some is the blend. The massing in the ' +
                       'pack is what tells them apart.');
} else if (unmeasured) {
  console.log('no landmark sits on measured ground yet — run "Build a place" over these tiles');
}
