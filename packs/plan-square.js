#!/usr/bin/env node
/* Works out which 10 km tile to measure and which square of it, from
   something a person would actually type.

     node packs/plan-square.js "KT23 3HP" --size 2000
     node packs/plan-square.js TQ15                    (the whole tile)
     node packs/plan-square.js TQ15 --square 511700,154400,2000
     node packs/plan-square.js --centre 51.279,-0.376 --size 2000

   Prints key=value lines for $GITHUB_OUTPUT. A grid reference is a poor
   thing to ask anyone for: the first square measured for real was one I
   suggested from memory, and it turned out to be farmland with 136 buildings
   in it rather than the village with 1,724.
*/
'use strict';
const { bng, tileOrigin, gridLetters } = require('./grid-square.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i < 0 || i + 1 >= process.argv.length) ? dflt : process.argv[i + 1];
}
const SIZE = arg('size', '');
const SQUARE = arg('square', '');
const CENTRE = arg('centre', '');
const place = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].trim() : '';

function snap(v) { return Math.round(v / 100) * 100; }

function emit(tile, e0, n0, size) {
  const o = tileOrigin(tile);
  /* a square has to sit inside its tile: one raster, one grid, one origin */
  e0 = Math.max(o.E, Math.min(o.E + 10000 - size, snap(e0)));
  n0 = Math.max(o.N, Math.min(o.N + 10000 - size, snap(n0)));
  console.log('tile=' + tile);
  console.log('e0=' + e0); console.log('n0=' + n0);
  console.log('e1=' + (e0 + size)); console.log('n1=' + (n0 + size));
  console.log('size=' + size);
}

async function fromLatLon(lat, lon) {
  const b = bng(lat, lon);
  if (!b) { console.error('that is outside the OS National Grid'); process.exit(1); }
  const size = SIZE ? +SIZE : 10000;
  if (!(size >= 200 && size <= 10000)) { console.error('size must be 200..10000 m'); process.exit(1); }
  const o = tileOrigin(b.tile);
  emit(b.tile, size === 10000 ? o.E : b.E - size / 2,
               size === 10000 ? o.N : b.N - size / 2, size);
}

async function main() {
  if (CENTRE) {
    const v = CENTRE.split(',').map(Number);
    if (v.length !== 2 || v.some(isNaN)) { console.error('--centre must be lat,lon'); process.exit(1); }
    return fromLatLon(v[0], v[1]);
  }
  if (!place) { console.error('give a postcode or an OS tile, e.g. "KT23 3HP" or TQ15'); process.exit(1); }

  /* an OS tile is two letters and two digits and nothing else */
  if (/^[A-Za-z]{2}\d{2}$/.test(place.replace(/\s+/g, ''))) {
    const tile = place.replace(/\s+/g, '').toUpperCase();
    const o = tileOrigin(tile);
    if (!o) { console.error('not a 10 km tile: ' + tile); process.exit(1); }
    if (SQUARE) {
      const v = SQUARE.split(',').map(Number);
      if (v.length !== 3 || v.some(isNaN)) { console.error('--square must be E,N,size'); process.exit(1); }
      return emit(tile, v[0], v[1], v[2]);
    }
    const size = SIZE ? +SIZE : 10000;
    return emit(tile, size === 10000 ? o.E : o.E + (10000 - size) / 2,
                      size === 10000 ? o.N : o.N + (10000 - size) / 2, size);
  }

  const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(place));
  const j = await r.json().catch(() => null);
  if (!j || !j.result || j.result.latitude == null) {
    console.error('postcode not found: ' + place);
    process.exit(1);
  }
  console.error('  ' + j.result.postcode + ' -> ' + j.result.latitude + ',' + j.result.longitude +
                '  ' + gridLetters(j.result.latitude, j.result.longitude));
  return fromLatLon(j.result.latitude, j.result.longitude);
}
main();
