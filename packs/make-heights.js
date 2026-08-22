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

   --dsm and --dtm are RAW Float32 grids, little-endian, square, one metre
   pixels, north-west corner at the tile origin. That is what the workflow's
   gdalwarp produces, and taking the geometry from the tile id rather than
   from a header removes a whole class of silent misalignment.

   --origin E,N and --size cover the case where only part of a tile was
   fetched: measuring a 2 km square takes a minute where the whole tile takes
   half an hour, which is the difference between finding out whether this is
   worth doing and waiting to find out.

   Data: Environment Agency LIDAR Composite DSM/DTM 1 m, OGL v3.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { bng, tileOrigin, bngToWgs84 } = require('./grid-square.js');
const { fitRoof, fitParts, orientedBox, pip, pct } = require('./roof-fit.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name); process.exit(1);
  }
  return process.argv[i + 1];
}
const TILE = arg('tile').toUpperCase();
/* where the raster's north-west corner is, if not the tile's own */
const ORIGIN = arg('origin', '');
/* which pack file to annotate — normally the tile's own, but the original
   centre-mode packs are named after their postcode */
const PACK_ID = arg('pack', '').toLowerCase();
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

/* ---- reading the pack this tile already has ----
   Packs built in tile mode are named after their tile, but the original
   centre-mode ones are named after a postcode — so "the pack for TQ15" is
   not a filename you can assume. Asking every pack whether it covers the
   square is both cheaper and more reliable than making the caller know,
   and getting that wrong is exactly what failed the first run that
   otherwise worked end to end. */
function loadPack(f) {
  const m = /^TF_PACK\(([\s\S]*)\);\s*$/.exec(fs.readFileSync(f, 'utf8').trim());
  return m ? JSON.parse(m[1]) : null;
}
function readPack(id, box) {
  if (id) {
    const f = path.join(__dirname, id + '.js');
    if (!fs.existsSync(f)) { console.error('no pack at ' + f); process.exit(1); }
    const pack = loadPack(f);
    if (!pack) { console.error('cannot parse ' + f); process.exit(1); }
    return { file: f, pack: pack };
  }
  /* nobody said which, so find the one that covers this ground */
  const skip = /^(grid-square|make-pack|make-heights|plan-tiles|check-model-sites|roof-fit|wcs-service)\.js$/;
  const found = [];
  for (const name of fs.readdirSync(__dirname).sort()) {
    if (!name.endsWith('.js') || skip.test(name)) continue;
    let pack = null;
    try { pack = loadPack(path.join(__dirname, name)); } catch (e) { continue; }
    if (!pack || !pack.buildings || !pack.bbox) continue;
    const b = pack.bbox;                        /* [minLat, minLon, maxLat, maxLon] */
    const overlaps = !(box.maxLat < b[0] || box.minLat > b[2] ||
                       box.maxLon < b[1] || box.minLon > b[3]);
    console.log('  pack ' + name.replace(/\.js$/, '') + ': ' +
                pack.buildings.length.toLocaleString() + ' footprints, ' +
                (overlaps ? 'covers this square' : 'elsewhere'));
    if (overlaps) found.push({ file: path.join(__dirname, name), pack: pack,
                              n: pack.buildings.length,
                              exact: name === TILE.toLowerCase() + '.js' ? 1 : 0 });
  }
  if (!found.length) {
    console.error('no pack covers that square — build the footprints first ' +
                  '(Actions -> "Build building packs")');
    process.exit(1);
  }
  /* A pack named after the tile is the tile's pack and wins outright; only
     when there is no such thing does size decide, and then it is the one
     with most to say about this ground. */
  found.sort((a, b) => (b.exact - a.exact) || (b.n - a.n));
  if (found.length > 1)
    console.log('  chose ' + path.basename(found[0].file) + ' of ' + found.length + ' that overlap');
  return found[0];
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
/* A building's parts, as [axis bearing, t0|t1, height, t0|t1, height, ...].
   The fractions are along the axis, so the sim can rebuild the cut lines from
   the surveyed outline without knowing anything about the box this was
   measured in. */
function packParts(f) {
  if (!f || !f.parts || f.parts.length < 2) return 0;
  const out = [Math.max(0, Math.min(180, f.bearing))];
  for (const p of f.parts) {
    const h = packHeight(p);
    if (!h) return 0;                            /* all of it, or none */
    const t0 = Math.max(0, Math.min(255, Math.round(p.t0 * 255)));
    const t1 = Math.max(0, Math.min(255, Math.round(p.t1 * 255)));
    if (t1 <= t0) return 0;
    out.push(t0 | (t1 << 8), h);
  }
  return out;
}
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
  let o = tileOrigin(TILE);
  if (ORIGIN) {
    const v = ORIGIN.split(',').map(Number);
    if (v.length !== 2 || v.some(isNaN)) { console.error('--origin must be E,N'); process.exit(1); }
    o = { E: v[0], N: v[1] };
  }
  /* the square being measured, in degrees, so a pack can be asked whether
     it holds any of it */
  const c1 = bngToWgs84(o.E, o.N), c2 = bngToWgs84(o.E + N*PIX, o.N + N*PIX);
  const c3 = bngToWgs84(o.E, o.N + N*PIX), c4 = bngToWgs84(o.E + N*PIX, o.N);
  const box = {
    minLat: Math.min(c1.lat, c2.lat, c3.lat, c4.lat),
    maxLat: Math.max(c1.lat, c2.lat, c3.lat, c4.lat),
    minLon: Math.min(c1.lon, c2.lon, c3.lon, c4.lon),
    maxLon: Math.max(c1.lon, c2.lon, c3.lon, c4.lon)
  };
  const { file, pack } = readPack(PACK_ID, box);
  console.log('using ' + path.basename(file));
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
  const prev = pack.heights && pack.heights.length === pack.buildings.length ? pack.heights : [];
  const prevP = pack.parts && pack.parts.length === pack.buildings.length ? pack.parts : [];
  const heights = [], parts = [];
  const tally = { measured: 0, thin: 0, outside: 0, none: 0, split: 0, partN: 0 };
  const shapes = {};
  let sumEaves = 0;
  /* ---- what the surface actually looks like over a building ----

     A summary per building cannot tell you whether a reading is wrong or the
     roof is simply shallow, and the first version of this — the mean height
     against distance in from the wall — could not either. It came back as a
     smooth curve with no straight part anywhere, which is the signature of a
     SMOOTHED step rather than of a roof, but a 5.7 m eaves blurred over four
     metres and a 2.9 m eaves blurred over two produce the same curve. The
     mean cannot separate them.

     Two things can. First, percentiles rather than a mean: where a bin is a
     mixture of roof and ground it is wide, and where it is a surface it is
     tight. Second, and decisively, a ruler with no pitch in it — a FLAT roof
     of known height. Its profile can only be the edge blur, and normalising
     each one by its own height stacks buildings of every size onto one
     curve. Where that curve reaches 1.00 is how far the wall smears, full
     stop, and every other reading here can be judged against it. */
  function bins() { return { at: [], n: 0, seen: 0 }; }
  const PITCH = bins(), FLAT = bins(), RIDGE = bins();
  function add(p, k, v) { (p.at[k] || (p.at[k] = [])).push(v); }
  function walk(ring, fn) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of ring) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    for (let y = Math.floor(y0) + 0.5; y < y1; y += PIX)
      for (let x = Math.floor(x0) + 0.5; x < x1; x += PIX) {
        if (!pip(x, y, ring)) continue;
        const z = sample(x, y);
        if (isFinite(z)) fn(x, y, z);
      }
  }
  function profile(ring, f) {
    const box = orientedBox(ring);
    if (!box) return;
    const uLen = box.u1 - box.u0, vLen = box.v1 - box.v0, ar = uLen * vLen;
    const uv = (x, y) => [x * box.ux + y * box.uy - box.u0,
                          -x * box.uy + y * box.ux - box.v0];
    /* The ruler. It cannot be chosen by the fitter's own verdict, because a
       flat roof with a blurred edge has a slope on it and the fitter calls it
       gabled — forty synthetic flat blocks came back 88% gabled. So flatness
       is MEASURED instead, on a ring well inside the walls: a building wide
       enough to have a middle, whose middle is all one height, is a flat roof
       whatever anything else thinks, and its own middle height is the 1.00 to
       scale by. Nothing here assumes what the blur is; it only assumes that
       four metres in from the wall of a twenty metre building is roof. */
    const shortSide = Math.min(uLen, vLen);
    if (shortSide >= 12) {
      FLAT.seen++;
      const dist = [];
      walk(ring, (x, y, z) => {
        const [u, v] = uv(x, y);
        dist.push([Math.min(uLen / 2 - Math.abs(u - uLen / 2),
                            vLen / 2 - Math.abs(v - vLen / 2)), z]);
      });
      const mid = dist.filter(d => d[0] >= 3 && d[0] <= 7).map(d => d[1]);
      if (mid.length >= 20) {
        mid.sort((a, b) => a - b);
        const H = pct(mid, 0.5);
        if (pct(mid, 0.8) - pct(mid, 0.2) < 0.7 && H > 3) {
          FLAT.n++;
          for (const [w, z] of dist) if (w >= 0) add(FLAT, Math.round(w / 0.5), z / H);
          return;
        }
      }
    }
    /* and the thing in question: a house-sized footprint, measured across the
       short axis, which is the way a roof slopes.

       The ruler below must NOT be filtered by the fitted eaves, however
       tempting: the eaves reading is what is on trial, and selecting cases by
       it would decide the answer in advance. Everything the ruler reports is
       a fraction of the house's own ridge, so houses of every height stack
       without needing to be alike. Only the PITCH table, which is in metres
       and so has to compare like with like, keeps the two-storey window. */
    if (ar < 60 || ar > 250) return;
    const useU = uLen <= vLen, half = (useU ? uLen : vLen) / 2;
    const longLen = useU ? vLen : uLen;
    const twoStorey = f.eaves >= 4.5 && f.eaves <= 6.5;
    if (twoStorey) PITCH.n++;
    /* The second ruler, and the one there is no shortage of. ALONG a ridge a
       gabled roof is flat — the height depends only on how far across you
       are, not how far along — so the length of every ordinary house is a
       flat roof lying on its side, and the gable ends are its walls. That
       turns a handful of industrial sheds into hundreds of houses.

       A hipped roof does fall away at its ends and would read as blur, so
       the upper percentiles are what to look at: a hip drags the p20 down
       and leaves the p80 alone. */
    const keep = Math.max(1.0, half * 0.36);
    const band = [];
    walk(ring, (x, y, z) => {
      const p = uv(x, y), c = p[useU ? 0 : 1], a = p[useU ? 1 : 0];
      const w = half - Math.abs(c - half);
      if (w >= 0 && twoStorey) add(PITCH, Math.round(w / 0.5), z);
      if (Math.abs(c - half) <= keep) band.push([Math.min(a, longLen - a), z]);
    });
    const flat = band.filter(d => d[0] > 4).map(d => d[1]);
    if (flat.length >= 10) {
      flat.sort((p, q) => p - q);
      const H = pct(flat, 0.5);
      if (H > 3) {
        RIDGE.n++;
        for (const [d, z] of band) if (d >= 0) add(RIDGE, Math.round(d / 0.5), z / H);
      }
    }
  }
  function show(p, title, note, unit) {
    if (p.n < 8) {
      console.log('\n' + title + ': only ' + p.n + ' buildings qualified' +
                  (p.seen ? ' of ' + p.seen + ' considered' : '') + ', too few to read');
      return;
    }
    console.log('\n' + title + ', from ' + p.n.toLocaleString() + ' buildings');
    console.log(note);
    console.log('   in (m)     p20    p50    p80    p95   samples');
    for (let k = 0; k < p.at.length; k++) {
      const v = p.at[k];
      if (!v || v.length < 30) continue;
      v.sort((a, b) => a - b);
      console.log('    ' + (k * 0.5).toFixed(1).padStart(4) + '   ' +
        [0.2, 0.5, 0.8, 0.95].map(q => pct(v, q).toFixed(2).padStart(6)).join(' ') +
        '   ' + v.length.toLocaleString().padStart(7) + '  ' + unit(pct(v, 0.5)));
    }
  }
  for (const enc of pack.buildings) {
    const ll = decodeRing(enc, q);
    const ring = [];
    let bad = false;
    for (const [la, lo] of ll) {
      const b = bng(la, lo);
      if (!b) { bad = true; break; }
      ring.push([b.E, b.N]);
    }
    if (bad || ring.length < 3 || DRY) { heights.push(0); parts.push(0); tally.none++; continue; }
    /* outside the square that was fetched: leave whatever it had, so
       measuring a second square later adds to the first rather than
       wiping it */
    let inside = false;
    for (const [E, Nn] of ring)
      if (E >= o.E && E <= o.E + N*PIX && Nn >= o.N && Nn <= o.N + N*PIX) { inside = true; break; }
    if (!inside) {
      heights.push(prev[heights.length] || 0);
      parts.push(prevP[parts.length] || 0);
      tally.outside++; continue;
    }
    const f = fitRoof(ring, sample, { step: PIX });
    if (!f) { heights.push(0); parts.push(0); tally.none++; continue; }
    if (!f.ok) { heights.push(0); parts.push(0); if (f.n < 4) tally.thin++; else tally.none++; continue; }
    /* Half a footprint of data is half a measurement. Say so rather than
       quietly averaging a building with the field next to it. */
    if (f.fill < 0.45) { heights.push(0); parts.push(0); tally.thin++; continue; }
    const v = packHeight(f);
    heights.push(v);
    if (v) { tally.measured++; sumEaves += f.eaves; shapes[f.shape] = (shapes[f.shape] || 0) + 1;
             try { profile(ring, f); } catch (e) { /* diagnostics never fail a run */ } }
    else tally.none++;
    /* and the massing inside it: one height per building is a lie about most
       British houses, and the surface shows the step */
    let pv = 0;
    if (v) {
      try { pv = packParts(fitParts(ring, sample, { step: PIX })); } catch (e) { pv = 0; }
      if (pv) { tally.split++; tally.partN += (pv.length - 1) / 2; }
    }
    parts.push(pv);
  }
  pack.heights = heights;
  if (parts.some(p => p)) pack.parts = parts; else delete pack.parts;
  pack.heightSource = 'Environment Agency LIDAR Composite DSM/DTM 1 m. ' +
    'Contains public sector information licensed under the Open Government Licence v3.';
  pack.heightBuilt = new Date().toISOString().slice(0, 10);

  const pctM = (tally.measured / pack.buildings.length * 100).toFixed(1);
  console.log('measured ' + tally.measured.toLocaleString() + ' of ' +
              pack.buildings.length.toLocaleString() + ' (' + pctM + '%)' +
              ', too little data ' + tally.thin.toLocaleString() +
              ', no reading ' + tally.none.toLocaleString() +
              (tally.outside ? ', ' + tally.outside.toLocaleString() + ' outside the square fetched' +
                (prev.length ? ' (kept what they had)' : '') : ''));
  if (tally.measured) {
    console.log('mean eaves ' + (sumEaves / tally.measured).toFixed(2) + ' m');
    console.log('massing: ' + tally.split.toLocaleString() + ' of them are more than one box (' +
                (tally.split / tally.measured * 100).toFixed(0) + '%), ' +
                tally.partN.toLocaleString() + ' parts in all');
    console.log('roof shapes ' + Object.keys(shapes).sort((a, b) => shapes[b] - shapes[a])
      .map(k => k + ' ' + (shapes[k] / tally.measured * 100).toFixed(0) + '%').join(', '));
  }
  show(FLAT, 'the edge blur, measured on flat roofs',
       'height as a fraction of that roof\'s own height, so buildings of every\n' +
       'size stack; where it reaches 1.00 is how far in the wall smears',
       m => '#'.repeat(Math.max(0, Math.round(m * 30))));
  show(RIDGE, 'the edge blur, measured along the ridges of houses',
       'height as a fraction of that ridge\'s own height, against distance in\n' +
       'from the gable end; look at p80, which a hipped roof cannot drag down',
       m => '#'.repeat(Math.max(0, Math.round(m * 30))));
  show(PITCH, 'the surface over a two-storey house',
       'metres above ground, across the short axis, which is the way a roof slopes',
       m => '#'.repeat(Math.max(0, Math.round(m * 4))));
  if (DRY) { console.log('dry run: nothing written'); return; }
  fs.writeFileSync(file, 'TF_PACK(' + JSON.stringify(pack) + ');\n');
  console.log('wrote ' + file + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
}
main();
