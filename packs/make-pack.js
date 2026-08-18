#!/usr/bin/env node
/* Builds a local building pack from OS OpenMap Local, Ordnance Survey's free
   surveyed building-footprint layer for Great Britain (OGL v3 — attribution
   required, see README.md in this directory).

   You should not need to run this by hand. The supported route is the
   Actions tab of this repository -> "Build a building pack" -> type a
   postcode; the workflow does the downloading and converting on GitHub's
   machine and commits the result. See README.md in this directory.

   This script takes GeoJSON, clips it to a square around a centre point,
   converts British National Grid coordinates to WGS84 if the export did not,
   delta-encodes the rings, and writes packs/<id>.js plus the manifest entry
   inside index.html.

   Usage:
     node packs/make-pack.js --in buildings.geojson --id kt23 \
          --name "Great Bookham" --postcode "KT23 3HP" [--radius 5200]

   --centre lat,lon works instead of --postcode. --in takes a comma-separated
   list if the data arrived in several files.
*/
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name);
    process.exit(1);
  }
  return process.argv[i + 1];
}

const IN = arg('in').split(',').map(f => f.trim()).filter(Boolean);
/* Two shapes of pack.

   --tiles TQ14,TQ15   one pack per 10 km Ordnance Survey tile. Tiles do not
                       overlap, so two nearby places share their coverage
                       instead of each carrying a square of its own, and
                       building a second postcode nearby costs only the tiles
                       it adds. This is the one to use.

   --id/--centre       one pack centred on a point, the original shape. Still
                       read by the sim, still built by nothing.
*/
const TILES = arg('tiles', '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
const ID = TILES.length ? '' : arg('id').toLowerCase().replace(/[^a-z0-9-]/g, '');
const NAME = TILES.length ? '' : arg('name');
const RADIUS = +arg('radius', '5200');
const { bng, tileOrigin, bngToWgs84 } = require('./grid-square.js');

/* --centre lat,lon, or --postcode which is resolved through postcodes.io
   (that is what the GitHub Actions workflow uses, so nobody has to know
   their own latitude). */
async function centre() {
  const c = arg('centre', '');
  if (c) {
    const v = c.split(',').map(Number);
    if (v.length !== 2 || v.some(isNaN)) { console.error('--centre must be lat,lon'); process.exit(1); }
    return v;
  }
  const pc = arg('postcode', '');
  if (!pc) { console.error('give either --centre lat,lon or --postcode'); process.exit(1); }
  const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc));
  const j = await r.json();
  if (!j.result || j.result.latitude == null) { console.error('postcode not found: ' + pc); process.exit(1); }
  console.log('postcode ' + j.result.postcode + ' -> ' + j.result.latitude + ',' + j.result.longitude);
  return [j.result.latitude, j.result.longitude];
}

/* ---- read, encode, write ---- */
const Q = 1e6;

/* A ring becomes: first point at 1e-6 degrees, then differences. About ten
   centimetres of resolution and roughly 45 bytes a building. */
function encodeRing(pts) {
  if (pts.length > 1 &&
      Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 &&
      Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
  if (pts.length < 3) return null;
  const out = [Math.round(pts[0][0] * Q), Math.round(pts[0][1] * Q)];
  let plat = out[0], plon = out[1];
  for (let i = 1; i < pts.length; i++) {
    const qa = Math.round(pts[i][0] * Q), qo = Math.round(pts[i][1] * Q);
    out.push(qa - plat, qo - plon);
    plat = qa; plon = qo;
  }
  return out;
}

function readManifest(HTML) {
  const OPEN = '/* PACKS-START */', CLOSE = '/* PACKS-END */';
  const html = fs.readFileSync(HTML, 'utf8');
  const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
  if (a < 0 || b < 0) { console.error('markers not found in index.html'); process.exit(1); }
  const m = html.slice(a + OPEN.length, b).match(/var PACKS = (\[[\s\S]*?\]);/);
  let manifest = [];
  try { manifest = m ? JSON.parse(m[1]) : []; } catch (e) { manifest = []; }
  return { html, a, b, OPEN, CLOSE, manifest };
}
function writeManifest(HTML, st, manifest) {
  manifest.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const block = st.OPEN + '\nvar PACKS = ' + JSON.stringify(manifest) + ';\n' + st.CLOSE;
  fs.writeFileSync(HTML, st.html.slice(0, st.a) + block + st.html.slice(st.b + st.CLOSE.length));
  console.log('manifest: ' + manifest.length + ' packs, ' +
    manifest.reduce((t, p) => t + p.n, 0).toLocaleString() + ' footprints in all');
}

async function main() {
let feats = [];
for (const f of IN) {
  const gj = JSON.parse(fs.readFileSync(f, 'utf8'));
  feats = feats.concat(gj.features || []);
}
if (!feats.length) { console.error('no features in ' + IN.join(',')); process.exit(1); }

/* BNG eastings are 6-figure metres; longitudes are small. */
function firstCoord(g) {
  let c = g.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return c;
}
const sample = firstCoord(feats[0].geometry);
const isBNG = Math.abs(sample[0]) > 180 || Math.abs(sample[1]) > 90;
console.log('input:  ' + feats.length + ' features, coordinates look like ' +
  (isBNG ? 'British National Grid (will convert)' : 'WGS84'));

let converted = 0;
function toLatLon(coords) {
  const pts = [];
  for (const c of coords) {
    if (isBNG) { const w = bngToWgs84(c[0], c[1]); pts.push([w.lat, w.lon]); converted++; }
    else pts.push([c[1], c[0]]);
  }
  return pts;
}
function eachRing(fn) {
  for (const f of feats) {
    const g = f.geometry;
    if (!g) continue;
    /* outer ring only: the sim draws pack footprints as solid buildings and a
       courtyard hole in a filled-gap building is not worth the bytes */
    if (g.type === 'Polygon') fn(toLatLon(g.coordinates[0]));
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) fn(toLatLon(poly[0]));
  }
}

const SOURCE = 'OS OpenMap Local. Contains OS data (c) Crown copyright and database right ' +
               new Date().getFullYear() + '. Open Government Licence v3.';
const TODAY = new Date().toISOString().slice(0, 10);
const HTML = path.join(__dirname, '..', 'index.html');

/* ============================ tile mode ============================ */
if (TILES.length) {
  const want = new Set(TILES);
  const byTile = {};
  const seen = {};
  let outside = 0, duplicated = 0, bad = 0;
  for (const t of TILES) { byTile[t] = []; seen[t] = new Set(); }

  eachRing(pts => {
    if (!pts.length) { bad++; return; }
    /* Which tile a footprint belongs to is decided in British National Grid,
       on its first corner, so the tiles partition the country exactly and
       nothing is drawn twice where two of them meet. */
    const b = bng(pts[0][0], pts[0][1]);
    if (!b) { bad++; return; }
    if (!want.has(b.tile)) { outside++; return; }
    const enc = encodeRing(pts.slice());
    if (!enc) { bad++; return; }
    const key = enc.join(',');
    if (seen[b.tile].has(key)) { duplicated++; return; }   /* OS ships some buildings twice */
    seen[b.tile].add(key);
    byTile[b.tile].push(enc);
  });

  const st = readManifest(HTML);
  let manifest = st.manifest;
  let wrote = 0, total = 0;
  for (const t of TILES) {
    const rings = byTile[t];
    const id = t.toLowerCase();
    if (!rings.length) { console.log('  ' + t + ': empty, no pack written'); continue; }
    const o = tileOrigin(t);
    const sw = bngToWgs84(o.E, o.N), ne = bngToWgs84(o.E + 10000, o.N + 10000);
    const nw = bngToWgs84(o.E, o.N + 10000), se = bngToWgs84(o.E + 10000, o.N);
    const bbox = [Math.min(sw.lat, se.lat), Math.min(sw.lon, nw.lon),
                  Math.max(nw.lat, ne.lat), Math.max(ne.lon, se.lon)];
    const pack = { id: id, tile: t, name: t, bbox: bbox, q: Q,
                   source: SOURCE, updated: TODAY, buildings: rings };
    const js = 'TF_PACK(' + JSON.stringify(pack) + ');\n';
    fs.writeFileSync(path.join(__dirname, id + '.js'), js);
    manifest = manifest.filter(p => p.id !== id);
    manifest.push({ id: id, tile: t, name: t, file: id + '.js', bbox: bbox, n: rings.length });
    console.log('  ' + t + ': ' + rings.length.toLocaleString() + ' footprints, ' +
      Math.round(js.length / 1024) + ' KB');
    wrote++; total += rings.length;
  }
  console.log('wrote:  ' + wrote + ' tile pack' + (wrote === 1 ? '' : 's') + ', ' +
    total.toLocaleString() + ' footprints' +
    '  (' + outside.toLocaleString() + ' outside the requested tiles, ' +
    duplicated + ' duplicated between OS layers, ' + bad + ' unusable)');
  writeManifest(HTML, st, manifest);
  return;
}

/* ======================= one square, the old way ======================= */
const [clat, clon] = await centre();
const mLat = 110540, mLon = 111320 * Math.cos(clat * Math.PI / 180);
const S = clat - RADIUS / mLat, Nn = clat + RADIUS / mLat;
const W = clon - RADIUS / mLon, E = clon + RADIUS / mLon;
const rings = [];
const seenRing = new Set();
let dropped = 0, duplicated = 0;

eachRing(pts => {
  const c0 = pts[0];
  if (!c0 || c0[0] < S || c0[0] > Nn || c0[1] < W || c0[1] > E) { dropped++; return; }
  const enc = encodeRing(pts.slice());
  if (!enc) { dropped++; return; }
  const key = enc.join(',');
  if (seenRing.has(key)) { duplicated++; return; }
  seenRing.add(key);
  rings.push(enc);
});

const pack = {
  id: ID, name: NAME, centre: [clat, clon], bbox: [S, W, Nn, E], q: Q,
  source: SOURCE, updated: TODAY, buildings: rings
};
const js = 'TF_PACK(' + JSON.stringify(pack) + ');\n';
const outFile = path.join(__dirname, ID + '.js');
fs.writeFileSync(outFile, js);
console.log('kept:   ' + rings.length + ' footprints inside ' + (2 * RADIUS / 1000) + ' km square' +
  '  (dropped ' + dropped + ' outside, ' + duplicated + ' duplicated between layers)');
console.log('wrote:  ' + outFile + '  (' + Math.round(js.length / 1024) + ' KB)');

const st = readManifest(HTML);
let manifest = st.manifest.filter(p => p.id !== ID);
manifest.push({ id: ID, name: NAME, file: ID + '.js', bbox: [S, W, Nn, E], n: rings.length });
writeManifest(HTML, st, manifest);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
