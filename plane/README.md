# The aircraft

## What is here

`hawk.js` is a BAE Hawk T1 — the aeroplane the Red Arrows fly — converted
from a glTF binary by `glb-to-js.js` and painted in Red Arrows colours on the
way through. `index.html` loads it the way it loads a building pack.

## Why it is javascript and not a .glb

This page has to keep working when it is opened straight off a disk, and a
`file://` page may load a script but may not read a file. That is the same
reason the building packs and the landmark models are `.js`. It also means
there is no GLTFLoader at runtime — decoding is about forty lines in
`index.html`, against a dependency that would have to be fetched.

## Converting a different aeroplane

```
node plane/glb-to-js.js --in something.glb --id hawk --span 9.39 \
     --drop "Wheel,Strut,Jaw,Doors,DoorBox"
```

- `--span` is the real wingspan in metres. Everything is scaled from it, so
  the aeroplane comes out the right size next to the buildings.
- `--drop` removes parts by name. The landing gear goes because a display jet
  flies with it up, and it is a quarter of the file.

The converter works out the rest from the geometry: which axis is the span
(the *smaller* of the two horizontal extents — an aeroplane is longer than it
is wide), which way the nose points (from where the parts with "Nose" in their
names are), and where a roundel belongs (by sampling the wing skin itself).

## The livery

The model arrives untextured with its parts named — `Fuselage`, `Rudder`,
`Canopy_Glass`, `SeatFront` — which is a better starting point than a texture
would be. `glb-to-js.js` maps those names to roles, and roles to colours, and
bakes the result in as vertex colours: red airframe, a white flash with a blue
cap high on the fin, dark glass, grey engine, dark cockpit. Roundels are added
at runtime as decals, because they are drawn to a canvas rather than being
geometry.

To reskin it, change `livery()` in the converter and re-run. Nothing in
`index.html` needs to know.

## Size

Positions are quantised to 16 bits across the model's own bounding box,
normals and colours to 8, then base64'd — about a third of the size of the
same numbers as JSON, with an error well under a millimetre at this scale.
24,082 triangles come to 467 KB.

## Provenance

The model was supplied rather than found. Its glTF `copyright` field is empty
and its `generator` says Sketchfab, so its licence is not recorded anywhere in
the file — worth establishing before this repository is used publicly.
