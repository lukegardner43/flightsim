#!/usr/bin/env node
/* Turns sites.json into one file per site plus a tab-separated worklist the
   shell can read with `while IFS=$'\t' read`. Keeping this out of the
   workflow means the workflow stays readable and this stays testable.

   Usage:  node analysis/plan.js --sites sites.json --work work --radius 2500
   Prints: index<TAB>postcode<TAB>lat<TAB>lon<TAB>square<TAB>S<TAB>W<TAB>N<TAB>E
*/
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name); process.exit(1);
  }
  return process.argv[i + 1];
}

const sites = JSON.parse(fs.readFileSync(arg('sites'), 'utf8'));
const work = arg('work');
const r = +arg('radius', '2500');
fs.mkdirSync(work, { recursive: true });

sites.forEach((s, i) => {
  const n = String(i + 1).padStart(3, '0');
  const mLat = 110540, mLon = 111320 * Math.cos(s.lat * Math.PI / 180);
  const S = s.lat - r / mLat, N = s.lat + r / mLat;
  const W = s.lon - r / mLon, E = s.lon + r / mLon;
  fs.writeFileSync(path.join(work, 'site-' + n + '.json'), JSON.stringify(s));
  process.stdout.write([n, s.postcode, s.lat, s.lon, s.square,
    S.toFixed(6), W.toFixed(6), N.toFixed(6), E.toFixed(6)].join('\t') + '\n');
});
console.error(sites.length + ' sites, ' + (2 * r / 1000) + ' km square each, ' +
  Math.round(sites.length * (2 * r / 1000) ** 2) + ' km2 of Great Britain in total');
