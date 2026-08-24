#!/usr/bin/env node
/* Writes models/london.json.
 *
 *     node models/build-london.js && node models/embed.js
 *
 * The Shard was wrong in the one way that matters for a building whose entire
 * character is its profile: it was a smooth cone that converged to a needle,
 * and it did it far too early.
 *
 * TWO THINGS WERE WRONG.
 *
 * The taper. The old stack was 1.0 of the base width at the ground, 0.60 at
 * 160 m and 0.306 at the top occupied floor. Nothing supported those numbers
 * — they were fitted by eye to elevation photographs. The published floor area
 * does support a number: 127,071 m2 over 95 storeys is a mean floorplate of
 * 1,338 m2, and with a straight-leaning facade the area falls as the SQUARE of
 * the width, so mean area = A0 x (1 - c + c^2/3). A base floorplate of about
 * 2,200 m2 puts the top occupied floor at 0.54 of the base width, not 0.306.
 * The old model was half as wide as it should have been at 244 m, which is
 * what turned a tapering tower into a spike.
 *
 * The spire. The Shard's top is not solid and does not come to a point: eight
 * glass planes carry on past the last floor, lean past each other and stop at
 * different heights, which is where the building gets its name. Modelling that
 * as one more tapering shell gave a cone with a tip on it — the model's own
 * known_gaps admitted as much. The spire is now eight separate blades ending
 * at eight different heights, which is both what is there and what reads from
 * a distance.
 *
 * Sizes in the spire are FRACTIONS of the real surveyed footprint, not metres,
 * so the blades keep their proportion to whatever polygon OpenStreetMap holds.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* the profile, from the floor-area arithmetic above */
const H_TOP   = 244.3;    /* the level 72 gallery: the highest occupied floor */
const H_MID   = 160;      /* about level 40, where the offices give way */
const H_ARCH  = 309.6;    /* architectural height, to the tip */
const W_MID   = 0.72;     /* width factor at 160 m */
const W_TOP   = 0.54;     /* width factor at the top occupied floor */

const GLASS = ['#a6bccb', '#aac0ce', '#b4c8d4'];

const parts = [
  { on: 'footprint', height: H_MID, taper: W_MID,
    roof: 'flat', type: 'commercial', material: 'glass', colour: GLASS[0],
    note: 'the lower tower, offices, from the concourse to about level 40' },
  { on: 'footprint', plan: W_MID, minHeight: H_MID, height: H_TOP,
    taper: +(W_TOP / W_MID).toFixed(4),
    roof: 'flat', type: 'commercial', material: 'glass', colour: GLASS[1],
    note: 'hotel, residences and restaurants to the level 72 viewing gallery. '
        + 'The facade steepens here: it loses width three times as fast per '
        + 'metre as the lower tower does' }
];

/* The spire: eight blades, leaning past each other, stopping short of one
   another. The tallest reaches the architectural height; the rest do not,
   which is the whole point — they are shards, and shards do not meet. */
const TOPS = [H_ARCH, 288, 301.5, 279, 305, 292.5, 283, 297];
TOPS.forEach((top, i) => {
  const th = (i / TOPS.length) * Math.PI * 2;
  parts.push({
    at: [+(Math.cos(th) * 0.10).toFixed(3), +(Math.sin(th) * 0.10).toFixed(3)],
    rot: +(i * 180 / TOPS.length).toFixed(1),
    /* 0.46 of the base width, so a blade is shorter than the 0.54 platform it
       stands on however it is turned. At 0.62 they overhung the top of the
       tower by four metres a side and read as a flange rather than a spire. */
    wF: 0.46, dF: 0.05,
    minHeight: H_TOP, height: top,
    taper: 0.25,
    roof: 'flat', type: 'commercial',
    material: i % 2 ? 'metal' : 'glass',
    colour: i % 2 ? '#c2ccd2' : GLASS[2],
    note: i === 0 ? 'the eight glass shards of the spire, open, leaning past '
        + 'each other and ending at eight different heights' : undefined
  });
});

const out = {
  id: 'london',
  name: 'London landmarks',
  produced_on: new Date().toISOString().slice(0, 10),
  method: 'Towers whose shape is not their footprint. The pipeline measures a '
    + 'height from lidar and extrudes the surveyed outline straight up, which is '
    + 'right for almost every building in Britain and wrong for the ones whose '
    + 'whole character is that they change shape as they rise. Those are written '
    + 'here as pieces cut from the building\'s own mapped outline, each a fraction '
    + 'of the plan below it, so the model keeps the polygon somebody actually '
    + 'surveyed and only supplies what the survey cannot: the profile.',
  confidence_scale: 'high = dimensions from the building\'s own published drawings '
    + 'or a measured survey. medium = principal heights are published and reliable; '
    + 'the taper between them is derived from published floor areas rather than '
    + 'measured.',
  models: [{
    id: 'shard',
    name: 'The Shard',
    match: ['the shard', 'shard london bridge', 'shard of glass'],
    exclude: ['shard place', 'shard quarter'],
    near: [51.5045, -0.0865],
    radius: 300,
    packRadius: 40,
    maxArea: 6000,
    minArea: 350,
    areaSource: 'The tower stands on about 1,400 m2 at ground level; the guard is '
      + 'set wide enough for whatever polygon OSM holds and far below the 23,071 m2 '
      + 'of the station block it sits inside. packRadius is 40 m because OS OpenMap '
      + 'Local has no footprint for this tower at all: with the size guard alone the '
      + 'model stopped taking the station block and started guessing at a 4,805 m2 '
      + 'neighbour 109 m away instead. There is nothing here for it to stand on, so '
      + 'it must stand on nothing and wait for OpenStreetMap, which does have the '
      + 'tower and names it.',
    nearSource: 'The tower\'s own coordinate. It falls inside OSM\'s building way for '
      + 'the Shard; it also falls inside the 23,071 m2 OS OpenMap Local footprint of '
      + 'the whole London Bridge station block, which is a separate building and '
      + 'stays as it is.',
    confidence: 'medium — the published heights are firm and the taper is now '
      + 'derived from the published floor area rather than fitted by eye',
    note: 'Two things defeat the ordinary pipeline here. OS OpenMap Local has no '
      + 'footprint for the tower at all: the Shard is inside a 372 by 310 m block '
      + 'that also holds London Bridge station, and that block measures 67.5 m to '
      + 'its highest band, so lidar can only ever say "station". And nothing else in '
      + 'the sim tapers, so even with OSM\'s height=309.6 the tower came out as 310 m '
      + 'of rectangular slab. The first fix over-corrected: it tapered to 0.306 of '
      + 'the base width by the top floor and then closed to a point, which is a cone '
      + 'and not this building. The profile below comes from the floor area instead, '
      + 'and the spire is eight separate blades because the real shards do not meet.',
    sources: [
      'Renzo Piano Building Workshop, Shard London Bridge: architectural height '
        + '309.6 m to the tip of the spire, 72 habitable floors.',
      'Wikipedia, The Shard: 127,071.3 m2 of floor space across 95 storeys; the '
        + 'level 72 viewing gallery at 244 m; a 66 m, 500-tonne spire above the main '
        + 'structure — which is what puts the top of the occupied tower at 243.6 m '
        + 'and makes everything above it spire rather than building.',
      'The floor-area arithmetic: a mean floorplate of 1,338 m2 over 95 storeys, '
        + 'with area falling as the square of the width, puts the top occupied floor '
        + 'between 0.43 and 0.67 of the base width depending on the base floorplate '
        + 'assumed. 0.54 is the middle of that, for a 2,200 m2 base.'
    ],
    parts
  }],
  known_gaps: 'The eight shards are blades of constant thickness rather than the '
    + 'true wedges, and they are spaced evenly around the tower where the real ones '
    + 'are not. The base floorplate is inferred from the total floor area, not '
    + 'surveyed, so the taper is a good estimate and not a measurement. The blades '
    + 'are sized as fractions of the mapped footprint, so a bad polygon makes a bad '
    + 'spire. And none of this has been seen in the sim from the machine that wrote '
    + 'it — it is checked in elevation by models/elevation.js, which draws the '
    + 'silhouette the renderer will build, and not by flying to it.',
  sources_caveat: 'Heights are published figures for the completed building. The '
    + 'taper is derived from published floor areas and is not a survey.'
};

fs.writeFileSync(path.join(__dirname, 'london.json'), JSON.stringify(out, null, 1) + '\n');
console.log('london.json: 1 model, ' + parts.length + ' parts');
