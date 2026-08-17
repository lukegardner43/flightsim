# Landmark models

## What these are

A named landmark drawn from its footprint alone is a box with a roof on it. A
church becomes a shed; a country house becomes an office block. These files add
the vertical structure the map does not carry — a tower, a spire, a wing, a
pediment — so the things you navigate by look like themselves from the air.

They are written by a language model from knowledge. Not survey, not
photographs, not drawings. Each model records its own confidence, and
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

Then run `node models/embed.js`, which writes `models/<id>.js` and registers it
in `index.html`. `node models/embed.js --check` fails if they are out of sync.

## Judging them

Fly the place and look. `window.__sim.models()` in the console lists what was
loaded and what matched. If a model does not appear, in order of likelihood:
OSM has no footprint for it; OSM spells the name differently from `match`; or
your `near` is further out than `radius`.
