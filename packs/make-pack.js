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
const ID = arg('id').toLowerCase().replace(/[^a-z0-9-]/g, '');
const NAME = arg('name');
const RADIUS = +arg('radius', '5200');

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

/* ---- OSGB36 / British National Grid -> WGS84 ----
   Inverse Transverse Mercator on the Airy ellipsoid, then a 7-parameter
   Helmert shift. Good to a few metres, which is inside the width of a wall
   at the zoom levels the sim flies at. If you exported with
   `ogr2ogr -t_srs EPSG:4326` this code never runs. */
function bngToWgs84(E, N) {
  const a = 6377563.396, b = 6356256.909;            // Airy 1830
  const F0 = 0.9996012717, lat0 = 49 * Math.PI / 180, lon0 = -2 * Math.PI / 180;
  const N0 = -100000, E0 = 400000;
  const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b);

  let lat = lat0, M = 0;
  do {
    lat = (N - N0 - M) / (a * F0) + lat;
    const dl = lat - lat0, sl = lat + lat0;
    M = b * F0 * (
      (1 + n + 1.25 * n * n + 1.25 * n * n * n) * dl
      - (3 * n + 3 * n * n + 2.625 * n * n * n) * Math.sin(dl) * Math.cos(sl)
      + (1.875 * n * n + 1.875 * n * n * n) * Math.sin(2 * dl) * Math.cos(2 * sl)
      - (35 / 24) * n * n * n * Math.sin(3 * dl) * Math.cos(3 * sl));
  } while (Math.abs(N - N0 - M) >= 1e-5);

  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = Math.tan(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const t2 = tanLat * tanLat, t4 = t2 * t2;
  const VII = tanLat / (2 * rho * nu);
  const VIII = tanLat / (24 * rho * nu ** 3) * (5 + 3 * t2 + eta2 - 9 * t2 * eta2);
  const IX = tanLat / (720 * rho * nu ** 5) * (61 + 90 * t2 + 45 * t4);
  const X = 1 / (cosLat * nu);
  const XI = 1 / (cosLat * 6 * nu ** 3) * (nu / rho + 2 * t2);
  const XII = 1 / (cosLat * 120 * nu ** 5) * (5 + 28 * t2 + 24 * t4);
  const XIIA = 1 / (cosLat * 5040 * nu ** 7) * (61 + 662 * t2 + 1320 * t4 + 720 * t4 * t2);
  const dE = E - E0;
  const latR = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const lonR = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;

  // geodetic -> cartesian on Airy
  const sinP = Math.sin(latR), cosP = Math.cos(latR);
  const nu2 = a / Math.sqrt(1 - e2 * sinP * sinP);
  let x = nu2 * cosP * Math.cos(lonR), y = nu2 * cosP * Math.sin(lonR), z = (1 - e2) * nu2 * sinP;

  // Helmert OSGB36 -> WGS84
  const tx = 446.448, ty = -125.157, tz = 542.060;
  const rx = 0.1502 / 3600 * Math.PI / 180, ry = 0.2470 / 3600 * Math.PI / 180, rz = 0.8421 / 3600 * Math.PI / 180;
  const sc = 1 + (-20.4894e-6);
  const x2 = tx + sc * (x - rz * y + ry * z);
  const y2 = ty + sc * (rz * x + y - rx * z);
  const z2 = tz + sc * (-ry * x + rx * y + z);

  // cartesian -> geodetic on WGS84
  const aw = 6378137, bw = 6356752.3142, e2w = 1 - (bw * bw) / (aw * aw);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let phi = Math.atan2(z2, p * (1 - e2w)), phi0;
  do {
    phi0 = phi;
    const nu3 = aw / Math.sqrt(1 - e2w * Math.sin(phi) * Math.sin(phi));
    phi = Math.atan2(z2 + e2w * nu3 * Math.sin(phi), p);
  } while (Math.abs(phi - phi0) > 1e-11);
  return { lat: phi * 180 / Math.PI, lon: Math.atan2(y2, x2) * 180 / Math.PI };
}

/* ---- read, clip, encode ---- */
async function main() {
const [clat, clon] = await centre();
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

const mLat = 110540, mLon = 111320 * Math.cos(clat * Math.PI / 180);
const S = clat - RADIUS / mLat, Nn = clat + RADIUS / mLat;
const W = clon - RADIUS / mLon, E = clon + RADIUS / mLon;

const Q = 1e6;
const rings = [];
let dropped = 0, converted = 0;

function pushRing(coords) {
  /* outer ring only: the sim draws pack footprints as solid buildings and a
     courtyard hole in a filled-gap building is not worth the bytes */
  const pts = [];
  for (const c of coords) {
    let lat, lon;
    if (isBNG) { const w = bngToWgs84(c[0], c[1]); lat = w.lat; lon = w.lon; converted++; }
    else { lon = c[0]; lat = c[1]; }
    pts.push([lat, lon]);
  }
  const c0 = pts[0];
  if (c0[0] < S || c0[0] > Nn || c0[1] < W || c0[1] > E) { dropped++; return; }
  /* drop closing duplicate, quantize, delta-encode */
  if (pts.length > 1 &&
      Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 &&
      Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
  if (pts.length < 3) { dropped++; return; }
  const out = [Math.round(pts[0][0] * Q), Math.round(pts[0][1] * Q)];
  let plat = out[0], plon = out[1];
  for (let i = 1; i < pts.length; i++) {
    const qa = Math.round(pts[i][0] * Q), qo = Math.round(pts[i][1] * Q);
    out.push(qa - plat, qo - plon);
    plat = qa; plon = qo;
  }
  rings.push(out);
}

for (const f of feats) {
  const g = f.geometry;
  if (!g) continue;
  if (g.type === 'Polygon') pushRing(g.coordinates[0]);
  else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) pushRing(poly[0]);
}

const pack = {
  id: ID, name: NAME, centre: [clat, clon], bbox: [S, W, Nn, E], q: Q,
  source: 'OS OpenMap Local. Contains OS data (c) Crown copyright and database right ' +
          new Date().getFullYear() + '. Open Government Licence v3.',
  updated: new Date().toISOString().slice(0, 10),
  buildings: rings
};
const js = 'TF_PACK(' + JSON.stringify(pack) + ');\n';
const outFile = path.join(__dirname, ID + '.js');
fs.writeFileSync(outFile, js);
console.log('kept:   ' + rings.length + ' footprints inside ' + (2 * RADIUS / 1000) + ' km square' +
  '  (dropped ' + dropped + ' outside)');
console.log('wrote:  ' + outFile + '  (' + Math.round(js.length / 1024) + ' KB)');

/* ---- manifest inside index.html ---- */
const HTML = path.join(__dirname, '..', 'index.html');
const OPEN = '/* PACKS-START */', CLOSE = '/* PACKS-END */';
const html = fs.readFileSync(HTML, 'utf8');
const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
if (a < 0 || b < 0) { console.error('markers not found in index.html'); process.exit(1); }
const between = html.slice(a + OPEN.length, b);
const m = between.match(/var PACKS = (\[[\s\S]*?\]);/);
let manifest = [];
try { manifest = m ? JSON.parse(m[1]) : []; } catch (e) { manifest = []; }
manifest = manifest.filter(p => p.id !== ID);
manifest.push({ id: ID, name: NAME, file: ID + '.js', bbox: [S, W, Nn, E], n: rings.length });
const block = OPEN + '\nvar PACKS = ' + JSON.stringify(manifest) + ';\n' + CLOSE;
fs.writeFileSync(HTML, html.slice(0, a) + block + html.slice(b + CLOSE.length));
console.log('manifest: ' + manifest.map(p => p.id + ' (' + p.n + ')').join(', '));
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
