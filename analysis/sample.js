#!/usr/bin/env node
/* Chooses the places to audit, and says where they are.

   The question this whole directory exists to answer is "was Bookham a
   blindspot, or is OpenStreetMap missing buildings everywhere?" — and that
   question is only answerable if I do not get to choose the places. So the
   default mode draws postcodes at random from postcodes.io, which is a
   uniform draw over live UK postcodes and therefore roughly a draw over
   where people actually live.

   Northern Ireland is dropped: OS OpenMap Local is Great Britain only, so
   there is nothing to compare against there.

   Usage:
     node analysis/sample.js --random 12            > sites.json
     node analysis/sample.js --list "KT23 3HP,..."  > sites.json

   Output (stdout) is a JSON array of
     { postcode, lat, lon, square, district, region, country }
*/
'use strict';

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  return process.argv[i + 1];
}
const { gridLetters } = require('../packs/grid-square.js');

const GB = { England: 1, Scotland: 1, Wales: 1 };

async function lookup(pc) {
  const url = 'https://api.postcodes.io/postcodes/' + encodeURIComponent(String(pc).replace(/\s+/g, ''));
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!j || !j.result || j.result.latitude == null) {
    console.error('  ! postcode not found: ' + pc);
    return null;
  }
  return j.result;
}

async function randomOne() {
  const r = await fetch('https://api.postcodes.io/random/postcodes');
  const j = await r.json().catch(() => ({}));
  if (!j || !j.result) {
    console.error('  ! random draw returned nothing usable: ' + JSON.stringify(j).slice(0, 200));
    return null;
  }
  return j.result;
}

function site(res) {
  if (!GB[res.country]) {
    console.error('  - skipped ' + res.postcode + ' (' + res.country + ') — OpenMap Local is Great Britain only');
    return null;
  }
  if (res.latitude == null || res.longitude == null) return null;
  const sq = gridLetters(res.latitude, res.longitude);
  if (!sq) {
    console.error('  - skipped ' + res.postcode + ' — outside the British National Grid');
    return null;
  }
  return {
    postcode: res.postcode,
    lat: res.latitude,
    lon: res.longitude,
    square: sq,
    district: res.admin_district || '',
    region: res.region || res.country || '',
    country: res.country || ''
  };
}

(async () => {
  const list = arg('list', '');
  const n = +arg('random', '0');
  const out = [];
  const seen = {};

  if (list) {
    for (const pc of list.split(',').map(s => s.trim()).filter(Boolean)) {
      const res = await lookup(pc);
      const s = res && site(res);
      if (s && !seen[s.postcode]) { seen[s.postcode] = 1; out.push(s); }
    }
  } else {
    /* Draw until we have n usable Great Britain postcodes. The cap stops a
       run-away if postcodes.io starts handing back only Northern Ireland. */
    let tries = 0;
    while (out.length < n && tries < n * 8 + 20) {
      tries++;
      const res = await randomOne();
      const s = res && site(res);
      if (s && !seen[s.postcode]) { seen[s.postcode] = 1; out.push(s); }
    }
    if (out.length < n) console.error('  ! only drew ' + out.length + ' of ' + n + ' after ' + tries + ' tries');
  }

  /* The reference site is measured by exactly the same method as the random
     draw, and marked so the report can hold it up against the draw instead
     of hiding inside it. Bookham is where this whole question started. */
  const ref = arg('reference', '');
  if (ref) {
    for (const pc of ref.split(',').map(s => s.trim()).filter(Boolean)) {
      const res = await lookup(pc);
      const s = res && site(res);
      if (!s) continue;
      if (seen[s.postcode]) { out.find(o => o.postcode === s.postcode).reference = true; continue; }
      s.reference = true; seen[s.postcode] = 1; out.push(s);
    }
  }

  if (!out.length) { console.error('no sites — nothing to audit'); process.exit(1); }
  /* Grouped by grid square so the workflow downloads each 100 km square of
     Ordnance Survey data once instead of once per site. */
  out.sort((a, b) => a.square < b.square ? -1 : a.square > b.square ? 1 : 0);
  for (const s of out) console.error('  ' + s.square + '  ' + s.postcode.padEnd(9) + '  ' +
    s.district + ' (' + s.region + ')' + (s.reference ? '   [reference]' : ''));
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})().catch(e => { console.error(e.message || e); process.exit(1); });
