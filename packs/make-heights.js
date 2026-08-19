#!/usr/bin/env node
/* Measures every building in a 10 km tile against lidar, and writes the
   answers into that tile's pack.

   The sim guesses building heights. Where it has an AI profile it guesses
   better, but it is still a guess, and the report says so: those buildings
   are counted `estimated`, never `measured`. England has a 1 m lidar surface
   under an Open Government Licence covering about 99% of the country, which
   turns the guess into a measurement — and, because a surface has shape as
   well as height, tells you the roof form too.

   You should not need to run this by hand; the Actions tab does it. See
   README.md in this directory.

     node packs/make-heights.js --tile TQ15 --dsm dsm.img --dtm dtm.img

   --dsm and --dtm are RAW Float32 grids, little-endian, exactly 10000 x
   10000 samples, north-west corner at the tile origin, one metre pixels.
   That is what the workflow's gdalwarp produces, and taking the geometry
   from the tile id rather than from a header removes a whole class of
   silent misalignment.

   Data: Environment Agency LIDAR Composite DSM/DTM 1 m, OGL v3.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { bng, tileOrigin } = require('./grid-square.js');
const { fitRoof } = require('./roof-fit.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name); process.exit(1);
  }
  return process.argv[i + 1];
}
const TILE = arg('tile').toUpperCase();
/* which pack file to annotate — normally the tile's own, but the original
   centre-mode packs are named after their postcode */
const PACK_ID = arg('pack', '').toLowerCase() || TILE.toLowerCase();
const N = +arg('size', '10000');            /* samples across the tile */
const PIX = +arg('pixel', '1');             /* metres per sample */
const DRY = process.argv.includes('--dry-run');

/* ---- the surface ----
   DSM minus DTM, in decimetres, as one Int16 grid. Two Float32 grids of this
   size are 800 MB; the difference as Int16 is 200 MB, and a tenth of a metre
   is finer than the data is accurate. */
function normalise(dsmPath, dtmPath) {
  const need = N * N * 4;
  for (const f of [dsmPath, dtmPath]) {
    const st = fs.statSync(f);
    if (st.size !== need)
      throw new Error(f + ' is ' + st.size + ' bytes, expected ' + need +
                      ' (' + N + 'x' + N + ' float32). Check the gdalwarp extent.');
  }
  const out = new Int16Array(N * N);
  const ROWS = 250;                                  /* 10 MB a strip */
  const bufA = Buffer.allocUnsafe(ROWS * N * 4), bufB = Buffer.allocUnsafe(ROWS * N * 4);
  const fa = fs.openSync(dsmPath, 'r'), fb = fs.openSync(dtmPath, 'r');
  let noData = 0;
  for (let r0 = 0; r0 < N; r0 += ROWS) {
    const rows = Math.min(ROWS, N - r0), bytes = rows * N * 4;
    fs.readSync(fa, bufA, 0, bytes, r0 * N * 4);
    fs.readSync(fb, bufB, 0, bytes, r0 * N * 4);
    for (let i = 0; i < rows * N; i++) {
      const a = bufA.readFloatLE(i * 4), b = bufB.readFloatLE(i * 4);
      /* the EA writes -9999 for no data, and a few tiles carry NaN */
      if (!(a > -1000 && a < 5000) || !(b > -1000 && b < 5000)) { out[r0 * N + i] = -32768; noData++; continue; }
      let d = Math.round((a - b) * 10);
      if (d < -300) d = -300;                        /* a hole, not a basement */
      if (d > 32000) d = 32000;
      out[r0 * N + i] = d;
    }
  }
  fs.closeSync(fa); fs.closeSync(fb);
  return { grid: out, noData: noData };
}

/* ---- reading the pack this tile already has ---- */
function readPack(id) {
  const f = path.join(__dirname, id + '.js');
  if (!fs.existsSync(f)) { console.error('no pack at ' + f + ' — build the footprints first'); process.exit(1); }
  const src = fs.readFileSync(f, 'utf8');
  const m = /^TF_PACK\(([\s\S]*)\);\s*$/.exec(src.trim());
  if (!m) { console.error('cannot parse ' + f); process.exit(1); }
  return { file: f, pack: JSON.parse(m[1]) };
}
/* rings come back delta-encoded at 1e-6 degrees */
function decodeRing(enc, q) {
  const pts = [];
  let lat = enc[0], lon = enc[1];
  pts.push([lat / q, lon / q]);
  for (let i = 2; i < enc.length; i += 2) {
    lat += enc[i]; lon += enc[i + 1];
    pts.push([lat / q, lon / q]);
  }
  return pts;
}

/* ---- one number per building ----
   eaves in decimetres (0 = not measured), roof height in decimetres,
   ridge bearing in whole degrees (255 = none), and the shape. */
const SHAPE_CODE = { flat: 1, gabled: 2, hipped: 3, pyramidal: 4 };
function packHeight(f) {
  if (!f || !f.ok) return 0;
  let e = Math.round(f.eaves * 10), r = Math.round(f.roofH * 10);
  if (e < 1) return 0;
  if (e > 1023) e = 1023;
  if (r > 255) r = 255;
  if (r < 0) r = 0;
  const b = f.bearing == null ? 255 : Math.max(0, Math.min(180, f.bearing));
  const s = SHAPE_CODE[f.shape] || 0;
  return e | (r << 10) | (b << 18) | (s << 26);
}

function main() {
  const { file, pack } = readPack(PACK_ID);
  const o = tileOrigin(TILE);
  console.log(TILE + ': ' + pack.buildings.length.toLocaleString() + ' footprints, origin ' +
              o.E + ',' + o.N);

  let grid = null, noData = 0;
  if (!DRY) {
    const t0 = Date.now();
    const r = normalise(arg('dsm'), arg('dtm'));
    grid = r.grid; noData = r.noData;
    console.log('surface: ' + N + 'x' + N + ' at ' + PIX + ' m, ' +
                (noData / (N * N) * 100).toFixed(1) + '% no data, ' +
                ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  }
  /* Row 0 is the NORTH edge — that is how a raster is written and how
     gdalwarp emits it — so northing runs the other way from the row index. */
  function sample(E, Nn) {
    const cx = Math.floor((E - o.E) / PIX);
    const cy = Math.floor((o.N + N * PIX - Nn) / PIX);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return NaN;
    const v = grid[cy * N + cx];
    return v === -32768 ? NaN : v / 10;
  }

  const q = pack.q || 1e6;
  const heights = [];
  const tally = { measured: 0, thin: 0, outside: 0, none: 0 };
  const shapes = {};
  let sumEaves = 0;
  for (const enc of pack.buildings) {
    const ll = decodeRing(enc, q);
    const ring = [];
    let bad = false;
    for (const [la, lo] of ll) {
      const b = bng(la, lo);
      if (!b) { bad = true; break; }
      ring.push([b.E, b.N]);
    }
    if (bad || ring.length < 3 || DRY) { heights.push(0); tally.none++; continue; }
    const f = fitRoof(ring, sample, { step: PIX });
    if (!f) { heights.push(0); tally.none++; continue; }
    if (!f.ok) { heights.push(0); if (f.n < 4) tally.thin++; else tally.none++; continue; }
    /* Half a footprint of data is half a measurement. Say so rather than
       quietly averaging a building with the field next to it. */
    if (f.fill < 0.45) { heights.push(0); tally.thin++; continue; }
    const v = packHeight(f);
    heights.push(v);
    if (v) { tally.measured++; sumEaves += f.eaves; shapes[f.shape] = (shapes[f.shape] || 0) + 1; }
    else tally.none++;
  }
  pack.heights = heights;
  pack.heightSource = 'Environment Agency LIDAR Composite DSM/DTM 1 m. ' +
    'Contains public sector information licensed under the Open Government Licence v3.';
  pack.heightBuilt = new Date().toISOString().slice(0, 10);

  const pctM = (tally.measured / pack.buildings.length * 100).toFixed(1);
  console.log('measured ' + tally.measured.toLocaleString() + ' of ' +
              pack.buildings.length.toLocaleString() + ' (' + pctM + '%)' +
              ', too little data ' + tally.thin.toLocaleString() +
              ', no reading ' + tally.none.toLocaleString());
  if (tally.measured) {
    console.log('mean eaves ' + (sumEaves / tally.measured).toFixed(2) + ' m');
    console.log('roof shapes ' + Object.keys(shapes).sort((a, b) => shapes[b] - shapes[a])
      .map(k => k + ' ' + (shapes[k] / tally.measured * 100).toFixed(0) + '%').join(', '));
  }
  if (DRY) { console.log('dry run: nothing written'); return; }
  fs.writeFileSync(file, 'TF_PACK(' + JSON.stringify(pack) + ');\n');
  console.log('wrote ' + file + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
}
main();
