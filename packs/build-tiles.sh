#!/usr/bin/env bash
# Builds every tile named in a plan file, one Ordnance Survey download per
# 100 km grid square.
#
#   packs/build-tiles.sh tiles.tsv
#
# The plan comes from packs/plan-tiles.js and has one line per grid square:
#   TQ<TAB>TQ04,TQ05,TQ14,TQ15<TAB>W S E N
#
# Deliberately not `set -e`: one grid square Ordnance Survey will not serve
# should cost that square, not every tile in the run.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLAN=${1:?give the plan file from plan-tiles.js}
FAILED=0
HAVE=''

while IFS=$'\t' read -r SQ TILES BOX; do
  [ -n "${SQ:-}" ] || continue
  echo "::group::$SQ  ($TILES)"
  read -r W S E N <<< "$BOX"

  # One download per SQUARE, not per line. A plan may hold several lines for
  # the same square — England hands over a row of ten tiles at a time so that
  # make-pack is never asked to hold a hundred kilometres of Yorkshire in
  # memory at once — and re-fetching the same fifty megabytes ten times over
  # is most of a runner's afternoon.
  if [ "$HAVE" != "$SQ" ]; then
    rm -rf work/os
    if ! bash "$ROOT/packs/os-download.sh" "$SQ" work/os; then
      echo "::warning::could not download OS grid square $SQ — its tiles are not in this run"
      FAILED=$((FAILED+1)); echo "::endgroup::"; continue
    fi
    HAVE=$SQ
  else
    echo "using the copy of $SQ already downloaded"
  fi

  # One clip for the whole square: the bounding box of everything wanted from
  # it. make-pack then partitions that exactly, in British National Grid, so
  # the tiles still do not overlap.
  FILES=$(bash "$ROOT/packs/os-clip.sh" work/os "work/$SQ" "$W" "$S" "$E" "$N")
  if [ -z "$FILES" ]; then
    echo "::warning::$SQ — no building layer to clip"
    FAILED=$((FAILED+1)); echo "::endgroup::"; continue
  fi

  node "$ROOT/packs/make-pack.js" --in "$FILES" --tiles "$TILES" \
    || { echo "::warning::$SQ — pack build failed"; FAILED=$((FAILED+1)); }

  rm -rf "work/$SQ"-*.geojson
  echo "::endgroup::"
done < "$PLAN"

rm -rf work
echo "$FAILED grid square(s) failed"
[ "$FAILED" -eq 0 ]
