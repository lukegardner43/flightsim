#!/usr/bin/env node
/* Does this pack carry any lidar heights?

     node packs/measured.js packs/tq38.js && echo yes

   Exit 0 if the pack holds at least one non-zero height, 1 if it is
   footprints only, 2 if it is not a pack at all.

   The England build writes a pack for every tile of a grid square, because
   the footprints are one Ordnance Survey download for the whole square and
   cost seconds. The MEASURING is what the four-hour budget limits, so a
   pass leaves about eight tiles in a hundred with heights on them and
   ninety-two with none. Committing all of them put roughly 700 MB of
   unmeasured geometry in the repository to carry 3% of it that was worth
   keeping — and every later pass rewrites those same files to add heights,
   so git would store the whole lot again each time.

   Reads the array without parsing the JSON: a London pack is ten megabytes
   and there are 2,500 of them.
*/
'use strict';
const fs = require('fs');

function measured(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(8);
    if (fs.readSync(fd, head, 0, 8, 0) !== 8 || head.toString('utf8') !== 'TF_PACK(') return 2;
  } catch (e) {
    return 2;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {}
  }
  let s;
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { return 2; }
  const m = /"heights":\[([^\]]*)\]/.exec(s);
  /* an all-zero array is what a tile with no lidar coverage leaves behind,
     and it is not a measurement */
  if (!m) return 1;
  return /[1-9]/.test(m[1]) ? 0 : 1;
}

module.exports = { measured };

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('give a pack file'); process.exit(2); }
  process.exit(measured(f));
}
