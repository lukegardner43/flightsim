#!/usr/bin/env bash
# Finds the Environment Agency's lidar services and says what they offer.
#
#   eval "$(packs/find-lidar.sh)"     # sets dsm_slug dsm_cov dtm_slug dtm_cov
#
# Prints those four as key=value on stdout, and appends them to $GITHUB_OUTPUT
# when there is one, so a workflow step can consume them directly.
#
# DEFRA moved its lidar off Esri image services onto OGC ones and renamed the
# DSM dataset to say which return it is, so the slug is not something to
# hard-code from memory — the first attempt at this 404'd. Each candidate is
# asked whether it is there and what it offers, and the first that answers is
# used. If they all fail, the log holds enough to fix it in one go rather than
# by another guess.
#
# Lives here rather than inside a workflow because two workflows need it and
# a copied shell function is a copy that drifts.

set -uo pipefail
base=https://environment.data.gov.uk/spatialdata
DSM_SLUGS="lidar-composite-digital-surface-model-last-return-dsm-1m lidar-composite-digital-surface-model-dsm-1m lidar-composite-first-return-digital-surface-model-fz-dsm-1m"
DTM_SLUGS="lidar-composite-digital-terrain-model-dtm-1m lidar-composite-digital-terrain-model-last-return-dtm-1m"
probe() {
  local label="$1"; shift
  for s in "$@"; do
    local url="$base/$s/wcs?service=WCS&version=2.0.1&request=GetCapabilities"
    local code
    code=$(curl -s -o "cap-$label.xml" -w '%{http_code}' --max-time 90 "$url")
    echo "  $label  $s  ->  HTTP $code" >&2
    if [ "$code" = "200" ]; then
      local ids
      ids=$(grep -o '<[a-zA-Z]*:\?CoverageId>[^<]*' "cap-$label.xml" | sed 's/.*CoverageId>//' | head -20)
      echo "  coverages offered: $(echo "$ids" | tr '\n' ' ')" >&2
      if [ -z "$ids" ]; then echo "  (no CoverageId in the capabilities)" >&2; continue; fi
      printf '%s|%s' "$s" "$(echo "$ids" | head -1)"
      return 0
    fi
  done
  return 1
}
# The service FLAPS. Measured this afternoon, on the same endpoint:
#
#   14:47   dsm 500   dtm 500
#   14:54   dsm 200   dtm 200      a timing test ran, 8 of 8 chunks came back
#   14:56   dsm 500   dtm 200      the full tile died here
#
# Two and a half minutes between a good answer and a bad one. measure-tile.sh
# already retries the coverage open four times a minute apart for exactly this
# reason — but this runs BEFORE it and had one attempt per slug, so the gate
# with no retry behind it was failing the whole job before the part that does
# retry ever ran. That is mine, not theirs.
dsm=""; dtm=""
for round in 1 2 3 4; do
  [ -z "$dsm" ] && { dsm=$(probe dsm $DSM_SLUGS) || dsm=""; }
  [ -z "$dtm" ] && { dtm=$(probe dtm $DTM_SLUGS) || dtm=""; }
  [ -n "$dsm" ] && [ -n "$dtm" ] && break
  [ "$round" = "4" ] && break
  echo "  round $round of 4 came up short; waiting 45 s" >&2
  sleep 45
done
if [ -z "$dsm" ] || [ -z "$dtm" ]; then
  # stderr, not stdout: the caller may be doing eval "$(find-lidar.sh)", and a
  # failure printed to stdout gets EVALUATED. That is not a hypothetical —
  # "::error::No: command not found", exit 127, is what the timing run died of
  # rather than reporting the outage it had correctly detected.
  echo "::error::No lidar WCS answered — every slug above is a miss." >&2
  echo "::error::Download the 5 km DSM and DTM tiles for this square by hand from" >&2
  echo "::error::https://environment.data.gov.uk/survey and re-run with dsm_url / dtm_url." >&2
  # Forty lines of whatever came back turned out to be a wall of
  # styled-components CSS, because what the platform serves when the service
  # is down is its own HTML front page. Say that, and show its title, rather
  # than printing the stylesheet.
  if head -c 600 cap-dsm.xml 2>/dev/null | grep -qi '<!doctype html\|<html'; then
    echo "::error::The response was an HTML page, not XML — the platform is serving" >&2
    echo "::error::its front page where the service should be:" >&2
    sed -n 's/.*<title[^>]*>\([^<]*\)<\/title>.*/    title: \1/p' cap-dsm.xml | head -1 >&2
  else
    echo "--- first 20 lines of the last DSM response ---" >&2
    head -20 cap-dsm.xml 2>/dev/null >&2 || true
  fi
  exit 1
fi
OUT=$(printf 'dsm_slug=%s\ndsm_cov=%s\ndtm_slug=%s\ndtm_cov=%s\n' \
      "${dsm%%|*}" "${dsm##*|}" "${dtm%%|*}" "${dtm##*|}")
# stdout is the four values and nothing else, so `eval "$(find-lidar.sh)"`
# works; everything a person reads goes to stderr
printf '%s\n' "$OUT"
[ -n "${GITHUB_OUTPUT:-}" ] && printf '%s\n' "$OUT" >> "$GITHUB_OUTPUT"
echo "using DSM ${dsm%%|*} coverage ${dsm##*|}" >&2
echo "using DTM ${dtm%%|*} coverage ${dtm##*|}" >&2
exit 0
