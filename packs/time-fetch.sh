#!/usr/bin/env bash
# Is 1.2 MB/s the server's ceiling, or just one stream's?
#
#   eval "$(packs/find-lidar.sh)" && packs/time-fetch.sh [TILE]
#
# This decides whether England is possible. Measured, a 1 km chunk over the
# WCS takes 3.25 s for 4 MB — 1.2 MB/s — which makes a 10 km tile eleven
# minutes and England 235 hours. The bulk 5 km GeoTIFFs would have fixed it,
# but the survey index turns out to carry provenance and not download URLs,
# and the WMTS serves rendered PNG, so the WCS is what there is.
#
# Which leaves one question. If 3.25 s is mostly the server thinking — the
# render, the round trip — then eight requests at once cost barely more than
# one, and England is an afternoon. If it is a bandwidth cap, they cost eight
# times as much and nothing is gained. The two are indistinguishable from a
# single-stream number, and guessing which it is would be the third guess in
# a row I would rather not make.
#
# Fetches the same eight squares twice, serially and eight at a time, and
# prints both rates. Downloads about 64 MB and writes nothing but temporary
# files.
set -uo pipefail

TILE=$(printf '%s' "${1:-TQ15}" | tr 'a-z' 'A-Z')
N=${N:-8}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

: "${DSM_SLUG:?run find-lidar.sh first and eval its output}"
: "${DSM_COV:?run find-lidar.sh first and eval its output}"

export GDAL_HTTP_TIMEOUT=600 GDAL_HTTP_CONNECTTIMEOUT=30
export GDAL_HTTP_MAX_RETRY=5 GDAL_HTTP_RETRY_DELAY=5
export CPL_VSIL_CURL_USE_HEAD=NO GDAL_CACHEMAX=256

node "$ROOT/packs/wcs-service.js" "$DSM_SLUG" "$DSM_COV" "" 512 900 > svc.xml

# eight 1 km squares along the bottom of the tile
node -e '
const {tileOrigin}=require(process.argv[1]+"/packs/grid-square.js");
const o=tileOrigin(process.argv[2]), n=+process.argv[3];
for(let i=0;i<n;i++) console.log((o.E+i*1000)+" "+o.N);
' "$ROOT" "$TILE" "$N" > squares.txt

one(){ # one <e> <n> <out>
  gdalwarp -q -overwrite -t_srs EPSG:27700 \
    -te "$1" "$2" "$(( $1 + 1000 ))" "$(( $2 + 1000 ))" -tr 1 1 -r bilinear \
    -ot Float32 -dstnodata -9999 -co COMPRESS=DEFLATE svc.xml "$3" 2>/dev/null
}
export -f one

rate(){ # rate <label> <seconds>
  local mb=$(( N * 4 ))
  awk -v l="$1" -v s="$2" -v mb="$mb" \
    'BEGIN{ printf "  %-22s %6.1f s   %5.2f MB/s\n", l, s, mb/s }'
}

echo "$N squares of 1 km from $TILE, about $(( N * 4 )) MB each way"
echo

t0=$SECONDS
i=0; while read -r e n; do i=$((i+1)); one "$e" "$n" "s$i.tif"; done < squares.txt
SER=$(( SECONDS - t0 )); [ "$SER" = "0" ] && SER=1
rate "one at a time" "$SER"

rm -f s*.tif
t0=$SECONDS
i=0
while read -r e n; do i=$((i+1)); printf '%s %s p%s.tif\n' "$e" "$n" "$i"; done < squares.txt \
  | xargs -P "$N" -n 3 bash -c 'one "$0" "$1" "$2"'
PAR=$(( SECONDS - t0 )); [ "$PAR" = "0" ] && PAR=1
rate "$N at once" "$PAR"

got=$(ls p*.tif 2>/dev/null | wc -l)
echo
echo "  $got of $N came back on the parallel pass"
awk -v a="$SER" -v b="$PAR" 'BEGIN{ printf "  speedup %.1fx\n", a/b }'
echo
awk -v a="$SER" -v b="$PAR" -v n="$N" 'BEGIN{
  tile_ser = 200*(a/n)/60; tile_par = 200*(b/n)/60;
  printf "  a 10 km tile:  %.0f min one at a time,  %.0f min at %d\n", tile_ser, tile_par, n;
  printf "  England, 1,300 tiles, on one runner:  %.0f h  ->  %.0f h\n", 1300*tile_ser/60, 1300*tile_par/60;
  printf "  and across a matrix of 8 runners:                  %.0f h\n", 1300*tile_par/60/8;
}'
echo
echo "  If the speedup is near 1 the server is the cap and England is off;"
echo "  near $N and it is latency, and this is worth building properly."
