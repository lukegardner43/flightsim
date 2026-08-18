#!/usr/bin/env node
/* What does Ordnance Survey have here that OpenStreetMap does not?

   Two datasets of the same place never line up one polygon to one polygon.
   OS generalises a terrace of eight houses into a single block; OSM often
   draws all eight. So comparing counts alone would say OSM has four times
   more buildings than OS in a terraced street and none at all in the next
   one over. This script therefore does a real spatial join, and leads with
   total footprint AREA, which survives that difference intact.

   A footprint counts as present in both when any of these holds, which
   between them cover the terrace case, the offset-geometry case and the
   split-building case:
     - the OS polygon's centre lies inside an OSM polygon
     - an OSM polygon's centre lies inside the OS polygon
     - their bounding boxes overlap by 30% of the smaller polygon's area

   Usage:
     node analysis/compare.js --os os1.geojson,os2.geojson --osm osm.geojson \
          --centre 51.279,-0.376 --site site.json --out stats.json
*/
'use strict';
const fs = require('fs');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name); process.exit(1);
  }
  return process.argv[i + 1];
}

const CENTRE = arg('centre').split(',').map(Number);
const [LAT0, LON0] = CENTRE;
const M_LAT = 110540, M_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);

function load(files) {
  const polys = [];
  for (const f of files) {
    if (!f) continue;
    let gj;
    try { gj = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { console.error('  ! cannot read ' + f + ': ' + e.message); continue; }
    for (const feat of (gj.features || [])) {
      const g = feat.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') add(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) add(p[0]);
    }
  }
  function add(ring) {
    if (!ring || ring.length < 3) return;
    const pts = [];
    for (const c of ring) {
      const x = (c[0] - LON0) * M_LON, y = (c[1] - LAT0) * M_LAT;
      if (!isFinite(x) || !isFinite(y)) return;
      pts.push([x, y]);
    }
    /* drop the repeated closing vertex — shoelace does not want it twice */
    if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-6 &&
        Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    if (pts.length < 3) return;
    let a2 = 0, cx = 0, cy = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const cross = p[0] * q[1] - q[0] * p[1];
      a2 += cross; cx += (p[0] + q[0]) * cross; cy += (p[1] + q[1]) * cross;
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    const area = Math.abs(a2) / 2;
    if (!(area > 0.5)) return;                       /* slivers are not buildings */
    polys.push({ pts: pts, area: area,
      cx: cx / (3 * a2), cy: cy / (3 * a2),
      minx: minx, miny: miny, maxx: maxx, maxy: maxy, hit: false });
  }
  return polys;
}

function inside(p, x, y) {
  const pts = p.pts;
  let n = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][1], yj = pts[j][1];
    if ((yi > y) !== (yj > y) &&
        x < (pts[j][0] - pts[i][0]) * (y - yi) / (yj - yi) + pts[i][0]) n = !n;
  }
  return n;
}

function boxOverlap(a, b) {
  const w = Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx);
  const h = Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny);
  return w > 0 && h > 0 ? w * h : 0;
}

const CELL = 32;
function index(polys) {
  const map = {};
  polys.forEach((p, i) => {
    for (let gx = Math.floor(p.minx / CELL); gx <= Math.floor(p.maxx / CELL); gx++)
      for (let gy = Math.floor(p.miny / CELL); gy <= Math.floor(p.maxy / CELL); gy++) {
        const k = gx + ',' + gy;
        (map[k] || (map[k] = [])).push(i);
      }
  });
  return map;
}
function near(map, p) {
  const out = {}, list = [];
  for (let gx = Math.floor(p.minx / CELL); gx <= Math.floor(p.maxx / CELL); gx++)
    for (let gy = Math.floor(p.miny / CELL); gy <= Math.floor(p.maxy / CELL); gy++) {
      const c = map[gx + ',' + gy];
      if (c) for (const i of c) if (!out[i]) { out[i] = 1; list.push(i); }
    }
  return list;
}

function sameBuilding(a, b) {
  if (inside(b, a.cx, a.cy)) return true;
  if (inside(a, b.cx, b.cy)) return true;
  const ov = boxOverlap(a, b);
  return ov >= 0.30 * Math.min(a.area, b.area);
}

function median(v) {
  if (!v.length) return 0;
  const s = v.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

const OSF = arg('os').split(',').map(s => s.trim()).filter(Boolean);
const OSMF = [arg('osm')];
const os = load(OSF);
const osm = load(OSMF);

const osmIdx = index(osm);
for (const o of os) {
  for (const i of near(osmIdx, o)) {
    if (sameBuilding(o, osm[i])) { o.hit = true; osm[i].hit = true; }
  }
}
/* An OSM polygon can sit inside an OS block that some other OSM polygon
   already claimed, so sweep the unclaimed ones against OS as well. */
const osIdx = index(os);
for (const m of osm) {
  if (m.hit) continue;
  for (const i of near(osIdx, m)) if (sameBuilding(os[i], m)) { m.hit = true; os[i].hit = true; }
}

const sum = (v, f) => v.reduce((t, x) => t + f(x), 0);
const missing = os.filter(p => !p.hit);
const extra = osm.filter(p => !p.hit);
const band = (lo, hi) => missing.filter(p => p.area >= lo && p.area < hi);

const site = arg('site', '');
const stats = {
  site: site ? JSON.parse(fs.readFileSync(site, 'utf8')) : null,
  os:  { count: os.length,  area: Math.round(sum(os,  p => p.area)),  median: Math.round(median(os.map(p => p.area))) },
  osm: { count: osm.length, area: Math.round(sum(osm, p => p.area)), median: Math.round(median(osm.map(p => p.area))) },
  missing: {
    count: missing.length,
    area: Math.round(sum(missing, p => p.area)),
    outbuilding: band(0, 50).length,      /* garage, shed, substation */
    housesized: band(50, 400).length,     /* a dwelling, near enough */
    large: band(400, Infinity).length     /* flats, school, shed, warehouse */
  },
  extra: { count: extra.length, area: Math.round(sum(extra, p => p.area)) }
};
stats.areaRatio = stats.os.area ? +(stats.osm.area / stats.os.area).toFixed(3) : null;
stats.missingShare = stats.os.count ? +(missing.length / os.length).toFixed(3) : null;
stats.missingAreaShare = stats.os.area ? +(stats.missing.area / stats.os.area).toFixed(3) : null;

fs.writeFileSync(arg('out'), JSON.stringify(stats, null, 1));
console.error('    OS ' + os.length + ' (' + Math.round(stats.os.area / 1000) + ' k m2)  ' +
  'OSM ' + osm.length + ' (' + Math.round(stats.osm.area / 1000) + ' k m2)  ' +
  'missing ' + missing.length + ' = ' + Math.round(100 * (stats.missingShare || 0)) + '% of OS footprints, ' +
  Math.round(100 * (stats.missingAreaShare || 0)) + '% of OS floor area');
