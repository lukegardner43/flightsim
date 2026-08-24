# Landmark models

## What these are

A named landmark drawn from its footprint alone is a box with a roof on it. A
church becomes a shed; a country house becomes an office block. These files add
the vertical structure the map does not carry — a tower, a spire, a wing, a
pediment — so the things you navigate by look like themselves from the air.

The ten landmarks of `kt23-3hp.json` now follow an uploaded brief — *Landmark
Building 3D Modelling Brief, KT23 3HP* — which carries a written architectural
specification per building and, for six of them, an embedded reference
photograph. Those photographs were read: the brief says the imagery governs
where it and the text disagree, and it does disagree. Polesden Lacey's walls
are ochre render, not brick, and its cupola is a square white lantern, not the
tall octagon its listed-building entry describes. Thorncroft Manor is white
stucco, not the red brick the brief's own text asks for. Both were modelled
from the photograph.

The four entries that came with no photograph, and every model outside that
brief, are still written by a language model from knowledge or from
listed-building descriptions. Each model records its own confidence, and
`known_gaps` at the bottom of each file says what it does not attempt.

## The rule that makes this safe

**A model attaches to a building OpenStreetMap has actually mapped. It never
places one.**

Matching is by name, near a given point. If OSM has no footprint there, or the
name does not match, *nothing is drawn*. So a model can be wrong about what a
building looks like — but it can never invent a building that is not there, and
it can never put one in an empty field.

Parts are positioned in **fractions of the real footprint's own oriented box**,
not in metres from a fixed origin. A spire specified at the west end of the
nave lands at the west end of whatever nave OSM actually holds, at whatever
size and angle it really is. That is also why the coordinates in these files
can be approximate: they exist only to stop one `St Mary's Church` matching
another, which is why the match radius is generous.

## What comes out

Each part becomes an ordinary OSM `building:part`, so it goes through exactly
the same renderer as the 3D buildings OSM contributors model by hand, and
counts in the same `modelled` tier. The report says how it went:

```
models   10 landmark models loaded, 10 matched a mapped building: Polesden
         Lacey, St Nicolas Church, Great Bookham, St Barnabas Church, ...
```

## Writing one

Copy `kt23-3hp.json`. A model is:

```jsonc
{
  "id": "stnicolas",
  "name": "St Nicolas Church, Great Bookham",
  "match": ["st nicolas", "st nicholas"],   // substrings, case-insensitive
  "near": [51.2799, -0.3746],               // approximate is fine
  "radius": 500,                            // metres
  "confidence": "high on the form",
  "note": "why it looks like this",
  "parts": [
    { "on": "footprint", "height": 9.5, "roof": "gabled", "roofHeight": 5,
      "type": "church", "material": "stone", "roofMaterial": "tile" },
    { "at": [-0.88, 0], "w": 6.5, "d": 6.5, "height": 15,
      "roof": "flat", "type": "church", "material": "stone" },
    { "at": [-0.88, 0], "w": 5.4, "d": 5.4, "minHeight": 15, "height": 31,
      "roof": "cone", "roofHeight": 12, "type": "church",
      "material": "wood", "roofMaterial": "wood" }
  ]
}
```

- `on: "footprint"` uses the real mapped outline. **Every model needs exactly
  one** — it is what replaces the plain box. `models/embed.js` refuses to build
  a model without one, because otherwise the box survives underneath the parts
  you added.
- `at: [u, v]` places a part in fractions of the footprint's half-length and
  half-width: `[-0.88, 0]` is near one end on the centre line, `[0, 0]` is the
  middle. `w` and `d` are metres, `rot` is degrees off the long axis.
- `minHeight` stacks a part on top of another — that is how a spire sits on a
  tower.
- `type` is the building type the part represents. It drives the wall material,
  so a church tower is masonry rather than the office curtain wall a typeless
  volume would default to.
- `roof`: `flat`, `gabled`, `hipped`, `pyramidal`, `cone`, `dome`, `onion`,
  `skillion`. `material` / `roofMaterial` take OSM values (`stone`, `brick`,
  `plaster`, `slate`, `tile`, `lead`, `wood`).
- `taper` shrinks the plan as the part rises: `0.6` means the top is six
  tenths the size of the bottom, about its own middle. A tapered part gets no
  roof and no parapet — both are built from the base ring, and on a spire that
  is a ground-floor-sized lid hanging in the air.
- `plan` scales an `on: "footprint"` part before it is built, so a tower can
  be a stack of pieces that all keep the shape of the polygon somebody
  surveyed instead of becoming rectangles guessed in metres. Give each piece
  the `plan` its neighbour below tapered down to and the joins do not show:
  `taper: 0.6` then `plan: 0.6`.
- `uBearing` is a compass bearing saying where the model's own `+u` points.
  Without it the frame comes from the footprint's longest edge, with a swap so
  `u` is the longer half — decisive on a long building, and a coin-toss on a
  square one. Polesden Lacey is 58.9 m east to west by 59.5 m north to south,
  so that swap turned on 1.3 m: the orientation of every part of the house was
  being chosen by rounding, and a re-survey moving one corner would have
  turned it ninety degrees with nothing to say so. The building's own axes are
  kept — Polesden's ranges run at 13 and 103 degrees, and squaring them to the
  compass would be its own error — so the bearing only picks which of the four
  is `u`. `packs/test/orienttest.js` rasterises a model's ground plan against
  the surveyed outline and fails if any of the eight placements (four
  rotations, each mirrored) fits better than the pinned one.
- `atM: [u, v]` places a part in METRES from the model's centre instead of in
  fractions of the outline. Use `at` for a building — its outline IS the
  building, so fractions adapt to whatever polygon was surveyed. Use `atM` for
  a bridge: the outline is whatever somebody drew around it, and may stop at
  the abutments or run on down the approach roads, while the span and the
  tower spacing are published in metres. Fractions of an unknown length put
  Tower Bridge's towers wherever the mapper's rectangle happened to end.
- `datum: "anchor"` pads every part of the model from one point — the anchor —
  instead of each part taking the ground directly under itself. Heights are
  then metres above that one datum. Only a model that SPANS something needs
  this, and it needs it absolutely: Clifton's deck is 75 m over the Avon and
  its chains hang between two clifftops, so padded part by part the chain
  would sag into the gorge and climb back out, following the terrain instead
  of crossing it.
- `maxArea` / `minArea`, in square metres, say how big the building is. Only
  the anchor uses them, and only when a building is unnamed — but that is the
  case that matters, because standing inside a ring stops being evidence when
  the ring is a hectare. Without one, London Bridge station is a candidate for
  the Shard.

## The lidar cannot see a tower inside a big block

Worth knowing before writing a model to fix something the pipeline "got
wrong". The height fitter takes the 94th percentile of the samples inside a
footprint as its ridge, which is what stops a chimney making a house three
metres taller. On a large footprint with something tall standing on a small
part of it, that percentile is in the low roof and the tall thing is gone.

Measured, not argued: a synthetic 372 x 310 m block at 20 m with a perfect
310 m tower in one corner — the London Bridge site as the lidar has it —
fits to **20.0 m, shape flat**. The tower is half a per cent of the cells.
No improvement in lidar changes that answer, which is why the Shard is a
model and not a measurement.

Then run `node models/embed.js`, which writes `models/<id>.js` and registers it
in `index.html`. `node models/embed.js --check` fails if they are out of sync.

## Judging them

Fly the place and look. That is still the test, and `window.__sim.models()` in
the console lists what was loaded and what matched.

When you cannot fly — the sim takes its buildings from Overpass at runtime, so
a machine that cannot reach Overpass cannot look at any model at all — draw the
silhouette instead:

```
node models/elevation.js shard                 an SVG elevation, in /tmp
node models/elevation.js clifton --span 260    a bridge, on a 260 m outline
```

It runs the real `modelParts` out of `index.html` against a stand-in footprint
and draws every part it returns as the prism the renderer will extrude, tapers
included. So the silhouette it draws is the silhouette the sim will build. It
says nothing about materials, light or the roof shapes on untapered parts — it
answers "what shape is this", which is the question a model gets wrong first.

The Shard is why it exists. It was written blind, and it was a smooth cone
converging to a needle: 0.306 of its base width at the top occupied floor where
the published floor area says 0.54, and then a solid point on top of a building
whose whole name is that its shards do not meet. Nobody could see that from the
JSON, and every number in the JSON was internally consistent.

Fly the place and look. `window.__sim.models()` in the console lists what was
loaded and what matched. If a model does not appear, in order of likelihood:
OSM has no footprint for it; OSM spells the name differently from `match`; or
your `near` is further out than `radius`.

## Heights are written to the eaves, stored to the ridge

OpenStreetMap's `height` is the whole building including its roof, and the
renderer clamps a roof to leave at least 1.2 m of wall under it. A part
written as `height: 18.4, roofHeight: 9.6` therefore gets no roof at all —
which is how St Nicolas' spire came to be missing. The authoring script adds
the roof height on and checks the clearance; the JSON stores the total.

## Courtyard houses are relations, not ways

A building with a hole in it — a quadrangle round a courtyard — is a
multipolygon RELATION in OpenStreetMap, and a relation carries member ways
rather than geometry of its own. `modelFor` used to read the building's
position straight off `e.geometry`, so it could never attach to one, and
Polesden Lacey is precisely that shape. It now reads the anchor from the
first outer member when there is no geometry.

## `exclude`

Everything on the Polesden Lacey estate is called Polesden Lacey something,
and `match` is a substring test, so the house model landed on the stable
block too. A model may list `exclude` substrings that veto a match.

## When a model does not appear

The report says so. Any name that matched a model and was then turned away —
by `exclude`, or by being outside `radius` — is listed under `models` with the
distance, so "it isn't there" becomes "it is 840 m from where the model
expects it" without anyone having to guess.

## Small parts

A chimney stack is about two metres square, and the collector rejects parts
under 6 m² because that is what multipolygon slivers look like. Model parts
carry `tf:part=model` and get a 0.8 m² floor instead, so a stack, a colonnade
column or a stair turret survives while a degenerate ring still does not.

## Bridges

A bridge model supplies the superstructure and never the deck.

The procedural bridge code in `index.html` already draws a deck, eases it onto
both abutments, gives it parapets and sets the height the traffic drives at.
What it refuses to do is guess the thing above the deck — and on a suspension
or a cantilever bridge that is the whole of what the bridge looks like.

So a named bridge keeps its deck and loses only its piers, which would
otherwise march straight through the towers the model brings. `modelClaims`
is what decides, and it honours `exclude`: "Tower Bridge Approach" and "Tower
Bridge Road" both contain "tower bridge", and claiming them would take the
piers out from under two ordinary viaducts that need them.

The earlier rule was that a claimed bridge was "left entirely to that model",
which sounded right and was not: with no model ever written against it,
nothing had tested what it did. It skipped the deck as well as the piers, so
the road lay flat on the water with the towers standing over it.

A model attaches to the `man_made=bridge` AREA, not to the `bridge=yes` way.
Most bridges have only the way, so most bridges cannot carry a model at all
yet — and when the area is missing the model simply does not appear, the deck
draws as it always did, and the report says so. That is the same rule the
buildings follow: a model can be wrong about what something looks like, but it
can never put one where nothing is.

`packs/check-model-sites.js` cannot check a bridge. It holds a model's
coordinate against Ordnance Survey building footprints, and OS does not survey
bridges as buildings — so both bridges report "nothing under this coordinate",
which is the expected answer and not a fault. `packs/test/bridgetest.js` is
the check that applies: it runs the real `modelParts` against a synthetic
bridge outline and looks at where the parts actually landed.
