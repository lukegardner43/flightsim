# Local building packs (OS OpenMap Local)

## Why

OpenStreetMap's coverage of *which buildings exist* varies village by village —
some places have every garden shed mapped, others are missing whole streets.
Ordnance Survey's **OpenMap Local** is a surveyed building-footprint layer for
all of Great Britain, free under the Open Government Licence. A pack made from
it fills OSM's gaps for one area.

The merge rule is strict, and worth stating plainly:

- **OSM wins.** A pack footprint is drawn only where OSM has no overlapping
  building. Nothing OSM knows about is replaced or moved.
- **Packs carry footprints only.** OpenMap Local has no heights, no types and
  no materials, so a filled footprint goes through the same estimator as any
  untagged OSM building — and the AI interpretation, if switched on, dresses
  it like everything else.
- **The report says what happened**: `pack kt23 (Great Bookham) loaded - drew
  312, skipped 1,171 already in OSM`.

## Making a pack

1. **Download OpenMap Local** for your 100 km grid square (e.g. `TQ` for
   Surrey/London) from the OS Data Hub: <https://osdatahub.os.uk/downloads/open/OpenMapLocal>
   — choose the **GeoPackage** format. No account or API key is needed.

2. **Export the `building` layer as GeoJSON** in WGS84. With GDAL installed:

   ```
   ogr2ogr -f GeoJSON buildings.geojson OMLOCAL_GB.gpkg building -t_srs EPSG:4326
   ```

   (In QGIS: load the GeoPackage, right-click the *building* layer → Export →
   Save Features As → GeoJSON, CRS EPSG:4326.)

   If you skip `-t_srs`, that's fine — the script detects British National
   Grid coordinates and converts them itself (accurate to a few metres).

3. **Build the pack**, centred on the place you fly from:

   ```
   node packs/make-pack.js --in buildings.geojson --id kt23 \
        --name "Great Bookham" --centre 51.2790,-0.3760 --radius 5200
   ```

   This writes `packs/kt23.js` and registers it in `index.html`'s manifest.
   The default radius (5,200 m) covers the sim's whole 10 km square.

4. Commit both files. Anyone flying inside the pack's square gets it
   automatically; the loading card shows `OS pack: Great Bookham`.

## How it loads

The sim is a single file that also works opened straight from disk, where
pages may not `fetch()` their neighbours — but they may load scripts. So a
pack is a `.js` file calling `TF_PACK({...})`, injected with a `<script>` tag
when your home point falls inside its bounding box. Missing or slow pack files
time out after 20 s and the sim continues without them.

Pack footprints are merged **after** all planned map requests settle, because
"OSM has nothing here" is only meaningful once OSM has finished answering.
Once a pack has filled the square, ahead-of-the-aircraft streaming is switched
off — it exists to fetch what the plan didn't, and the pack already has.

## Size

Footprints are delta-encoded at ~0.1 m resolution. A rural 10 km square is
roughly 300–800 KB; a market town 1–2 MB. Packs load once, locally, and cost
Overpass nothing.

## Licence

Packs derived from OS OpenMap Local must carry the attribution embedded in
each pack file: *Contains OS data © Crown copyright and database right
[year]. Open Government Licence v3.* Keep it if you redistribute.
