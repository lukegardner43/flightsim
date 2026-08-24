#!/usr/bin/env node
/* What is already built for these 10 km tiles, and what still needs doing.

     node packs/tile-status.js TQ15 TQ14 TQ05

   Prints a line per tile for a person to read, and two key=value lines for
   the workflow to act on:

     footprints=TQ14,TQ05      tiles with no pack covering them at all
     heights=TQ15,TQ14         tiles whose footprints are not yet measured

   The point of this is that building a place should cost only what that place
   actually adds. Somewhere down the road from one already built is usually
   free, and finding that out has to be cheaper than the building.

   A pack is not always named after its tile — the older ones are named after
   the postcode they were built for — so the question asked here is never "is
   there a file called tq15.js" but "does any pack hold ground inside TQ15".
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { bng, tileOrigin } = require('./grid-square.js');

const DIR = __dirname;
const TILE = 10000;
/* below this share measured, a tile counts as not done: a handful of
   footprints can be measured by a neighbouring square's run spilling over */
const DONE = 0.60;

function loadPacks() {
  const out = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!/^[a-z0-9]+\.js$/.test(f)) continue;
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = /^TF_PACK\(([\s\S]*)\);\s*$/.exec(src.trim());
    if (!m) continue;                             /* a tool, not a pack */
    try { out.push({ file: f, d: JSON.parse(m[1]) }); } catch (e) { /* not ours */ }
  }
  return out;
}

/* every footprint's first corner, in eastings and northings */
function points(d) {
  const q = d.q, out = [];
  for (const b of d.buildings) {
    const p = bng(b[0] / q, b[1] / q);
    if (p) out.push(p);
  }
  return out;
}

function main() {
  const tiles = process.argv.slice(2).map(t => t.toUpperCase())
    .filter(t => /^[A-Z]{2}\d{2}$/.test(t));
  if (!tiles.length) {
    console.error('give one or more 10 km tiles, e.g. TQ15 TQ14');
    process.exit(1);
  }
  const packs = loadPacks();
  const pts = new Map();                          /* pack file -> [{E,N}, i] */
  const needFoot = [], needHeight = [];

  for (const tile of tiles) {
    const o = tileOrigin(tile);
    if (!o) { console.log(tile + '  not a tile'); continue; }
    let best = null;
    for (const p of packs) {
      if (!pts.has(p.file)) pts.set(p.file, points(p.d));
      const P = pts.get(p.file);
      let inside = 0, measured = 0;
      const h = p.d.heights || [];
      for (let i = 0; i < P.length; i++) {
        if (P[i].E < o.E || P[i].E >= o.E + TILE || P[i].N < o.N || P[i].N >= o.N + TILE) continue;
        inside++;
        if (h[i]) measured++;
      }
      if (inside && (!best || inside > best.inside))
        best = { file: p.file, id: p.d.id, inside: inside, measured: measured };
    }
    if (!best) {
      console.log(tile + '  no pack covers it — footprints and heights both needed');
      needFoot.push(tile); needHeight.push(tile);
      continue;
    }
    const share = best.measured / best.inside;
    console.log(tile + '  ' + best.id + ': ' + best.inside.toLocaleString() + ' footprints, ' +
                best.measured.toLocaleString() + ' measured (' + Math.round(share * 100) + '%)' +
                (share >= DONE ? '' : ' — heights needed'));
    if (share < DONE) needHeight.push(tile);
  }
  /* Always on stdout, and ALSO into GITHUB_OUTPUT when there is one.

     It used to be one or the other, and that quietly cost a whole England
     run. The workflow loops over a hundred tiles and reads these two lines
     off stdout; on a runner GITHUB_OUTPUT is set, so stdout got nothing, so
     the grep for "heights=...SE00" found nothing, so every tile in Yorkshire
     was counted as already measured and the job finished in a minute
     reporting "100 already done". A tool that stops printing depending on an
     environment variable is a trap. Printing twice costs two lines. */
  const out = ['footprints=' + needFoot.join(','), 'heights=' + needHeight.join(',')];
  for (const l of out) console.log(l);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, out.join('\n') + '\n');
}
main();
