#!/usr/bin/env bash
# Measures every site in sites.json and leaves one JSON of results per site
# in stats/.
#
#   analysis/run.sh sites.json 2500
#
# Deliberately not `set -e`. One unreachable grid square, or one Overpass
# mirror having a bad afternoon, must cost that site and not the whole audit
# — a partial answer is still an answer, and the report says how many places
# it is built from.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SITES=${1:?give sites.json}
RADIUS=${2:-2500}
PAUSE=${OVERPASS_PAUSE:-10}          # Overpass is free and volunteer-run

mkdir -p stats work
node "$ROOT/analysis/plan.js" --sites "$SITES" --work work --radius "$RADIUS" > work/list.tsv || exit 1

LASTSQ=""
SQOK=0
while IFS=$'\t' read -r IDX PC LAT LON SQ S W N E; do
  echo "::group::$IDX  $PC  ($SQ)"

  # One download per 100 km grid square, not one per site: the list is
  # sorted by square so neighbours share the download.
  if [ "$SQ" != "$LASTSQ" ]; then
    rm -rf work/os
    LASTSQ="$SQ"
    SQOK=0
    if bash "$ROOT/packs/os-download.sh" "$SQ" work/os; then
      SQOK=1
    else
      echo "::warning::could not download OS grid square $SQ — skipping every site in it"
    fi
  fi
  if [ "$SQOK" != "1" ]; then echo "::endgroup::"; continue; fi

  FILES=$(bash "$ROOT/packs/os-clip.sh" work/os "work/os-$IDX" "$W" "$S" "$E" "$N")
  if [ -z "$FILES" ]; then
    echo "::warning::$PC — no OS building layer to clip"
    echo "::endgroup::"; continue
  fi

  if ! node "$ROOT/analysis/osm-fetch.js" --bbox "$S,$W,$N,$E" --out "work/osm-$IDX.geojson"; then
    echo "::warning::$PC — OpenStreetMap never answered, so this place is not in the audit"
    echo "::endgroup::"; continue
  fi

  node "$ROOT/analysis/compare.js" --os "$FILES" --osm "work/osm-$IDX.geojson" \
       --centre "$LAT,$LON" --site "work/site-$IDX.json" --out "stats/$IDX.json" \
    || echo "::warning::$PC — comparison failed"

  rm -f work/os-$IDX-*.geojson "work/osm-$IDX.geojson"
  echo "::endgroup::"
  sleep "$PAUSE"
done < work/list.tsv

rm -rf work/os
DONE=$(ls stats 2>/dev/null | wc -l)
WANT=$(wc -l < work/list.tsv)
echo "measured $DONE of $WANT places"
[ "$DONE" -gt 0 ]
