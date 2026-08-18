#!/usr/bin/env bash
# One 100 km grid square of OS OpenMap Local, downloaded and unpacked.
#
#   packs/os-download.sh TQ osdata
#
# OS publishes this per grid square, as either a GeoPackage (one file, many
# named layers) or a shapefile bundle (one file per layer). Both are usable,
# so this takes whichever is on offer and lets the caller work out which
# arrived. It prints the whole catalogue before choosing, because every time
# Ordnance Survey has changed what it publishes, that listing has been the
# thing that turned a failed run into a one-line fix.
#
# OS_DOWNLOADS_API overrides the catalogue URL, which is how the tests point
# it at a fixture instead of the internet.
set -euo pipefail

SQ=$(printf '%s' "${1:?give a grid square, e.g. TQ}" | tr 'a-z' 'A-Z')
DEST=${2:?give a destination directory}
API=${OS_DOWNLOADS_API:-https://api.os.uk/downloads/v1/products/OpenMapLocal/downloads}

mkdir -p "$DEST"
curl -sSL --retry 3 --retry-delay 5 "$API" -o "$DEST/list.json"

echo "everything Ordnance Survey offers for OpenMap Local:"
node -e '
  const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const d of l) console.log("  " + (d.format || "?") + "   area=" + (d.area || "(whole GB)") +
    "   " + Math.round((d.size || 0) / 1048576) + " MB");
' "$DEST/list.json"

URL=$(SQ="$SQ" node -e '
  const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")), sq = (process.env.SQ || "").toUpperCase();
  const here = d => (d.area || "").toUpperCase() === sq;
  const fmt = re => d => re.test(d.format || "");
  const gpkg = fmt(/geopackage|gpkg/i), shp = fmt(/shape/i);
  /* Both are readable: a GeoPackage names its layers, a shapefile bundle
     puts each layer in its own file. */
  const hit = l.find(d => here(d) && gpkg(d))
           || l.find(d => here(d) && shp(d))
           || l.find(d => gpkg(d) && !d.area)
           || l.find(here);
  if (!hit) {
    console.error("nothing downloadable for grid square " + sq + " — see the list above");
    process.exit(1);
  }
  console.error("chose: " + (hit.fileName || "?") + "  [" + hit.format + "]  " +
                Math.round((hit.size || 0) / 1048576) + " MB");
  console.log(hit.url);
' "$DEST/list.json")

echo "downloading $URL"
curl -sSL --retry 3 --retry-delay 10 "$URL" -o "$DEST/data.zip"
ls -lh "$DEST/data.zip"
unzip -q -o "$DEST/data.zip" -d "$DEST"
rm -f "$DEST/data.zip"
