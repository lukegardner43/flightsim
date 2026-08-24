#!/usr/bin/env node
/* Draw a model's silhouette, without a browser and without the network.
 *
 *     node models/elevation.js shard            > /tmp/shard.svg
 *     node models/elevation.js clifton --span 260
 *
 * WHY THIS EXISTS. models/README.md says to judge a model by flying to it and
 * looking. That is the right test and it is not always an available one: the
 * sim takes its buildings from Overpass at runtime, so on a machine that
 * cannot reach Overpass no model can be looked at at all — and a model written
 * blind is exactly how the Shard came to be a smooth four-stage cone.
 *
 * This is the cheap half of looking. It runs the REAL modelParts out of
 * index.html against a footprint, then draws every part it returns in
 * elevation: each part is a prism from min_height to height, tapering to
 * `tf:taper` of its width at the top, which is precisely what the renderer
 * will extrude. So the silhouette here is the silhouette there.
 *
 * What it does NOT show: materials, glass, the roof shapes drawn on untapered
 * parts, and anything that depends on the real surveyed polygon rather than
 * the stand-in used here. It answers "what shape is this", not "does it look
 * right in the light".
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function extract(name) {
  const at = HTML.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('index.html has no function ' + name);
  let i = HTML.indexOf('{', at), depth = 0, end = -1;
  for (let j = i; j < HTML.length; j++) {
    if (HTML[j] === '{') depth++;
    else if (HTML[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  return HTML.slice(at, end);
}

const M_LAT = 110540, M_LON = 111320 * Math.cos(51.5 * Math.PI / 180);
const toWorld = (lon, lat) => ({ x: lon * M_LON, z: -lat * M_LAT });
const worldToLatLon = (x, z) => ({ lat: -z / M_LAT, lon: x / M_LON });

function build(model, ring) {
  const S = { toWorld, worldToLatLon, MODEL_MASSED: [], ringsOf: () => [{ role: 'outer', pts: ring }] };
  const src = [extract('orientedBox'), extract('bboxOf'), extract('modelParts')].join('\n');
  const make = new Function('S',
    'const {toWorld, worldToLatLon, MODEL_MASSED} = S;' +
    'let ringsOf = S.ringsOf;' + src + '\n return modelParts;');
  /* Closed, first point repeated. modelParts uses e.geometry as-is for an
     on:"footprint" part with no `plan` and drops anything under four points,
     so an unclosed ring loses the base of the tower and keeps everything
     above it — which is a floating building, and took a while to spot. */
  const g = ring.map(p => worldToLatLon(p.x, p.z));
  g.push(g[0]);
  return make(S)({ type: 'way', id: 1, geometry: g }, model);
}

/* A regular-ish polygon of a given area, as a stand-in footprint. */
function polygon(cx, cz, area, n, squash) {
  const r = Math.sqrt(area / (n * Math.sin(2 * Math.PI / n) / 2));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i + 0.5) / n * Math.PI * 2;
    pts.push({ x: cx + Math.cos(th) * r, z: cz + Math.sin(th) * r * (squash || 1) });
  }
  return pts;
}

/* --- the drawing ------------------------------------------------------- */
function elevation(parts, opts) {
  const W = opts.width || 900, H = opts.height || 620, pad = 46;
  const boxes = [];
  let top = 0, minU = Infinity, maxU = -Infinity;
  for (const p of parts) {
    const g = p.geometry.slice(0, -1);
    let u0 = Infinity, u1 = -Infinity, cx = 0, cz = 0;
    for (const q of g) { cx += q.lon * M_LON; cz += -q.lat * M_LAT; }
    cx /= g.length; cz /= g.length;
    for (const q of g) {
      const u = (q.lon * M_LON - opts.cx) * opts.ux + (-q.lat * M_LAT - opts.cz) * opts.uz;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
    }
    const min = parseFloat(p.tags.min_height || '0');
    const hgt = parseFloat(p.tags.height || '0');
    const tap = parseFloat(p.tags['tf:taper'] || '1');
    const s = isFinite(tap) && tap > 0.005 && tap < 0.995 ? tap : 1;
    /* the part's centre along the view axis, which is what it tapers toward */
    const mu = (cx - opts.cx) * opts.ux + (cz - opts.cz) * opts.uz;
    boxes.push({ u0, u1, mu, min, hgt, s, mat: p.tags['building:material'] || '' });
    if (hgt > top) top = hgt;
    if (u0 < minU) minU = u0; if (u1 > maxU) maxU = u1;
  }
  const spanU = Math.max(maxU - minU, 1), spanY = Math.max(top, 1);
  const k = Math.min((W - 2 * pad) / spanU, (H - 2 * pad) / spanY);
  const X = u => pad + (u - minU) * k;
  const Y = y => H - pad - y * k;

  const col = { stone: '#8d8377', metal: '#5b6570', glass: '#93b0c4', '': '#9aa0a6' };
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" '
    + 'viewBox="0 0 ' + W + ' ' + H + '" font-family="system-ui,sans-serif">'
    + '<rect width="' + W + '" height="' + H + '" fill="#f4f2ee"/>';
  /* a ground line and a height scale, because a silhouette with no scale on it
     is how a 310 m tower and a 31 m one look identical */
  svg += '<line x1="0" y1="' + Y(0) + '" x2="' + W + '" y2="' + Y(0) + '" stroke="#c9c4bb"/>';
  const stepY = spanY > 200 ? 50 : spanY > 60 ? 20 : 5;
  for (let y = 0; y <= top; y += stepY) {
    svg += '<line x1="' + (pad - 8) + '" y1="' + Y(y) + '" x2="' + W + '" y2="' + Y(y)
        + '" stroke="#e2ded6"/>'
        + '<text x="4" y="' + (Y(y) + 4) + '" font-size="11" fill="#8a857c">' + y + '</text>';
  }
  for (const b of boxes) {
    const hw0 = (b.u1 - b.u0) / 2, hw1 = hw0 * b.s;
    const x0b = X(b.mu - hw0), x1b = X(b.mu + hw0);
    const x0t = X(b.mu - hw1), x1t = X(b.mu + hw1);
    svg += '<polygon points="' + [[x0b, Y(b.min)], [x1b, Y(b.min)], [x1t, Y(b.hgt)], [x0t, Y(b.hgt)]]
      .map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
      + '" fill="' + (col[b.mat] || col['']) + '" fill-opacity="0.82" stroke="#3c3a36" stroke-width="0.6"/>';
  }
  svg += '<text x="' + pad + '" y="26" font-size="15" fill="#3c3a36">' + opts.title + '</text>';
  svg += '<text x="' + pad + '" y="44" font-size="11" fill="#8a857c">'
      + parts.length + ' parts · tallest ' + top.toFixed(1) + ' m · metres on the left</text>';
  return svg + '</svg>';
}

/* --- what to draw ------------------------------------------------------ */
const id = process.argv[2];
if (!id) { console.error('usage: node models/elevation.js <model-id> [--area N] [--span N] [--out FILE]'); process.exit(2); }
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };

let model = null;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.json')))
  for (const m of JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')).models || [])
    if (m.id === id) model = m;
if (!model) { console.error('no model with id ' + id); process.exit(2); }

const cx = 0, cz = 0;
let ring, ux = 1, uz = 0;
if (arg('span')) {                       /* a bridge: a long thin outline */
  const len = parseFloat(arg('span')), wide = parseFloat(arg('wide') || '14');
  ring = [{ x: -len / 2, z: -wide / 2 }, { x: len / 2, z: -wide / 2 },
          { x: len / 2, z: wide / 2 }, { x: -len / 2, z: wide / 2 }];
} else {
  ring = polygon(cx, cz, parseFloat(arg('area') || '1400'), parseInt(arg('sides') || '3', 10), 1);
}
const parts = build(model, ring);
const svg = elevation(parts, { cx, cz, ux, uz, title: model.name + ' — elevation' });
const out = arg('out') || path.join('/tmp', id + '.svg');
fs.writeFileSync(out, svg);
console.log(model.name + ': ' + parts.length + ' parts -> ' + out);
