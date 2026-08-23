#!/usr/bin/env bash
# Is the service down, or is it refusing US?
#
#   packs/probe-ua.sh
#
# I told the user twice that the Environment Agency's WCS was down. Their
# browser fetches the same URL perfectly well. So the far likelier story is
# the one I did not consider: it answers browsers and not us.
#
# The evidence fits that better than an outage, and I should have read it that
# way. What comes back is not an error document — it is the Defra platform's
# own Next.js front page, HTTP 500, which is what a bot filter or an edge rule
# serves, not what a failed geoserver serves. And the DTM went from 200 to 500
# within ninety minutes of me putting several hundred requests through it.
#
# So: the same URL, several ways, with the response headers. If a browser
# User-Agent gets XML and curl's default gets HTML, the fix is one header and
# an apology, and GDAL needs GDAL_HTTP_USERAGENT set to match.
set -uo pipefail

DEFRA=https://environment.data.gov.uk
SLUG=${1:-lidar-composite-digital-surface-model-last-return-dsm-1m}
URL="$DEFRA/spatialdata/$SLUG/wcs?service=WCS&version=2.0.1&request=GetCapabilities"
UA_BROWSER='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

echo "$URL"
echo

try(){ # try <label> <curl args...>
  local label="$1"; shift
  local code type
  code=$(curl -sS -o "$WORK/body" -D "$WORK/head" \
              -w '%{http_code}|%{size_download}' --max-time 60 "$@" "$URL" 2>/dev/null) \
    || code="000|0"
  type=$(sed -n 's/^[Cc]ontent-[Tt]ype: *//p' "$WORK/head" | tr -d '\r' | head -1)
  local what="?"
  if head -c 400 "$WORK/body" | grep -qi '<!doctype html\|<html'; then what="HTML front page"
  elif head -c 400 "$WORK/body" | grep -qi 'Capabilities'; then what="WCS CAPABILITIES"
  elif [ "$(echo "$code" | cut -d'|' -f2)" = "0" ]; then what="(nothing)"
  fi
  printf '  %-26s %s  %8s bytes  %-34s %s\n' \
    "$label" "${code%%|*}" "$(echo "$code" | cut -d'|' -f2)" "${type:-—}" "$what"
  # anything an edge rule would leave behind
  grep -iE '^(cf-|x-amz-cf|x-cache|server|retry-after|x-ratelimit|akamai)' "$WORK/head" \
    | tr -d '\r' | sed 's/^/        /' | head -4
}

try "curl default"
try "browser User-Agent"   -A "$UA_BROWSER"
try "browser UA + Accept"  -A "$UA_BROWSER" -H 'Accept: text/xml,application/xml,*/*'
try "GDAL's own UA"        -A 'GDAL WCS driver'

echo
echo "  If the browser rows say WCS CAPABILITIES and the default row says HTML"
echo "  front page, nothing is down and this was never their fault: they are"
echo "  filtering by User-Agent, or throttling this runner, and the fix is a"
echo "  header in find-lidar.sh plus GDAL_HTTP_USERAGENT to match."
