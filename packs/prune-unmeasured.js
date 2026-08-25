#!/usr/bin/env node
/* Drop the packs that are footprints with no lidar heights on them.

     node packs/prune-unmeasured.js            what it would remove
     node packs/prune-unmeasured.js --apply    remove it, rebuild the list
     node packs/prune-unmeasured.js --dir D    work on D instead of packs/

   The England build writes a pack for every tile of a grid square because
   the footprints are one Ordnance Survey download and cost seconds; only
   the measuring is limited by the runner's time budget. So a pass hands
   back about eight tiles in a hundred with heights and ninety-two with
   none, and committing all of them puts hundreds of megabytes of geometry
   in the repository to carry the few per cent worth keeping — which every
   later pass then rewrites, so git stores it again each time.

   packs/collect-packs.sh stops new ones arriving. This is the broom for
   what arrived before it existed.

   THE COST, because it is not nothing: an unmeasured footprint pack still
   draws buildings, at heights the sim estimates from area and class. That
   is a great deal better than bare ground. Pruning a tile takes its town
   off the map until a later pass measures it. Bournemouth is the example —
   sz09.js is 57,309 footprints and not one height, and it is the only
   reason there is a town there at all.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { measured } = require('./measured.js');

const APPLY = process.argv.includes('--apply');
const di = process.argv.indexOf('--dir');
const DIR = di >= 0 && process.argv[di + 1] ? path.resolve(process.argv[di + 1]) : __dirname;
const OWN = DIR === __dirname;

const gone = [], kept = [];
let freed = 0, keptBytes = 0;
for (const f of fs.readdirSync(DIR).sort()) {
  if (!f.endsWith('.js')) continue;
  const p = path.join(DIR, f);
  const m = measured(p);
  if (m === 2) continue;                       /* a tool, not a pack */
  const n = fs.statSync(p).size;
  if (m === 0) { kept.push(f); keptBytes += n; }
  else { gone.push({ f: f, n: n }); freed += n; }
}

const MB = b => (b / 1048576).toFixed(1) + ' MB';
console.log((APPLY ? 'removing ' : 'would remove ') + gone.length +
            ' footprint-only pack' + (gone.length === 1 ? '' : 's') + ', ' + MB(freed));
console.log('keeping ' + kept.length + ' measured pack' + (kept.length === 1 ? '' : 's') +
            ', ' + MB(keptBytes));
if (gone.length) {
  const show = gone.slice().sort((a, b) => b.n - a.n);
  console.log('\nlargest going:');
  for (const g of show.slice(0, 12)) console.log('  ' + g.f.padEnd(14) + MB(g.n).padStart(9));
  if (show.length > 12) console.log('  ...and ' + (show.length - 12) + ' more');
}
if (!APPLY) {
  console.log('\nnothing changed. --apply to do it.');
  process.exit(0);
}
if (!kept.length) {
  console.error('\nrefusing: that would leave no packs at all');
  process.exit(1);
}
for (const g of gone) fs.unlinkSync(path.join(DIR, g.f));
console.log('\nremoved ' + gone.length + ' file' + (gone.length === 1 ? '' : 's') + ', freed ' + MB(freed));
/* the manifest in index.html lists what is on disk, so it has to be rebuilt
   — but only when this ran on the real packs directory */
if (OWN) require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'list-packs.js')],
                                               { stdio: 'inherit' });
