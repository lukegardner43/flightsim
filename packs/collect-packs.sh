#!/usr/bin/env bash
# Merge the pack files a matrix of runners produced into packs/.
#
#   packs/collect-packs.sh <incoming-dir> [<packs-dir>]
#
# KEEP_UNMEASURED=true also takes tiles that have footprints but no lidar
# heights yet. Off by default, and that default is the point:
#
# the footprint step builds a pack for all hundred tiles of a grid square,
# because that is ONE Ordnance Survey download and costs seconds. The
# four-hour budget only limits the MEASURING. So a pass leaves about eight
# tiles in a hundred with heights on them and ninety-two with none, and
# committing all of them put roughly 700 MB of unmeasured geometry in the
# repository to carry the 3% of it worth keeping. Worse, every later pass
# rewrites those same files to add heights, so git stores the whole lot
# again each time. They are cheap to get back: the next pass rebuilds them
# in the same download it was going to make anyway.
#
# What is never allowed is going BACKWARDS. An unmeasured pack must not
# overwrite a measured one — that is silent loss of exactly the work this
# whole pipeline exists to produce. It should not arise, because
# tile-status.js does not ask for footprints on a tile that is already
# measured, but "should not arise" is how the last three faults in this
# workflow described themselves.
#
# Prints: <new-or-changed> <held-back> <held-back-KB> <refused-downgrade>
set -uo pipefail
shopt -s nullglob

IN=${1:?give the incoming directory}
OUT=${2:-packs}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

NEW=0; HELD=0; HELDKB=0; KEPT=0
for d in "$IN"/packs-*; do
  for f in "$d"/*.js; do
    b=$(basename "$f")
    # a pack starts with TF_PACK( — everything else in there is a tool that
    # came along with the upload
    head -c 8 "$f" | grep -q 'TF_PACK(' || continue
    node "$ROOT/packs/measured.js" "$f"; IN_MEASURED=$?
    if [ "$IN_MEASURED" != "0" ]; then
      # never let footprints overwrite a measurement
      if [ -f "$OUT/$b" ] && node "$ROOT/packs/measured.js" "$OUT/$b"; then
        KEPT=$((KEPT+1)); continue
      fi
      if [ "${KEEP_UNMEASURED:-false}" != "true" ] && [ ! -f "$OUT/$b" ]; then
        HELD=$((HELD+1)); HELDKB=$((HELDKB + $(du -k "$f" | cut -f1)))
        continue
      fi
    fi
    if [ ! -f "$OUT/$b" ] || ! cmp -s "$f" "$OUT/$b"; then
      cp "$f" "$OUT/$b"; NEW=$((NEW+1))
    fi
  done
done
echo "$NEW $HELD $HELDKB $KEPT"
