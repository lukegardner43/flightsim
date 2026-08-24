#!/usr/bin/env node
/* Writes models/bridges.json — Tower Bridge and the Clifton Suspension Bridge.
 *
 *     node models/build-bridges.js && node models/embed.js
 *
 * WHY THIS IS A SCRIPT AND NOT HAND-WRITTEN JSON. A chain is a curve, and the
 * only thing this renderer can build is a vertical prism: a ring extruded from
 * a floor to a ceiling. So a chain has to be written as several dozen short
 * prisms whose tops follow the curve, and nobody should type that out. The
 * parabola is here, once, and both bridges call it.
 *
 * HEIGHTS ARE METRES ABOVE THE WATER, not above the ground under each part.
 * Both models set datum:"anchor", which pads every part from the middle of the
 * bridge — over the river — instead of from the ground directly beneath it.
 * Without that, Clifton's chains would sag down into the Avon Gorge and climb
 * back out of it, because each prism would have taken the terrain under itself.
 *
 * THE DECK IS NOT HERE. The procedural bridge code draws it, eases it onto
 * both abutments and sets the height the traffic drives at. These models add
 * only what it cannot know: towers, chains and walkways.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* --- colours, read off photographs of both bridges --- */
const C = {
  granite:  '#8f8b84',   /* Tower Bridge's piers and facing */
  portland: '#b9b3a7',   /* the lighter dressed stone above */
  tbBlue:   '#3f6ea8',   /* the ironwork, painted blue since 1977 */
  tbRoof:   '#5c7c92',   /* the weathered copper-green-grey caps */
  cliftonS: '#9c9384',   /* Clifton's towers, left in rough stone */
  cliftonI: '#4a4a4c'    /* wrought iron */
};

/* A suspension chain, as short prisms whose tops follow a parabola.
 *
 * A uniformly loaded suspension chain IS a parabola, so this is the curve
 * itself and not an eyeballed approximation of one. y is measured from the
 * anchor pad; u runs along the span from its middle.
 *
 *   halfSpan  metres from the middle to each tower
 *   yMid      chain height at midspan
 *   yEnd      chain height where it meets the tower
 *   n         how many prisms across the whole span
 *   thick     how deep to draw the chain
 *
 * Each prism spans its segment's full height range plus the chain's own
 * thickness, so consecutive prisms overlap and the chain reads as a
 * continuous curve rather than a dotted line. Near the towers, where the
 * slope is steepest, that makes the chain visibly thicker — which is the
 * honest cost of having no sloping primitive to draw it with.
 */
function chain(opts) {
  const { halfSpan, yMid, yEnd, n, thick, v, colour, note } = opts;
  const y = u => yMid + (yEnd - yMid) * Math.pow(u / halfSpan, 2);
  const parts = [];
  const step = (2 * halfSpan) / n;
  for (let i = 0; i < n; i++) {
    const u0 = -halfSpan + i * step, u1 = u0 + step;
    const ya = y(u0), yb = y(u1);
    parts.push({
      atM: [(u0 + u1) / 2, v],
      w: step + 0.35,                /* a little overlap, so no gaps show */
      d: thick,
      minHeight: +(Math.min(ya, yb) - thick / 2).toFixed(2),
      height: +(Math.max(ya, yb) + thick / 2).toFixed(2),
      roof: 'flat', material: 'metal', colour,
      note: i === 0 ? note : undefined
    });
  }
  return parts;
}

/* The vertical rods from the chain down to the deck. Eighty-one a side on
 * Clifton; drawn at every `every`th station, because at 0.08 m thick they are
 * well under a pixel from any height you would fly this at, and two hundred
 * more parts to prove it would be two hundred parts of nothing. */
function hangers(opts) {
  const { halfSpan, yMid, yEnd, count, every, deck, v, colour } = opts;
  const y = u => yMid + (yEnd - yMid) * Math.pow(u / halfSpan, 2);
  const parts = [];
  for (let i = 1; i < count; i += every) {
    const u = -halfSpan + (2 * halfSpan) * (i / count);
    const top = y(u);
    if (top - deck < 1.2) continue;
    parts.push({
      /* 0.95 m square, not the 0.08 m the rods really are: the collector
         discards a model part under 0.8 m2 as a sliver, so anything drawn to
         scale here is silently thrown away. Twelve times too thick and
         visible beats true and absent, but it IS twelve times too thick. */
      atM: [+u.toFixed(2), v], w: 0.95, d: 0.95,
      minHeight: +deck.toFixed(2), height: +top.toFixed(2),
      roof: 'flat', material: 'metal', colour
    });
  }
  return parts;
}

const models = [];

/* ============================================================ Tower Bridge
 *
 * Two granite-and-Portland-stone towers standing in the river, a 61 m opening
 * between them that lifts, and 82 m of suspended span on each side. The
 * towers are the whole silhouette; the bascules are drawn down, which is how
 * the bridge is more than 99% of the time.
 */
{
  const deck = 9.0;          /* 29 ft of headroom under the closed bascules */
  const towerU = 40.5;       /* half the 61 m opening, plus half a tower */
  const towerTop = 65.0;     /* 213 ft above high water */
  const walk = 44.0;         /* 143 ft: the high-level walkways */
  const spanEnd = 132.5;     /* where the 82 m side spans reach the abutments */
  const parts = [];

  for (const s of [-1, 1]) {
    const u = s * towerU;
    /* the pier, out of the water to deck level */
    parts.push({ atM: [u, 0], w: 21, d: 20, minHeight: 0, height: deck + 1.5,
      roof: 'flat', material: 'stone', colour: C.granite,
      note: s < 0 ? 'north tower pier, granite, standing in the river' : undefined });
    /* the main shaft, deck to walkway level */
    parts.push({ atM: [u, 0], w: 19, d: 18, minHeight: deck + 1.5, height: walk,
      roof: 'flat', material: 'stone', colour: C.granite });
    /* the upper stage, above the walkways */
    parts.push({ atM: [u, 0], w: 16, d: 15, minHeight: walk, height: 55,
      roof: 'flat', material: 'stone', colour: C.portland });
    /* the pointed cap */
    parts.push({ atM: [u, 0], w: 13, d: 12, minHeight: 55, height: towerTop,
      roof: 'pyramidal', roofHeight: 9, material: 'stone', colour: C.portland,
      roofMaterial: 'lead', roofColour: C.tbRoof });
    /* the four corner turrets, which are most of why it reads as Tower Bridge */
    for (const du of [-1, 1]) for (const dv of [-1, 1])
      parts.push({ atM: [u + du * 7.5, dv * 6.5], w: 3.4, d: 3.4, sides: 8,
        minHeight: walk, height: 60,
        roof: 'cone', roofHeight: 7, material: 'stone', colour: C.portland,
        roofMaterial: 'lead', roofColour: C.tbRoof });
  }

  /* the two high-level walkways, between the towers at 44 m */
  for (const dv of [-1, 1])
    parts.push({ atM: [0, dv * 5.2], w: 61, d: 3.6, minHeight: walk, height: walk + 5.2,
      roof: 'flat', material: 'metal', colour: C.tbBlue,
      note: dv < 0 ? 'the high-level walkways, 44 m over the river' : undefined });

  /* the side spans: chains sloping from the towers down to the abutments.
     Half a parabola each — the curve runs from the tower out to the shore. */
  for (const s of [-1, 1]) for (const dv of [-1, 1]) {
    const inner = s * (towerU + 10), outer = s * spanEnd;
    const n = 16, yA = walk - 2, yB = deck + 4.5;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const u0 = inner + (outer - inner) * t0, u1 = inner + (outer - inner) * t1;
      const ya = yA + (yB - yA) * Math.pow(t0, 1.6), yb = yA + (yB - yA) * Math.pow(t1, 1.6);
      parts.push({
        atM: [+((u0 + u1) / 2).toFixed(2), dv * 5.2],
        w: Math.abs(u1 - u0) + 0.35, d: 1.0,
        minHeight: +(Math.min(ya, yb) - 0.5).toFixed(2),
        height: +(Math.max(ya, yb) + 0.5).toFixed(2),
        roof: 'flat', material: 'metal', colour: C.tbBlue
      });
    }
  }

  models.push({
    id: 'towerbridge',
    name: 'Tower Bridge',
    match: ['tower bridge'],
    exclude: ['tower bridge road', 'tower bridge approach', 'tower bridge wharf'],
    near: [51.5055, -0.0754],
    radius: 400,
    maxArea: 30000,
    minArea: 900,
    datum: 'anchor',
    replaceOutline: true,
    uBearing: 10,
    confidence: 'medium — every principal dimension is published; the taper of the '
      + 'towers and the profile of the side-span chains are read off elevations',
    nearSource: 'The centre of the opening span. It falls inside the man_made=bridge '
      + 'outline OpenStreetMap holds for Tower Bridge.',
    note: 'The deck is NOT here: the procedural bridge code draws it, eases it onto '
      + 'both abutments and carries the traffic. What is here is the half that code '
      + 'cannot know — two towers, two high-level walkways and the side-span chains. '
      + 'The bascules are modelled down, which is how the bridge stands almost all '
      + 'of the time.',
    sources: [
      'Wikipedia, Tower Bridge: 940 ft (290 m) overall; 200 ft (61 m) central span '
        + 'between the towers; 270 ft (82 m) side spans; towers 213 ft (65 m) high.',
      'Wikipedia: the high-level walkways are 143 ft (44 m) above the river at high '
        + 'tide; headroom under the closed bascules is 29 ft.',
      'Wikipedia: each tower is a skeleton of steelwork faced with granite and '
        + 'Portland stone, backed with brickwork on the inside faces.'
    ],
    parts
  });
}

/* =============================================== Clifton Suspension Bridge
 *
 * Brunel's span over the Avon Gorge: two rough stone towers, 214 m apart, and
 * three wrought-iron chains a side dipping 21.34 m to within a metre of the
 * deck at midspan. The deck is 75 m over the water, which is the number that
 * makes the anchor datum necessary — pad each part from the ground under it
 * and the chains would follow the gorge.
 */
{
  /* Heights here are metres above the ground at the Clifton tower — the
     clifftop — and NOT above the water 75 m below. The deck runs level from
     clifftop to clifftop, so every number below is small, and none of them
     depends on how deep the terrain thinks the Avon Gorge is. That matters:
     the terrain is a DEM at about 22 m a sample, which part-fills a gorge
     250 m wide, and anchoring at mid-span would have floated the whole model
     above the deck by however much of the gorge the DEM had filled in. */
  const deck = 3.0;              /* the deck, above the ground at the tower */
  const halfSpan = 107.02;       /* 702 ft 3 in between the towers */
  const sag = 21.34;             /* 70 ft */
  const yMid = deck + 0.91;      /* the centre rod is 3 ft long */
  const yEnd = yMid + sag;
  const towerTop = deck + 26.0;  /* 86 ft above the deck */
  const parts = [];

  for (const s of [-1, 1]) {
    const u = s * halfSpan;
    parts.push({ atM: [u, 0], w: 9.5, d: 13, minHeight: 0, height: towerTop - 3,
      roof: 'flat', material: 'stone', colour: C.cliftonS,
      note: s < 0 ? 'the tower, standing on the clifftop' : undefined });
    /* the tapered head the chains pass over */
    parts.push({ atM: [u, 0], w: 8.6, d: 12, minHeight: towerTop - 3, height: towerTop,
      roof: 'flat', material: 'stone', colour: C.cliftonS,
      note: s < 0 ? 'the saddle head: the chains pass over the tower here' : undefined });
  }

  /* three chains a side, drawn as one band. At any height you would fly this
     at, three parallel eyebar chains 0.4 m apart are one line. */
  for (const dv of [-1, 1]) {
    parts.push(...chain({
      halfSpan, yMid, yEnd, n: 72, thick: 1.1, v: dv * 4.5, colour: C.cliftonI,
      note: dv < 0 ? 'the chains: three wrought-iron chains a side, drawn as one '
        + 'band, dipping 21.34 m from the saddles to a metre above the deck' : undefined
    }));
    parts.push(...hangers({
      halfSpan, yMid, yEnd, count: 81, every: 6, deck, v: dv * 4.5, colour: C.cliftonI
    }));
  }

  models.push({
    id: 'clifton',
    name: 'Clifton Suspension Bridge',
    match: ['clifton suspension bridge'],
    exclude: ['clifton suspension bridge road'],
    near: [51.4549, -2.6278],
    radius: 500,
    maxArea: 20000,
    minArea: 500,
    datum: 'anchor',
    datumAtM: [115, 0],
    replaceOutline: true,
    uBearing: 103,
    confidence: 'medium-high on the form — span, sag, deck height and tower height '
      + 'are all published figures, and the chain between them is a parabola, which '
      + 'is what a loaded suspension chain actually is',
    nearSource: 'Mid-span. It falls inside the man_made=bridge outline OpenStreetMap '
      + 'holds for the bridge.',
    note: 'Heights here are metres above the ground at the Clifton tower, not above '
      + 'the water 75 m below and not above the ground under each part. Two things '
      + 'forced that. Parts padded individually would have had the chains dipping '
      + 'into the gorge and climbing out again, following the terrain instead of '
      + 'crossing it. And padding from mid-span, the obvious fix, anchors the model '
      + 'to the least trustworthy height anywhere near the bridge: the terrain is a '
      + 'DEM at roughly 22 m a sample and a gorge 250 m wide comes back part-filled, '
      + 'so the whole model would have floated above the deck by whatever the DEM '
      + 'had filled in. An abutment is flat, well sampled, and is what the '
      + 'procedural deck takes its own height from — so anchoring there puts the '
      + 'chains on the deck the traffic actually drives on.',
    sources: [
      'Wikipedia, Clifton Suspension Bridge: 1,352 ft (412 m) total; main span '
        + '702 ft 3 in (214.05 m); towers 86 ft (26 m) above the deck; deck 245 ft '
        + '(75 m) above high water; deck 31 ft (9.45 m) wide.',
      'Wikipedia: three independent wrought iron chains per side, dipping 70 ft '
        + '(21.34 m); eighty-one vertical wrought-iron rods a side, from 65 ft (20 m) '
        + 'at the ends to 3 ft (0.91 m) at the centre.',
      'Wikipedia: the towers were left in rough stone rather than finished in the '
        + 'Egyptian style originally drawn.'
    ],
    parts
  });
}

const out = {
  id: 'bridges',
  name: 'Bridge landmarks',
  produced_on: new Date().toISOString().slice(0, 10),
  method: 'Superstructure only. The procedural bridge code already draws a deck, '
    + 'eases it onto its abutments and carries the traffic across it; what it '
    + 'refuses to guess is the thing above the deck, which on these two bridges is '
    + 'the whole of what they look like. Towers are stacked prisms. Chains are '
    + 'parabolas — which is the curve a uniformly loaded suspension chain takes — '
    + 'sampled into short prisms, because a prism is the only solid this renderer '
    + 'builds. Both models pad every part from mid-span rather than from the ground '
    + 'under each part, so a span crosses its valley instead of following it.',
  confidence_scale: 'high = dimensions from the structure\'s own drawings. '
    + 'medium-high = every principal dimension published and the curve between them '
    + 'is the real one. medium = principal dimensions published, profile read off '
    + 'elevations.',
  models,
  known_gaps: 'No sloping or curved solid exists, so every chain is a staircase of '
    + 'short vertical prisms. It reads as a curve from the air and as steps from '
    + 'underneath it, and the steps are coarsest near the towers where the chain is '
    + 'steepest. Clifton\'s three chains a side are drawn as one band and its 81 rods '
    + 'a side are drawn at every sixth station and 0.95 m thick against a real '
    + '0.08 m, because a part under 0.8 m2 is discarded as a sliver before it '
    + 'reaches the screen. Tower Bridge\'s bascules are always '
    + 'down and its towers are simplified to four stacked blocks with corner turrets. '
    + 'Neither model has been seen: no OpenStreetMap data could be reached from the '
    + 'machine that wrote them, so both are checked by geometry rather than by eye.',
  sources_caveat: 'Dimensions are published figures for each bridge as built. The '
    + 'chain profiles are parabolas fitted between published saddle and midspan '
    + 'heights, not surveys of the real curve.'
};

fs.writeFileSync(path.join(__dirname, 'bridges.json'), JSON.stringify(out, null, 1) + '\n');
const n = models.reduce((a, m) => a + m.parts.length, 0);
console.log('bridges.json: ' + models.length + ' models, ' + n + ' parts');
