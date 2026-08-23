/* Does `fill` measure how much of the building was SEEN, or how nearly
   rectangular it is?

     node packs/test/filltest.js

   make-heights throws away any footprint whose fill is under 0.45, on the
   grounds that "half a footprint of data is half a measurement". That is the
   right rule. It was being applied to the wrong number: fill divided the
   samples by the axis-aligned BOUNDING BOX, so a perfectly surveyed barn at
   45 degrees scored 0.5 and a courtyard building less, however complete the
   data was. Ten of the sixteen landmark models still had no reading after a
   whole tile was measured, and every one of them has wings.

   So: four buildings the laser saw completely and one it half missed. The
   first four must pass the gate whatever shape they are; the fifth must not.
*/
const { fitRoof } = require('../roof-fit.js');
const GATE = 0.45;                      /* make-heights.js:384 */

function rect(cx, cy, w, d, ang){
  const c = Math.cos(ang), s = Math.sin(ang), out = [];
  for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]])
    out.push([cx + (sx*w/2)*c - (sy*d/2)*s, cy + (sx*w/2)*s + (sy*d/2)*c]);
  return out;
}
/* an L: a 20x10 range with a 10x10 wing off one end, so it covers 60% of its
   own bounding box — a country house, or half the farm buildings in Surrey */
function ell(cx, cy){
  return [[cx-10,cy-5],[cx+10,cy-5],[cx+10,cy+5],[cx,cy+5],[cx,cy+15],[cx-10,cy+15]];
}
/* flat roof at 6 m, with a hole in the data where `miss` says so */
function surface(miss){
  return (X, Y) => (miss && miss(X, Y)) ? NaN : 6.0;
}

const cases = [
  ['square to north',  rect(500,500,20,12,0),          null,                       true ],
  ['at 45 degrees',    rect(500,500,20,12,Math.PI/4),  null,                       true ],
  ['at 30 degrees',    rect(500,500,26,9,Math.PI/6),   null,                       true ],
  ['L-shaped',         ell(500,500),                   null,                       true ],
  ['70% not surveyed', rect(500,500,20,12,0),          (X)=>X > 494,               false]
];

let pass = 0;
for (const [name, ring, miss, want] of cases) {
  const f = fitRoof(ring, surface(miss), { step: 1 });
  const fill = f && f.ok ? f.fill : 0;
  const got = fill >= GATE;
  const ok = got === want;
  if (ok) pass++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(18) +
              'fill ' + fill.toFixed(2) + '  ' +
              (got ? 'measured' : 'thrown away') +
              (ok ? '' : '   <-- wanted it ' + (want ? 'measured' : 'thrown away')));
}
console.log('\n' + pass + '/' + cases.length + ' passed');
process.exit(pass === cases.length ? 0 : 1);
