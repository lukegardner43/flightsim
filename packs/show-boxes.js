#!/usr/bin/env node
/* What did the laser actually see over this building?

     node packs/show-boxes.js polesden ranmore mickleham   # by landmark model
     node packs/show-boxes.js 51.2790,-0.3740              # or by coordinate

   The name has a hyphen in it because everything in packs/ that is a TOOL
   does, and everything that is a PACK does not: the loaders here take every
   packs/*.js matching ^[a-z0-9]+$ and require it as a pack. Called boxes.js,
   this file got required by the model builder and by check-model-sites, ran
   its own command line, found no arguments and called process.exit(0) — so
   the build stopped dead and the checker printed nothing and returned 0.

   One reading per footprint is an average, and an average is the wrong
   number whenever a footprint holds more than one thing. make-heights
   already splits the surface into boxes where it steps; this prints them,
   and printing them is what settled three landmarks that had looked wrong
   for a day:

     ranmore    the model averaged 16.0 m over its plan, the footprint read
                29.0 m, and the two were declared thirteen metres apart. The
                boxes say 50% at 11.4 m, 21% at 35.6 m, 29% at 14.1 m — a
                nave and a spire. The nave is authored at 11.0 m. It was
                never wrong; the comparison was.
     mickleham  67% at 8.7 m and 33% at 15.5 m, against a nave authored at
                8.5 and a tower at 15.0. Also never wrong.
     polesden   86% at 10.8 m and 14% at 5.1 m, against ranges authored at
                13.8. That one really was a storey too tall.

   Two useful readings of the output. A box far above the rest across a
   small share of the length is a tower or a spire, and the metre grid reads
   it low — 35.6 m for a spire authored at 47.2. And boxes of similar size
   at markedly different heights mean the footprint holds two buildings, so
   no single number can correct a model of it: Thorncroft Manor is 32% at
   9.0, 50% at 9.2, 11% at 12.0 and 8% at 9.8, which is a Georgian house
   inside a modern office development. */
'use strict';
const fs = require('fs'), path = require('path');
const { bng } = require('./grid-square.js');

const rings = [];
global.TF_PACK = d => {
  const q = d.q || 1e6;
  for (const a of d.buildings) {
    const pts = []; let lat = a[0], lon = a[1];
    pts.push([lat/q, lon/q]);
    for (let i = 2; i < a.length; i += 2) { lat += a[i]; lon += a[i+1]; pts.push([lat/q, lon/q]); }
    rings.push({ pts: pts, h: (d.heights && d.heights[rings.length]) || 0,
                 p: (d.parts && d.parts[rings.length]) || null });
  }
};
const dir = __dirname;
for (const f of fs.readdirSync(dir).filter(f => /^[a-z0-9]+\.js$/.test(f)))
  { try { require(path.join(dir, f)); } catch (e) {} }
if (!rings.length) { console.error('no packs to read'); process.exit(1); }

let models = [];
try { models = require('../models/kt23-3hp.json').models || []; } catch (e) {}

const inRing = (pts, lat, lon) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][0], xi = pts[i][1], yj = pts[j][0], xj = pts[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi) + xi) hit = !hit;
  }
  return hit;
};
const area = (pts, lat0) => {
  const mLat = 110540, mLon = 111320 * Math.cos(lat0 * Math.PI/180);
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i+1) % pts.length];
    a2 += p[1]*mLon*q[0]*mLat - q[1]*mLon*p[0]*mLat;
  }
  return Math.abs(a2) / 2;
};
const un = v => (v & 1023)/10 + ((v >> 10) & 255)/10;

const args = process.argv.slice(2);
if (!args.length) {
  console.log('give a landmark model id or a lat,lon — see the comment at the top');
  process.exit(0);
}
for (const arg of args) {
  let lat, lon, label = arg;
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(arg)) { const [a, b] = arg.split(','); lat = +a; lon = +b; }
  else {
    const m = models.find(x => x.id === arg);
    if (!m || !m.near) { console.log(label + ': no model of that name, and not a lat,lon'); continue; }
    lat = m.near[0]; lon = m.near[1];
  }
  const r = rings.filter(r => inRing(r.pts, lat, lon))
                 .sort((a, b) => area(b.pts, lat) - area(a.pts, lat))[0];
  if (!r) { console.log('\n' + label + ': no surveyed footprint under that point'); continue; }
  const b = bng(lat, lon);
  console.log('\n' + label + '   ' + b.square + ' ' + Math.round((b.E % 100000)/10) + ' ' +
              Math.round((b.N % 100000)/10) + '   ' + Math.round(area(r.pts, lat)) + ' m2   ' +
              (r.h ? 'whole footprint ' + un(r.h).toFixed(1) + ' m' : 'no reading'));
  if (!r.p) { console.log('   the surface did not step — one box, the whole thing'); continue; }
  const n = (r.p.length - 1) / 2;
  console.log('   ' + n + ' boxes along a bearing of ' + r.p[0] + ' degrees:');
  for (let i = 0; i < n; i++) {
    const t = r.p[1 + i*2], t0 = (t & 255)/255, t1 = ((t >> 8) & 255)/255;
    const bar = '#'.repeat(Math.max(1, Math.round((t1 - t0) * 40)));
    console.log('     ' + (t0*100).toFixed(0).padStart(3) + '%-' + (t1*100).toFixed(0).padStart(3) + '%  ' +
                un(r.p[2 + i*2]).toFixed(1).padStart(5) + ' m  ' + bar);
  }
}
