#!/usr/bin/env node
/* Every OpenStreetMap building inside one bounding box, as GeoJSON.

   Written the hard way on purpose. The bug that started this whole line of
   work was reading an empty Overpass answer as "there are no buildings
   here" when it actually meant "that mirror failed". An audit that made the
   same mistake would report a village as 100% missing and be believed, so
   this script will only write a zero if two different mirrors independently
   say zero.

   Usage:
     node analysis/osm-fetch.js --bbox S,W,N,E --out osm.geojson
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

/* OVERPASS_URL points every request at one server instead of the mirror
   list. The tests use it to run this file end to end against a local stub;
   it is also the escape hatch if you have your own Overpass instance. */
const MIRRORS = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

const BB = arg('bbox').split(',').map(Number);
const OUT = arg('out');
if (BB.length !== 4 || BB.some(isNaN)) { console.error('--bbox wants S,W,N,E'); process.exit(1); }
const [S, W, N, E] = BB;

function queryFor(s, w, n, e) {
  return '[out:json][timeout:240];(' +
    'way["building"](' + s + ',' + w + ',' + n + ',' + e + ');' +
    'relation["building"](' + s + ',' + w + ',' + n + ',' + e + ');' +
    ');out geom;';
}

/* Overpass instances require a User-Agent that says who is calling and how to
   reach them, and overpass-api.de answers a request without one with an
   instant 406. Node's fetch sends nothing by default, which is how the first
   audit run came to lose its most reliable mirror on every single box and
   quietly fall back to running on one server. */
const UA = 'terraflight-coverage-audit/1.0 (+https://github.com/lukegardner43/flightsim)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ask(url, query) {
  const t0 = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Accept': 'application/json'
    },
    body: 'data=' + encodeURIComponent(query)
  });
  const text = await r.text();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) { const err = new Error('HTTP ' + r.status + ' after ' + secs + 's'); err.status = r.status; throw err; }
  let j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error('not JSON after ' + secs + 's: ' + text.slice(0, 160).replace(/\s+/g, ' ')); }
  const els = (j.elements || []);
  console.error('    ' + url.replace(/^https?:\/\//, '').split('/')[0] +
    '  ' + secs + 's  ' + Math.round(text.length / 1024) + ' KB  ' + els.length + ' elements');
  return els;
}

/* Outer rings of a relation arrive as separate member ways that have to be
   stitched end to end. Members already come back in a usable order most of
   the time; matching endpoints handles the times they do not. */
function stitch(members) {
  const segs = members
    .filter(m => m.type === 'way' && (m.role === 'outer' || m.role === '') && m.geometry && m.geometry.length > 1)
    .map(m => m.geometry.map(p => [p.lon, p.lat]));
  const rings = [];
  while (segs.length) {
    let ring = segs.shift().slice();
    let grew = true;
    while (grew) {
      grew = false;
      const head = ring[0], tail = ring[ring.length - 1];
      if (Math.abs(head[0] - tail[0]) < 1e-9 && Math.abs(head[1] - tail[1]) < 1e-9) break;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], a = s[0], b = s[s.length - 1];
        const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
        if (near(tail, a)) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); grew = true; break; }
        if (near(tail, b)) { ring = ring.concat(s.slice().reverse().slice(1)); segs.splice(i, 1); grew = true; break; }
        if (near(head, b)) { ring = s.slice(0, -1).concat(ring); segs.splice(i, 1); grew = true; break; }
        if (near(head, a)) { ring = s.slice().reverse().slice(0, -1).concat(ring); segs.splice(i, 1); grew = true; break; }
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function toFeatures(els) {
  const feats = [];
  for (const e of els) {
    const t = e.tags || {};
    if (t.building === 'no') continue;
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) {
      feats.push({ type: 'Feature', properties: { building: t.building || 'yes', id: 'w' + e.id },
        geometry: { type: 'Polygon', coordinates: [e.geometry.map(p => [p.lon, p.lat])] } });
    } else if (e.type === 'relation' && e.members) {
      for (const ring of stitch(e.members)) {
        feats.push({ type: 'Feature', properties: { building: t.building || 'yes', id: 'r' + e.id },
          geometry: { type: 'Polygon', coordinates: [ring] } });
      }
    }
  }
  return feats;
}

/* One box, from whichever mirror will answer.

   The first run taught the shape of the failures: a rejected request comes
   back instantly, a rate limit comes back instantly, and an overloaded server
   times out after forty seconds. So one pass over the ring is not enough —
   the ring is retried after a wait, because a 429 means "not now", not
   "never". The starting mirror is rotated per box so the same server is not
   the one taking every first hit. */
async function fetchRing(query, label, passes) {
  const problems = [];
  const rot = Math.abs(Math.round((S + W) * 1000)) % MIRRORS.length;
  const ring = MIRRORS.length > 1
    ? MIRRORS.slice(rot).concat(MIRRORS.slice(0, rot))
    : [MIRRORS[0], MIRRORS[0]];
  let zeros = 0;

  for (let pass = 0; pass < (passes || 1); pass++) {
    if (pass) {
      console.error('    ' + label + ': every mirror said no, waiting 45s and going round again');
      await sleep(45000);
    }
    for (const url of ring) {
      let els;
      try { els = await ask(url, query); }
      catch (e) {
        problems.push(url.split('/')[2] + ': ' + (e.message || e));
        /* A rate limit is worth more of a pause than a dead socket. */
        await sleep(e.status === 429 ? 6000 : 1500);
        continue;
      }
      if (!els.length) {
        /* Empty is the failure shape as often as it is the truth. Only two
           mirrors agreeing makes it a measurement. */
        zeros++;
        problems.push(url.split('/')[2] + ': empty answer');
        if (zeros < 2) { await sleep(1500); continue; }
        console.error('    two mirrors agree this box is empty — recording zero');
      }
      return { els: els, problems: problems };
    }
  }
  return { els: null, problems: problems };
}

/* A 25 km2 box over inner London is a heavy query and the servers that are
   still answering time out on it. Four smaller boxes ask for exactly the same
   buildings and each one is cheap, so a box that cannot be had whole is had
   in quarters rather than dropped from the audit. */
async function fetchSplit() {
  const midLat = (S + N) / 2, midLon = (W + E) / 2;
  const quads = [[S, W, midLat, midLon], [S, midLon, midLat, E],
                 [midLat, W, N, midLon], [midLat, midLon, N, E]];
  const all = [];
  const seen = {};
  for (let i = 0; i < quads.length; i++) {
    const q = quads[i];
    const r = await fetchRing(queryFor(q[0], q[1], q[2], q[3]), 'quarter ' + (i + 1), 1);
    if (r.els === null) {
      console.error('    quarter ' + (i + 1) + ' failed too — giving up on this box');
      for (const p of r.problems) console.error('      ' + p);
      return null;
    }
    /* The quarters share their edges, so the same way comes back more than
       once and must not be counted twice. */
    for (const e of r.els) {
      const k = e.type + e.id;
      if (seen[k]) continue;
      seen[k] = 1;
      all.push(e);
    }
    await sleep(4000);
  }
  console.error('    stitched ' + all.length + ' elements from four quarters');
  return all;
}

(async () => {
  let els, problems = [];
  const whole = await fetchRing(queryFor(S, W, N, E), 'box', 2);
  if (whole.els !== null) {
    els = whole.els;
    problems = whole.problems;
  } else {
    console.error('    ! no mirror would answer the whole box:');
    for (const p of whole.problems) console.error('      ' + p);
    console.error('    trying it in four quarters instead');
    els = await fetchSplit();
    if (els === null) process.exit(2);
  }

  const feats = toFeatures(els);
  fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features: feats }));
  console.error('    OSM: ' + feats.length + ' building polygons -> ' + OUT +
    (problems.length ? '   (after ' + problems.length + ' bad mirror' + (problems.length > 1 ? 's' : '') + ')' : ''));
})();
