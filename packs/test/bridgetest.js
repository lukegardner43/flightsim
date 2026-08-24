/* A bridge model has to span its valley, not follow it.
 *
 * Two things in models/bridges.json cannot be checked by reading it:
 *
 *   * atM places a part in METRES from the middle of the bridge. If index.html
 *     ignored it, every part would collapse to the centre of the outline and
 *     both towers would stand in the same place — and the JSON would look
 *     perfectly correct while it happened.
 *   * datum:"anchor" makes every part take its ground height from mid-span.
 *     Without it Clifton's chains take the terrain under each prism, so they
 *     sag into the Avon Gorge and climb back out of it, 75 m below where they
 *     belong. Nothing in the JSON can show that either.
 *
 * So this runs the REAL modelParts out of index.html against a synthetic
 * bridge outline, and checks where the parts actually landed. Everything the
 * models assert about themselves — that a chain is continuous, that it meets
 * its saddles, that it clears its deck — is checked on the way through.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* Pull a named function out of index.html by matching its braces. Tests here
   normally reimplement the geometry they check; that is no use for this one,
   because the whole question is whether index.html itself does the right
   thing. */
function extract(name) {
  const at = HTML.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('index.html has no function ' + name);
  let i = HTML.indexOf('{', at), depth = 0, end = -1;
  for (let j = i; j < HTML.length; j++) {
    if (HTML[j] === '{') depth++;
    else if (HTML[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error('unbalanced braces in ' + name);
  return HTML.slice(at, end);
}

/* A flat-earth projection, consistent in both directions. modelParts only
   needs to round-trip; it never asks how big a degree is. */
const M_LAT = 110540, M_LON = 111320 * Math.cos(51.5 * Math.PI / 180);

const sandbox = {
  toWorld: (lon, lat) => ({ x: lon * M_LON, z: -lat * M_LAT }),
  worldToLatLon: (x, z) => ({ lat: -z / M_LAT, lon: x / M_LON }),
  MODEL_MASSED: [],
  ringsOf: null,      /* set per case */
  orientedBox: null,  /* the real one, below */
  bboxOf: null
};

const src = [extract('orientedBox'), extract('bboxOf'), extract('modelParts')].join('\n');
const make = new Function('S',
  'const {toWorld, worldToLatLon, MODEL_MASSED} = S;' +
  'let ringsOf = S.ringsOf;' + src + '\n return modelParts;');

/* A bridge outline: a rectangle `len` long and `wide` across, centred on
   (lat,lon) and running along `bearing`. This is what OSM's man_made=bridge
   area is, near enough. */
function outline(lat, lon, len, wide, bearingDeg) {
  const br = bearingDeg * Math.PI / 180;
  const ux = Math.sin(br), uz = -Math.cos(br);   /* world z runs south */
  const cx = lon * M_LON, cz = -lat * M_LAT;
  const pts = [];
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
    pts.push({ x: cx + su * len / 2 * ux - sv * wide / 2 * uz,
               z: cz + su * len / 2 * uz + sv * wide / 2 * ux });
  return pts;
}

function run(model, lat, lon, len, wide, bearing) {
  const pts = outline(lat, lon, len, wide, bearing);
  const S = Object.assign({}, sandbox, {
    ringsOf: () => [{ role: 'outer', pts: pts }]
  });
  const modelParts = make(S);
  const parts = modelParts({ type: 'way', id: 1, geometry: [] }, model);
  /* centre of the outline, in world coords, to measure parts against */
  const cx = lon * M_LON, cz = -lat * M_LAT;
  const br = bearing * Math.PI / 180;
  const ux = Math.sin(br), uz = -Math.cos(br);
  return parts.map(p => {
    let sx = 0, sz = 0;
    const g = p.geometry.slice(0, -1);         /* the ring repeats its first point */
    for (const q of g) { sx += q.lon * M_LON; sz += -q.lat * M_LAT; }
    const px = sx / g.length - cx, pz = sz / g.length - cz;
    /* how long the part is along the span, which is what tells a 3 m chain
       link from a 0.5 m suspension rod from a 61 m walkway */
    let u0 = Infinity, u1 = -Infinity;
    for (const q of g) {
      const qx = q.lon * M_LON - cx, qz = -q.lat * M_LAT - cz;
      const qu = qx * ux + qz * uz;
      if (qu < u0) u0 = qu; if (qu > u1) u1 = qu;
    }
    return {
      tags: p.tags,
      u: px * ux + pz * uz,                    /* metres along the span */
      v: -px * uz + pz * ux,                   /* metres across it */
      len: u1 - u0,                            /* metres of it along the span */
      min: parseFloat(p.tags.min_height || '0'),
      top: parseFloat(p.tags.height || '0')
    };
  });
}

let pass = 0, fail = 0;
function ok(cond, what) {
  if (cond) { pass++; return; }
  fail++; console.log('  FAIL  ' + what);
}
function near(a, b, tol, what) { ok(Math.abs(a - b) <= tol, what + ' (got ' + (+a).toFixed(2) + ', wanted ' + b + ' +-' + tol + ')'); }

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'bridges.json'), 'utf8'));
const byId = {};
for (const m of doc.models) byId[m.id] = m;

console.log('bridge models');

/* ---------------------------------------------------------------- shared */
ok(byId.clifton.datumAtM && Math.abs(byId.clifton.datumAtM[0]) > 100,
  'Clifton pads from an abutment, not from mid-span over the gorge');
for (const m of doc.models) {
  ok(m.datum === 'anchor', m.id + ' pads from its anchor');
  ok(m.replaceOutline === true, m.id + ' replaces its outline');
  ok(m.parts.every(p => p.atM), m.id + ' places every part in metres, not fractions');
  ok(m.parts.every(p => p.height > (p.minHeight || 0)), m.id + ' has no inside-out part');
}

/* ------------------------------------------------------------ the plumbing
   The outline is deliberately the WRONG length in the second case: a mapper
   who drew the bridge area out along its approach roads must not move the
   towers, which is the whole reason atM exists. */
for (const [len, label] of [[290, 'a 290 m outline'], [520, 'a 520 m outline']]) {
  const got = run(byId.towerbridge, 51.5055, -0.0754, len, 30, 10);
  const us = got.map(p => p.u);
  near(Math.min(...us), -132.5, 8, 'Tower Bridge reaches its south abutment under ' + label);
  near(Math.max(...us), 132.5, 8, 'Tower Bridge reaches its north abutment under ' + label);
  ok(got.every(p => p.tags['tf:padx'] !== undefined),
    'every Tower Bridge part carries its anchor pad under ' + label);
}

/* the towers must land either side of a 61 m gap, whatever the outline does */
{
  const got = run(byId.towerbridge, 51.5055, -0.0754, 290, 30, 10);
  const towers = got.filter(p => p.top === 65 || (p.min === 0 && p.top > 9));
  const usL = towers.filter(p => p.u < 0).map(p => p.u);
  const usR = towers.filter(p => p.u > 0).map(p => p.u);
  ok(usL.length > 0 && usR.length > 0, 'Tower Bridge has a tower on each side');
  near(Math.max(...usL), -40.5, 1, 'south tower sits half an opening from the middle');
  near(Math.min(...usR), 40.5, 1, 'north tower sits half an opening from the middle');
  const walk = got.filter(p => p.min === 44 && p.len > 40);
  ok(walk.length === 2, 'both high-level walkways are there');
  ok(walk.every(p => Math.abs(p.v) > 3), 'the walkways sit either side of the deck');
}

/* ------------------------------------------------------------ the chains */
{
  const got = run(byId.clifton, 51.4549, -2.6278, 260, 12, 103);
  /* the clifftop datum: the deck is 3 m over the ground at the tower, not
     75 m over the water — see the note in build-bridges.js */
  const deck = 3.0, halfSpan = 107.02, yMid = 3.91, yEnd = yMid + 21.34;

  /* one side's chain, in order along the span */
  const chain = got.filter(p => p.v > 2 && p.tags['building:material'] === 'metal'
                             && p.len > 2 && p.len < 8)
                   .sort((a, b) => a.u - b.u);
  ok(chain.length > 40, 'the chain is drawn as many short pieces (' + chain.length + ')');

  /* Everything below reads the chain. With no chain there is nothing to say
     about it, and a stack trace says it worse than a failure does. */
  if (!chain.length) { console.log(pass + '/' + (pass + fail) + ' passed'); process.exit(1); }

  const mid = chain.reduce((a, b) => Math.abs(b.u) < Math.abs(a.u) ? b : a);
  near((mid.min + mid.top) / 2, yMid, 1.0, 'the chain passes a metre over the deck at midspan');

  const endL = chain[0], endR = chain[chain.length - 1];
  near((endL.min + endL.top) / 2, yEnd, 1.5, 'the chain meets the south saddle');
  near((endR.min + endR.top) / 2, yEnd, 1.5, 'the chain meets the north saddle');
  near(endL.u, -halfSpan, 3, 'the chain starts at the south tower');
  near(endR.u, halfSpan, 3, 'the chain ends at the north tower');

  /* no gaps: consecutive prisms must overlap in height, or the chain is a
     dotted line rather than a curve */
  let gaps = 0, dips = 0;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].min > chain[i - 1].top || chain[i].top < chain[i - 1].min) gaps++;
    if (chain[i].min < deck) dips++;
  }
  ok(gaps === 0, 'the chain has no gaps in it (' + gaps + ')');
  ok(dips === 0, 'the chain never dips below the deck (' + dips + ')');

  /* and it must actually be a curve: rising away from the middle, both ways */
  const half = chain.filter(p => p.u > 0).sort((a, b) => a.u - b.u);
  let drops = 0;
  for (let i = 1; i < half.length; i++) if (half[i].top < half[i - 1].top - 0.01) drops++;
  ok(drops === 0, 'the chain rises all the way from midspan to the tower (' + drops + ')');

  /* the towers have to come up past the saddles the chains pass over */
  const towers = got.filter(p => p.tags['building:material'] === 'stone');
  ok(towers.length >= 4, 'both Clifton towers are built');
  ok(Math.max(...towers.map(p => p.top)) >= yEnd,
    'the towers reach above the chains they carry');

  /* the hangers hang: deck at the bottom, chain at the top */
  const rods = got.filter(p => p.tags['building:material'] === 'metal'
                            && p.len < 1.5 && p.min === deck);
  ok(rods.length > 8, 'the suspension rods are drawn (' + rods.length + ')');
  ok(rods.every(r => r.top <= yEnd + 0.5), 'no rod rises above the chain');
}

/* ------------------------------------------------- the pad lands where asked
   datumAtM is metres along the span from the middle. If index.html ignored it
   the model would silently go back to padding from mid-span, which over the
   Avon Gorge is the one height near this bridge that cannot be trusted. */
{
  const len = 260, lat = 51.4549, lon = -2.6278, br = 103;
  const S = Object.assign({}, sandbox, { ringsOf: () => [{ role: 'outer', pts: outline(lat, lon, len, 12, br) }] });
  const parts = make(S)({ type: 'way', id: 1, geometry: [] }, byId.clifton);
  const cx = lon * M_LON, cz = -lat * M_LAT;
  const b = br * Math.PI / 180, ux = Math.sin(b), uz = -Math.cos(b);
  const px = parseFloat(parts[0].tags['tf:padx']) - cx;
  const pz = parseFloat(parts[0].tags['tf:padz']) - cz;
  near(px * ux + pz * uz, 115, 1.5, 'Clifton pads 115 m along the span from the middle');
  const same = parts.every(p => p.tags['tf:padx'] === parts[0].tags['tf:padx']);
  ok(same, 'every Clifton part pads from the same point');
}

/* --------------------------------------------- big enough to be drawn
   index.html discards a model part under 0.8 m2 as a multipolygon sliver.
   A part below it is not wrong in the JSON and not wrong on screen — it is
   simply never drawn, which is the worst of the three. Clifton's suspension
   rods were 0.25 m2 and vanished exactly this way. */
for (const [id, lat, lon, len, wide, br] of
     [['towerbridge', 51.5055, -0.0754, 290, 30, 10],
      ['clifton', 51.4549, -2.6278, 260, 12, 103]]) {
  let small = 0;
  /* area from the returned rings, by the shoelace */
  const S = Object.assign({}, sandbox, { ringsOf: () => [{ role: 'outer', pts: outline(lat, lon, len, wide, br) }] });
  const parts = make(S)({ type: 'way', id: 1, geometry: [] }, byId[id]);
  for (const p of parts) {
    const r = p.geometry.slice(0, -1);
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      a += (r[j].lon * M_LON) * (-r[i].lat * M_LAT) - (r[i].lon * M_LON) * (-r[j].lat * M_LAT);
    if (Math.abs(a / 2) < 0.8) small++;
  }
  ok(small === 0, id + ' has no part too small to be drawn (' + small + ' under 0.8 m2)');
}

/* ------------------------------------------ the deck is left to the sim */
for (const m of doc.models)
  ok(!m.parts.some(p => (p.minHeight || 0) < 1 && p.w > 40),
    m.id + ' does not lay a deck of its own');

console.log(pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
