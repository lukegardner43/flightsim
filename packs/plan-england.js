#!/usr/bin/env node
/* Which 10 km tiles does England need, square by square.

     node packs/plan-england.js                 # every square, human readable
     node packs/plan-england.js --json          # the matrix for the workflow
     node packs/plan-england.js SU TQ --json    # just these

   The Environment Agency's 1 m composite covers England and nowhere else, so
   this lists England's Ordnance Survey 100 km squares and, in each, the
   hundred 10 km tiles it contains. Most of those tiles are sea, and a sea
   tile costs seconds: no Ordnance Survey buildings come back, so nothing is
   downloaded and nothing is measured. Filtering them out properly would want
   a coastline, and a coastline is a bigger dependency than the waste it
   saves.

   The squares below are the ones with English land in them. NT and NY carry
   the border and their northern tiles are Scotland — the lidar simply has no
   data there and those tiles come back empty, which is the same outcome as
   the sea. SN, SH, SM and the rest of Wales are left out: Natural Resources
   Wales publishes an equivalent surface through a different portal, and the
   dsm_url / dtm_url fallback on build-heights.yml is how that would be done.
*/
'use strict';
const SQUARES = [
  'NT','NU','NY','NZ',                   /* the north and the border */
  'SD','SE','TA',                        /* Lancashire, Yorkshire, Humber */
  'SJ','SK','TF','TG',                   /* the Midlands and East Anglia */
  'SO','SP','TL','TM',                   /* the Marches, the Chilterns, Essex */
  'SS','ST','SU','TQ','TR',              /* the South and the South East */
  'SV','SW','SX','SY','SZ'               /* the South West and the coast */
];
const args = process.argv.slice(2);
const json = args.includes('--json');
const want = args.filter(a => !a.startsWith('--')).map(a => a.toUpperCase());
const squares = want.length ? want : SQUARES;
const bad = squares.filter(s => !/^[A-Z]{2}$/.test(s));
if (bad.length) { console.error('not 100 km squares: ' + bad.join(' ')); process.exit(2); }

if (json) { console.log(JSON.stringify(squares)); process.exit(0); }
let n = 0;
for (const s of squares) {
  const tiles = [];
  for (let e = 0; e < 10; e++) for (let nn = 0; nn < 10; nn++) tiles.push(s + e + nn);
  n += tiles.length;
  console.log(s + '  ' + tiles.length + ' tiles  ' + tiles[0] + ' .. ' + tiles[tiles.length - 1]);
}
console.log('\n' + squares.length + ' squares, ' + n + ' tiles of 10 km.');
console.log('At about four minutes a tile that is ' + Math.round(n * 4 / 60) +
            ' hours of measuring, most of which is sea and costs seconds.');
