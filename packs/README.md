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
2. Click **Build a building pack** in the left-hand list.
3. Click the **Run workflow** button on the right.
4. Type a postcode — `KT23 3HP` — and click the green **Run workflow**.

Wait a few minutes. The job downloads the Ordnance Survey data, converts it,
clips it to a 10 km square around that postcode, and commits the pack to this
repository by itself.

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
shapefile bundle (one file *per* layer). The workflow reads both — the first
run tripped on this, because in a shapefile bundle the buildings are a
filename rather than a layer name, and picking the first `.shp` in the folder
lands on motorway junctions.

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
