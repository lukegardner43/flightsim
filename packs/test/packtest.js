/* Can the pack hold a tower?

     node packs/test/packtest.js

   One integer carries a building's eaves, its roof height, its ridge bearing
   and its roof shape. Eaves had ten bits of decimetres, which stops at
   102.3 m, and roof height eight, which stops at 25.5 — so the tallest thing
   the format could describe was 127.8 m.

   Building the four tiles around Old Street found eight buildings at exactly
   127.8 m. That is not eight buildings of the same height, it is the ceiling:
   the Shard is 310 m, 22 Bishopsgate is 278, Heron Tower is 230, and all of
   them came back as the same number.

   Bit 29 now says the two height fields are HALF-METRES, which reaches
   511.5 m. It costs 0.4 m of precision on a building nobody measures to the
   decimetre from the air, and it is clear on every pack built before it, so
   those decode exactly as they did.

   This is the only test that reads make-heights.js as text: packHeight is
   internal to a CLI and exporting it just for a test would change the shape
   of the module to suit the test rather than the job. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'packs', 'make-heights.js'), 'utf8');
const m = src.match(/function packHeight\(f\)[\s\S]*?\n\}/);
if (!m) { console.log('FAIL  could not find packHeight in make-heights.js'); process.exit(1); }
const SHAPE_CODE = { flat:1, gabled:2, hipped:3, pyramidal:4 };
const packHeight = eval('(' + m[0].replace('function packHeight', 'function') + ')');

/* the decoder the sim uses, lifted from index.html so the two cannot drift */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dm = html.match(/function lidarUnpack\(v\)\{[\s\S]*?\n\}/);
if (!dm) { console.log('FAIL  could not find lidarUnpack in index.html'); process.exit(1); }
const lidarUnpack = eval('(' + dm[0].replace('function lidarUnpack', 'function') + ')');

const cases = [
  ['a bungalow',            2.4,  1.8, 0.05],
  ['a two-storey house',    5.2,  3.4, 0.05],
  ['a mansion block',      18.0,  2.0, 0.05],
  ['just under the old cap',102.0,25.0, 0.05],
  ['just over it',         102.4, 25.6, 0.30],
  ['Heron Tower',          220.0, 10.0, 0.30],
  ['the Shard',            240.0, 70.0, 0.30],
  ['taller than anything', 500.0,  0.0, 0.30]
];
let pass = 0;
for (const [name, e, r, tol] of cases) {
  const v = packHeight({ ok:true, eaves:e, roofH:r, bearing:137, shape:'hipped' });
  const d = lidarUnpack(v);
  const ok = Math.abs(d.eaves - e) <= tol && Math.abs(d.roofH - r) <= tol &&
             d.bearing === 137 && d.shape === SHAPE_CODE.hipped;
  if (ok) pass++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(24) +
    (e + r).toFixed(1).padStart(6) + ' m  ->  ' + (d.eaves + d.roofH).toFixed(1).padStart(6) +
    ' m   bearing ' + d.bearing + '  shape ' + d.shape);
}
/* and the thing that started it: two towers of different heights must not
   come back as the same number */
const a = packHeight({ ok:true, eaves:240, roofH:70, bearing:0, shape:'flat' });
const b = packHeight({ ok:true, eaves:200, roofH:30, bearing:0, shape:'flat' });
const distinct = lidarUnpack(a).eaves !== lidarUnpack(b).eaves;
if (distinct) pass++;
console.log((distinct ? 'PASS  ' : 'FAIL  ') + 'two different towers stay different'.padEnd(24) +
  '  ' + (lidarUnpack(a).eaves + lidarUnpack(a).roofH).toFixed(1) + ' m and ' +
  (lidarUnpack(b).eaves + lidarUnpack(b).roofH).toFixed(1) + ' m');

console.log('\n' + pass + '/' + (cases.length + 1) + ' passed');
process.exit(pass === cases.length + 1 ? 0 : 1);
