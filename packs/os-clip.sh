#!/usr/bin/env bash
# Every building layer of an unpacked OS OpenMap Local grid square, clipped
# to one box and converted to WGS84 GeoJSON.
#
#   packs/os-clip.sh osdata out W S E N
#
# Prints the comma-separated list of GeoJSON files it wrote on stdout, and
# everything a human needs to diagnose a bad run on stderr. Whether an empty
# clip is a problem is the caller's decision, not this script's: a pack build
# should fail on it, an audit of a Highland glen should not.
#
# Two shapes arrive from Ordnance Survey and both are handled:
#   GeoPackage      one file, layers named ..._Building, ..._ImportantBuilding
#   shapefile set   one file PER layer, so the layers are filenames
# Either way, take EVERY building layer — OS keeps schools, hospitals and
# civic buildings in a separate "important" layer that is worth having.
#
# One GeoJSON file per source layer, never appended: a GeoJSON file holds
# exactly one layer, and appending a second asks the driver to create a layer
# named after it, which it refuses to do.
set -euo pipefail

SRC=${1:?give the unpacked OS directory}
PREFIX=${2:?give an output prefix}
W=${3:?}; S=${4:?}; E=${5:?}; N=${6:?}

rm -f "$PREFIX"-*.geojson
OUT=()

GPKG=$(find "$SRC" -iname '*.gpkg' | head -1 || true)
if [ -n "$GPKG" ]; then
  echo "source: $GPKG" >&2
  mapfile -t LAYERS < <(ogrinfo -so "$GPKG" \
    | sed -n 's/^[0-9]*: *\([A-Za-z0-9_]*[Bb]uilding[A-Za-z0-9_]*\).*/\1/p')
  if [ "${#LAYERS[@]}" -eq 0 ]; then
    echo "no building layer in $GPKG. What it does contain:" >&2
    ogrinfo -so "$GPKG" | sed -n '1,60p' >&2
    exit 1
  fi
  i=0
  for L in "${LAYERS[@]}"; do
    i=$((i+1))
    echo "  layer $L" >&2
    ogr2ogr -f GeoJSON "$PREFIX-$i.geojson" "$GPKG" "$L" \
            -t_srs EPSG:4326 -clipdst "$W" "$S" "$E" "$N" >&2
    OUT+=("$PREFIX-$i.geojson")
  done
else
  mapfile -t SHPS < <(find "$SRC" -iname '*building*.shp' | sort)
  if [ "${#SHPS[@]}" -eq 0 ]; then
    echo "no building shapefile in $SRC. What arrived:" >&2
    find "$SRC" -iname '*.shp' -printf '  %f\n' | sort >&2
    exit 1
  fi
  i=0
  for f in "${SHPS[@]}"; do
    i=$((i+1))
    echo "  layer $(basename "$f")" >&2
    ogr2ogr -f GeoJSON "$PREFIX-$i.geojson" "$f" \
            -t_srs EPSG:4326 -clipdst "$W" "$S" "$E" "$N" >&2
    OUT+=("$PREFIX-$i.geojson")
  done
fi

node -e '
  const fs = require("fs");
  let total = 0;
  for (const f of process.argv.slice(1)) {
    const n = (JSON.parse(fs.readFileSync(f, "utf8")).features || []).length;
    console.error("  " + f + ": " + n + " footprints");
    total += n;
  }
  console.error("  " + total + " OS footprints inside the clip");
' "${OUT[@]}" >&2

(IFS=,; printf '%s\n' "${OUT[*]}")
