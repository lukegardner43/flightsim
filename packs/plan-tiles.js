#!/usr/bin/env node
/* Which 10 km Ordnance Survey tiles does this list of places need?

   Packs are stored per tile, not per postcode, so two nearby places share
   their coverage instead of each carrying an overlapping 10 km square of its
   own. Building a second postcode down the road then costs only the tiles it
   actually adds — often none.

     node packs/plan-tiles.js "KT23 3HP, DH1 3LE" [--radius 5200] [--have tq15,tq14]

   Prints one line per 100 km grid square:  TQ<TAB>TQ04,TQ05,TQ14,TQ15
   so the workflow can download each square once and clip every tile it needs
   out of it. Diagnostics go to stderr.
*/
'use strict';
const { bng, tilesAround, tileOrigin, bngToWgs84 } = require('./grid-square.js');

/* Pull the --flag value pairs out of argv first; whatever is left is places.
   Doing it the other way round meant "--have TQ04,TQ05" was read as four more
   postcodes to look up. */
const OPTS = {};
const REST = [];
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { OPTS[a[i].slice(2)] = a[i + 1] || ''; i++; }
    else REST.push(a[i]);
  }
}
const RADIUS = +(OPTS.radius || 5200);
const HAVE = new Set(String(OPTS.have || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean));

async function resolve(place) {
  const nums = place.split(/[\s,]+/).map(Number);
  if (nums.length === 2 && nums.every(v => !isNaN(v))) return { lat: nums[0], lon: nums[1], label: place };
  /* a 10 km tile names itself. The England build walks the grid rather than a
     list of postcodes, and asking postcodes.io where TQ15 is would be both
     wrong and a network round trip per tile. */
  const t = place.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{2}$/.test(t)) {
    const o = tileOrigin(t);
    if (o) {
      const w = bngToWgs84(o.E + 5000, o.N + 5000);
      return { lat: w.lat, lon: w.lon, label: t + ' (the tile itself)' };
    }
  }
  const r = await fetch('https://api.postcodes.io/postcodes/' +
                        encodeURIComponent(place.replace(/\s+/g, '')));
  const j = await r.json().catch(() => ({}));
  if (!j.result || j.result.latitude == null) { console.error('  ! not found: ' + place); return null; }
  return { lat: j.result.latitude, lon: j.result.longitude,
           label: j.result.postcode + ' (' + (j.result.admin_district || '') + ')' };
}

(async () => {
  const list = REST.join(' ').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) { console.error('give at least one postcode'); process.exit(1); }

  const bySquare = {};
  const all = new Set();
  let already = 0, resolved = 0;
  for (const place of list) {
    const p = await resolve(place);
    if (!p) continue;
    resolved++;
    const tiles = tilesAround(p.lat, p.lon, RADIUS);
    const need = tiles.filter(t => !HAVE.has(t));
    already += tiles.length - need.length;
    console.error('  ' + p.label.padEnd(34) + tiles.join(' ') +
                  (need.length < tiles.length ? '   (' + (tiles.length - need.length) + ' already built)' : ''));
    for (const t of need) {
      if (all.has(t)) continue;
      all.add(t);
      const sq = t.slice(0, 2);
      (bySquare[sq] = bySquare[sq] || []).push(t);
    }
  }

  /* Told that every tile was already built, when in fact not one postcode
     had resolved, is a misleading way to fail — and it is the failure a
     mistyped postcode or an unreachable postcodes.io both produce. The two
     are different and now say so. */
  if (!resolved) {
    console.error('none of those resolved: ' + list.join(', '));
    console.error('they have to be UK postcodes, and postcodes.io has to be reachable');
    process.exit(4);
  }
  if (!all.size) { console.error('nothing new to build — every tile is already in the repo'); process.exit(3); }
  console.error(all.size + ' tile' + (all.size === 1 ? '' : 's') + ' to build across ' +
                Object.keys(bySquare).length + ' grid square' +
                (Object.keys(bySquare).length === 1 ? '' : 's') +
                (already ? ', ' + already + ' skipped as already built' : ''));
  /* One clip per grid square rather than one per tile: the bounding box of
     everything wanted from that square, with a little margin so a footprint
     on a tile edge is not lost. make-pack then partitions it exactly, in
     British National Grid, so the tiles still do not overlap. */
  for (const sq of Object.keys(bySquare).sort()) {
    const tiles = bySquare[sq].sort();
    let W = 180, S = 90, E = -180, N = -90;
    for (const t of tiles) {
      const o = tileOrigin(t);
      for (const de of [0, 10000]) for (const dn of [0, 10000]) {
        const c = bngToWgs84(o.E + de, o.N + dn);
        if (c.lon < W) W = c.lon;
        if (c.lon > E) E = c.lon;
        if (c.lat < S) S = c.lat;
        if (c.lat > N) N = c.lat;
      }
    }
    const m = 0.004;                                   /* ~400 m of margin */
    process.stdout.write(sq + '\t' + tiles.join(',') + '\t' +
      [(W - m).toFixed(6), (S - m).toFixed(6), (E + m).toFixed(6), (N + m).toFixed(6)].join(' ') + '\n');
    console.error('  ' + sq + ': ' + tiles.length + ' tiles, clip ' +
      (W - m).toFixed(3) + ',' + (S - m).toFixed(3) + ' .. ' + (E + m).toFixed(3) + ',' + (N + m).toFixed(3));
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
