#!/usr/bin/env bash
# Fetches one square of Environment Agency lidar and measures every footprint
# in it, leaving the answers in the pack.
#
#   packs/measure-tile.sh TILE E0 N0 E1 N1 SIZE [PACK]
#
# The four service values come from packs/find-lidar.sh through the
# environment: DSM_SLUG DSM_COV DTM_SLUG DTM_COV. DSM_URL and DTM_URL override
# them with files downloaded by hand, which is the fallback for anywhere the
# WCS will not serve.
#
# Fetched in 1 km squares. Two things had to be learned the hard way. The
# thirty second timeout is the WCS driver's OWN, set in the service
# description, and it ignores GDAL_HTTP_TIMEOUT completely — setting that to
# 600 and watching the log still say "timed out after 30000 milliseconds" is
# how you find out. And the request size is the CHUNK size, not the block
# size: each chunk is one GetCoverage, so a 2 km chunk is a 16 MB response,
# which over this link is more than thirty seconds. A 1 km chunk is 4 MB and
# takes about eight seconds.
#
# The server also returns the odd 502 under sustained load, so each square
# gets five attempts with a lengthening pause between them.
#
# Lives here rather than inside a workflow because two workflows need it.

TILE=${1:?give the tile, e.g. TQ15}
E0=${2:?give e0}; N0=${3:?give n0}; E1=${4:?give e1}; N1=${5:?give n1}
SIZE=${6:?give the square size in metres}
PACK=${7:-}
export DSM_URL=${DSM_URL:-} DTM_URL=${DTM_URL:-}
export DSM_SLUG=${DSM_SLUG:-} DSM_COV=${DSM_COV:-}
export DTM_SLUG=${DTM_SLUG:-} DTM_COV=${DTM_COV:-}
export GDAL_HTTP_TIMEOUT=600 GDAL_HTTP_CONNECTTIMEOUT=30
export GDAL_HTTP_MAX_RETRY=5 GDAL_HTTP_RETRY_DELAY=5
export CPL_VSIL_CURL_USE_HEAD=NO GDAL_CACHEMAX=1024
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

set -euo pipefail
CHUNK=1000
chunked() {   # $1 dsm|dtm   $2 source dataset
  local out="$1" src="$2" n=0 ok missing=0
  local across=$(( (E1-E0+CHUNK-1)/CHUNK ))
  local TOTAL=$(( across*across ))
  echo "  $out: $TOTAL squares of ${CHUNK} m"
  rm -rf "$out.parts"; mkdir -p "$out.parts"
  local e n0
  for (( e=E0; e<E1; e+=CHUNK )); do
    for (( n0=N0; n0<N1; n0+=CHUNK )); do
      n=$((n+1))
      local f
      f=$(printf '%s.parts/%03d.tif' "$out" "$n")
      ok=0
      for try in 1 2 3 4 5; do
        if gdalwarp -q -overwrite -t_srs EPSG:27700 \
             -te "$e" "$n0" "$((e+CHUNK))" "$((n0+CHUNK))" -tr 1 1 -r bilinear \
             -ot Float32 -dstnodata -9999 -co COMPRESS=DEFLATE \
             "$src" "$f"; then ok=1; break; fi
        echo "  $out square $n attempt $try failed; waiting $((try*15))s"
        sleep $((try*15))
      done
      if [ "$ok" != "1" ]; then
        # One stubborn square is not a reason to throw away the
        # other twenty-four. It is left out of the mosaic, the
        # buildings under it simply get no reading, and the count
        # at the end says how many were lost.
        echo "::warning::$out square $n failed five times — leaving it out"
        rm -f "$f"
        missing=$((missing+1))
      fi
    done
    echo "  $out: column at E=$e done ($n of $TOTAL squares)"
  done
  local got
  got=$(ls "$out.parts"/*.tif 2>/dev/null | wc -l)
  if [ "$got" = "0" ]; then echo "::error::$out: every square failed"; exit 1; fi
  if [ "$missing" != "0" ]; then
    echo "::warning::$out: $missing of $TOTAL squares missing; those buildings keep no reading"
  fi
  echo "  $out: mosaicking $got squares"
  gdalbuildvrt -q "$out.mosaic.vrt" "$out.parts"/*.tif
  gdalwarp -q -overwrite -te "$E0" "$N0" "$E1" "$N1" -tr 1 1 \
    -ot Float32 -dstnodata -9999 -of ENVI "$out.mosaic.vrt" "$out.img"
  rm -rf "$out.parts" "$out.mosaic.vrt"
  ls -la "$out.img"
}
prepare() {  # $1 dsm|dtm  $2 direct url  $3 slug  $4 coverage
  if [ -n "$2" ]; then
    curl -fsSL --retry 3 --retry-delay 5 -o "$1.raw" "$2"
    if file "$1.raw" | grep -qi zip; then
      mkdir -p "$1.d"; unzip -qo "$1.raw" -d "$1.d"; rm "$1.raw"
      find "$1.d" \( -iname '*.tif' -o -iname '*.tiff' -o -iname '*.asc' \) > "$1.list"
    else
      echo "$1.raw" > "$1.list"
    fi
    gdalbuildvrt -q -input_file_list "$1.list" "$1.vrt" 1>&2
    echo "$1.vrt"
  else
    node packs/wcs-service.js "$3" "$4" "" 512 900 > "$1.xml"
    echo "$1.xml"
  fi
}
# The Environment Agency's WCS answers GetCapabilities and then 500s on
# DescribeCoverage, intermittently. GDAL needs DescribeCoverage to open the
# coverage at all, gives up after about eleven seconds of its own retries, and
# then reports "dsm.xml not recognized as a supported file format" — which
# blames our file for their outage and sent me looking in the wrong place.
# So the open is retried on a human timescale, and if it still will not go,
# the log says whose fault it is.
open_source(){ # open_source <dsm|dtm> <src>
  local i
  for i in 1 2 3 4; do
    if gdalinfo "$2" > "$1.info" 2> "$1.err"; then head -6 "$1.info"; return 0; fi
    echo "  $1: could not open the coverage (attempt $i)"
    sed 's/^/    /' "$1.err" | head -4
    [ "$i" = "4" ] && break
    echo "  waiting 60 s"
    sleep 60
  done
  echo "::error::$1: GDAL could not open the coverage after four attempts."
  if grep -q '500' "$1.err"; then
    echo "::error::Those are HTTP 500s from the Environment Agency's WCS, not a"
    echo "::error::problem here — GetCapabilities answers and DescribeCoverage"
    echo "::error::does not. It comes and goes; try again later, or pass"
    echo "::error::dsm_url / dtm_url to download the 5 km tiles by hand."
  fi
  return 1
}
for which in dsm dtm; do
  if [ "$which" = "dsm" ]; then
    src=$(prepare dsm "$DSM_URL" "$DSM_SLUG" "$DSM_COV")
  else
    src=$(prepare dtm "$DTM_URL" "$DTM_SLUG" "$DTM_COV")
  fi
  echo "--- $which from $src"
  open_source "$which" "$src" || exit 1
  time chunked "$which" "$src"
done
args=(--tile "$TILE" --dsm dsm.img --dtm dtm.img --origin "$E0,$N0" --size "$SIZE")
if [ -n "$PACK" ]; then args+=(--pack "$PACK"); fi
node --max-old-space-size=6144 packs/make-heights.js "${args[@]}"
rm -f dsm.img dtm.img dsm.hdr dtm.hdr dsm.xml dtm.xml dsm.xml.aux.xml dtm.xml.aux.xml
