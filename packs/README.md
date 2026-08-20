# Filling OpenStreetMap's gaps with Ordnance Survey

## What this does

OpenStreetMap's coverage of *which buildings exist* varies place to place. Some
villages have every shed mapped; others are missing whole streets. **OS OpenMap
Local** is Ordnance Survey's surveyed building-footprint layer for the whole of
Great Britain, free to use. A "pack" is that data for one area, stored in this
repository, used to fill in the buildings OSM doesn't have.

## How to build one

Everything happens on github.com. You don't need to install anything.

1. Go to the **Actions** tab of this repository.
2. Click **Build building packs** in the left-hand list.
3. Click the **Run workflow** button on the right.
4. Type one or more postcodes — `KT23 3HP, DH1 3LE` — and click the green
   **Run workflow**.

Wait a few minutes. The job works out which tiles those places need, downloads
the Ordnance Survey data, converts it, and commits the packs by itself.

## Tiles, not postcodes

A pack covers one **10 km Ordnance Survey tile** — `TQ15`, `NZ24` — named the
way a paper map names it, not one postcode. The sim's world is 10 km across,
so flying anywhere needs at most four of them, and it loads exactly those.

This matters because coverage accumulates. Two postcodes a mile apart want
almost the same ground; per-postcode packs would store it twice and draw it
twice. Per-tile packs share it, and building the second postcode costs only
the tiles it actually adds — often none at all. The workflow says so when it
happens and does nothing.

Which tile a footprint belongs to is decided in British National Grid, on its
first corner, so the tiles partition the country exactly. Nothing is stored
twice and nothing falls down the gap where two of them meet.

Older packs built around a postcode carry a bounding box instead of a tile id.
The sim still reads them, so nothing has to be rebuilt.

Then fly that postcode in the sim. The loading card will say
`OS pack: KT23 3HP`, and the report will tell you exactly what it added:

```
pack  kt233hp (KT23 3HP) loaded - drew 312, skipped 1,171 already in OSM
```

That's the honest measure of whether OSM was missing anything: **drew** is what
OS had and OSM didn't; **skipped** is what OSM already had, left alone.

## The rules it follows

- **OpenStreetMap always wins.** A pack footprint is drawn only where OSM has
  no building overlapping it. Nothing OSM knows about is replaced or moved.
- **Packs are footprints only.** OS publishes no heights, no building types and
  no materials, so a filled-in building goes through exactly the same height
  estimator as an untagged OSM one — and if you tick the AI interpretation on
  the setup screen, that dresses pack buildings too. The two work together: OS
  says *where*, the AI says *what it probably looks like*.
- **A pack also works with no internet map servers at all.** If Overpass is
  down or blocked, the pack alone still gives you a world to fly over.

## If the workflow fails

Open the failed run and read the step that went red — each one prints what it
found before it uses it.

- **"postcode not found"** — check the postcode, or that it's in Great Britain.
  Northern Ireland is not covered by OpenMap Local.
- **"nothing downloadable for XX"** or **"no building shapefile in the
  download"** — Ordnance Survey changed what it publishes. Both steps print
  exactly what they found before giving up: the download step lists every
  format and area on offer, and the convert step lists the files that actually
  arrived. Paste that into the chat and it's a one-line fix.
- **The job times out or the file is huge** — some grid squares are large. Try
  a smaller `radius` (the third input), or tell me and I'll add per-tile
  downloading.

OS ships this data as either a GeoPackage (one file, many named layers) or a
shapefile bundle (one file *per* layer). The workflow reads both, and takes
**every** building layer it finds — OS keeps ordinary buildings and
"important" ones (schools, hospitals, civic buildings) in separate layers, and
you want both.

## Details, if you want them

**Why a `.js` file and not JSON?** The sim is a single page that also works
opened straight from a folder, where a page may load scripts but may not read
files. So a pack is a script that calls `TF_PACK({...})`, injected when your
home point falls inside its square. A missing or slow pack times out after 20
seconds and the sim carries on without it.

**When the merge happens.** After every map request has finished, because "OSM
has nothing here" only means something once OSM has finished answering. Once a
pack has filled the square, the sim stops streaming extra OSM squares ahead of
the aircraft — that exists to fetch what the plan didn't, and now the plan has
it.

**Size.** Footprints are stored as differences between corners at about 10 cm
resolution. A village 10 km square is roughly 300–800 KB; a market town 1–2 MB.

**Building one on your own machine instead** (only if you want to — the
workflow above is the supported route): export the `building` layer of an
OpenMap Local GeoPackage to GeoJSON, then

```
node packs/plan-tiles.js "KT23 3HP"            # which tiles are needed
node packs/make-pack.js --in buildings.geojson --tiles TQ04,TQ05,TQ14,TQ15
```

The older single-square form still works:

```
node packs/make-pack.js --in buildings.geojson --id kt23 \
     --name "Great Bookham" --postcode "KT23 3HP"
```

If the export is still in British National Grid coordinates, the script detects
that and converts them itself.

## Licence

Packs are derived from OS OpenMap Local and carry this attribution inside each
pack file — keep it if you share them:

> Contains OS data © Crown copyright and database right. Open Government
> Licence v3.

## Measured heights, from lidar

A footprint pack says where the buildings are. It can also say how tall they
are, and what shape their roofs are, because England publishes a 1 m lidar
surface under the same Open Government Licence — tiled on the same Ordnance
Survey grid these packs already use.

```
Actions -> "Measure building heights from lidar" -> type a tile, e.g. TQ15
```

That adds one packed integer per footprint: eaves height in decimetres, roof
height, ridge bearing, roof shape. About ten bytes a building.

**Why it matters more than it sounds.** Without it the sim guesses every
height from the footprint, and the AI profile guesses better but is still
guessing — the report counts those buildings `estimated`, never `measured`.
With it they are measured, to about ±0.5 m, and the roof shape is fitted
rather than inferred from the proportions of the plan.

**What takes a reading.** A footprint the pack draws takes its own. An OSM
building takes the reading of whichever surveyed footprint it stands on,
matched by the OSM centroid falling inside the OS ring. That direction is
deliberate: Ordnance Survey draws a terrace as one polygon, so every house in
the row lands inside it and every house gets the height. The other way round
would measure one and leave five guessed.

It only fills where OSM said nothing at all. A building carrying `height=` or
`building:levels=` keeps them, exactly as with everything else here.

### How the fit works

`packs/roof-fit.js` has no I/O and no dependencies, so it can be tested
against a surface whose answers are known — and that test earned its keep:

- Over a pitched roof the heights are spread almost evenly between eaves and
  ridge, because a roof is a ramp and every band of it has the same area. A
  quarter of the way up the distribution is most of a metre of wall that is
  not there.
- An OS footprint is the wall **face**, so a metre grid over it catches a ring
  of garden — on a small house, forty per cent of the samples. Percentiles
  then measure the lawn: a semi came out with its eaves at zero.
- A chimney is two or three samples. Read as the ridge it made an eight metre
  house eleven metres tall, and left in the profile it made a gabled house
  look hipped.
- A pyramid is told from a hip by the plan being square, not by how much the
  ends drop. The other way round called every hipped bungalow a pyramid.

### The first real square

`515000,152000,2000` — two kilometres of TQ15 out in the farmland east of
Bookham, run on 20 August 2026:

```
measured 106 of the 136 footprints in the square
mean eaves 2.81 m, mean ridge 5.88 m
hipped 39%, gabled 39%, flat 16%, pyramidal 7%
```

Then flown: the sim found the 106 and 105 buildings took a reading, moving
from `estimated` to `measured` — 1,058 measured before, 1,163 after.

Two things worth reading off that. The heights are low because this square is
farm buildings and outbuildings rather than village housing, which is a fair
description of that ground. And the roof shapes are a genuine check on the AI
profile, which had never been tested against anything: it guessed hipped 46%,
gabled 44%, pyramidal 7%, flat 3%. Lidar says 39 / 39 / 7 / 16. The
hipped-and-gabled-in-equal-measure claim holds, pyramidal is exact, and flat
is five times commoner than guessed — which is what a square full of
outbuildings would do to it.

### Coverage and the awkward bits

England is about 99% covered. **Scotland and Wales publish equivalent
surfaces under the same licence but through different portals** — the
Scottish Remote Sensing Portal (phases 1–6, plus a national programme running
to 2027) and Natural Resources Wales (~70%) — so those need their own
download step. The measuring half is the same.

The download is the awkward part, and three separate things had to be
learned from failed runs rather than from documentation:

1. **The DSM service was renamed.** It is
   `lidar-composite-digital-surface-model-**last-return**-dsm-1m` now; the
   obvious name 404s. The workflow asks each candidate rather than assuming,
   and prints what it finds — run it with `probe_only` to see that in seconds.
2. **The thirty second timeout is the WCS driver's own**, set in the service
   description, and it ignores `GDAL_HTTP_TIMEOUT` completely.
3. **The request size is the chunk size, not the block size.** Each chunk is
   one GetCoverage, so a 2 km chunk asks for a 16 MB response — more than
   thirty seconds over this link. 1 km chunks are 4 MB and about eight
   seconds. The server also returns the odd 502 under sustained load, so each
   square gets five attempts with a lengthening pause.

4. **Leave `pack` blank.** It used to default to the tile's own name, and the
   first run that downloaded perfectly then died on `no pack at packs/tq15.js`
   — because the only pack in this repository is named after a postcode. The
   pack covering the square is found by asking each one whether it holds any
   of that ground.

**Type a postcode.** `place` takes a postcode or an OS tile, `size` is how
many metres square to measure around it:

```
place  KT23 3HP        size  2000        (leave pack and square blank)
```

is the 2 km around Great Bookham — **2,929** of the tile's 20,630 footprints,
about a minute. Leave `size` blank for the whole 10 km tile: 14,918
footprints, roughly half an hour.

A grid reference is a poor thing to ask anyone for. The first square measured
for real was one suggested from memory, `515000,152000` — inside TQ15, but
farmland with 136 buildings in it rather than the village with thousands.
`square` still takes an exact `E,N,size` for when you would rather say where.

Squares accumulate. Footprints outside the square being measured keep whatever
reading they already had, so you can do the village, look at it, and fill in
the rest later. And a square that will not download after five attempts is
left out of the mosaic rather than failing the run — the buildings under it
simply keep no reading, and the log says how many were lost.

### The massing inside the footprint

One height per building is a lie about most British houses. A two-storey front
with a single-storey rear extension, a terrace where one house has a loft
conversion and its neighbour does not, a barn with a lean-to — the surface
shows every one of those as a clean step, and drawing them as one box throws
it away.

`fitParts` walks one axis of the footprint in two-metre slices, takes the
median height of each, and groups the slices that agree. The pack then carries,
per building, the axis as a bearing and each part as a fraction along it, so
the sim can rebuild the cut lines from the surveyed outline alone. Each piece
keeps the tags of the whole — its class, its wall texture, its colour — and
takes its own height and roof.

One axis, not two, and the one with the bigger step in it. Two would let a
semi with a rear extension become four boxes on evidence that does not support
four, and the common British cases — front-to-back, and along-the-terrace —
are each a single axis.

Three things that test found, all of which were wrong first:

- The slice that straddles the step reads as neither height and became a part
  of its own, so a house with a rear extension came out as three boxes with a
  sliver of ramp between them. Neighbours closer together than a real step are
  fused back.
- The step is a **wall**, not roof, and sampling it as roof dragged a
  two-storey house's eaves down by more than a metre. Each part is described
  from its own middle, stepping back from any boundary it shares.
- Plain buildings must not be split at all. A semi, a flat-roofed block and a
  terrace of one height all come back with no parts, and that is checked as
  carefully as the splitting is.

**A lidar surface cannot do bridges.** It is one height per square metre with
no concept of "under" — a bridge comes out as solid ground where the gap
should be. Bridge decks stay procedural, and bridge superstructure stays
hand-modelled.

Data: Environment Agency LIDAR Composite DSM/DTM 1 m. Contains public sector
information licensed under the Open Government Licence v3.
