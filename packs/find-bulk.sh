#!/usr/bin/env bash
# What does the Environment Agency serve OTHER than the WCS, and can we get a
# 5 km GeoTIFF by URL?
#
#   packs/find-bulk.sh [TILE]        # TILE defaults to TQ15
#
# This exists because of a measurement. Over the WCS we get 1.2 MB/s: a 10 km
# tile is two hundred 1 km GetCoverage requests, 800 MB on the wire, eleven
# minutes. England is 1,300 tiles, so 235 hours — which is why building a
# place on demand felt slow, and it is the transport that is slow, not the
# data. The same lidar is published as 5 km GeoTIFFs on the OS grid: eight
# files a tile instead of two hundred requests, compressed, and downloadable
# in parallel. That is the difference between a fortnight and an afternoon.
#
# What is missing is the URL, and the download site is a session-driven app
# rather than a documented API, so this does not guess at one. It asks four
# sources in turn and prints everything with its HTTP code, the same way
# find-lidar.sh found the WCS slug after a hard-coded guess 404'd:
#
#   1. the data.gov.uk CKAN record, which lists a dataset's resources
#   2. the Defra platform's own dataset endpoint
#   3. the download app, and any API host named inside the scripts it loads
#   4. whatever shapes 1-3 suggest, tried against one real tile
#
# Nothing here writes anything or commits. Read the log and the next step
# writes itself.
set -uo pipefail

TILE=$(printf '%s' "${1:-TQ15}" | tr 'a-z' 'A-Z')
SQ=${TILE:0:2}
CKAN=https://ckan.publishing.service.gov.uk/api/3/action/package_show
DEFRA=https://environment.data.gov.uk
DSM_ID=9ba4d5ac-d596-445a-9056-dae3ddec0178
DTM_ID=13787b9a-26a4-4775-8523-806d13af58fc
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

hr(){ printf '\n=== %s ===\n' "$1"; }
# GET a url, print its code and size, keep the body
get(){ # get <label> <url> [outfile]
  local out=${3:-$WORK/body}
  local code
  code=$(curl -sSL --max-time 90 -o "$out" -w '%{http_code}|%{size_download}|%{content_type}' "$2" 2>/dev/null) || code="000|0|"
  printf '  %-46s HTTP %s  %s bytes  %s\n' "$1" "${code%%|*}" "$(echo "$code" | cut -d'|' -f2)" "$(echo "$code" | cut -d'|' -f3)"
  [ "${code%%|*}" = "200" ]
}

hr "1. the CKAN record for each dataset, and the resources it lists"
for d in lidar-composite-digital-surface-model-dsm-1m \
         lidar-composite-digital-terrain-model-dtm-1m; do
  if get "$d" "$CKAN?id=$d" "$WORK/$d.json"; then
    node -e '
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const r = (j.result && j.result.resources) || [];
      if (!r.length) { console.log("      (no resources listed)"); process.exit(0); }
      for (const x of r)
        console.log("      " + String(x.format || "?").padEnd(10) +
                    String(x.name || "").slice(0, 44).padEnd(46) + (x.url || ""));
    ' "$WORK/$d.json" 2>/dev/null || echo "      (could not read the record)"
  fi
done

hr "2. the Defra platform's own dataset endpoints"
for id in "$DSM_ID" "$DTM_ID"; do
  get "dataset/$id" "$DEFRA/dataset/$id" "$WORK/ds.html" && \
    grep -oE 'https?://[a-zA-Z0-9._~/-]*(download|tiles|geotiff|\.tif|\.zip)[a-zA-Z0-9._~/?=&-]*' \
      "$WORK/ds.html" | sort -u | head -12 | sed 's/^/      /'
done

hr "3. the download app, and the API hosts named in its scripts"
if get "survey app" "$DEFRA/survey" "$WORK/survey.html"; then
  grep -oE '(src|href)="[^"]+\.js"' "$WORK/survey.html" \
    | sed 's/.*="//;s/"$//' | sort -u | head -12 > "$WORK/bundles.txt"
  echo "      scripts: $(wc -l < "$WORK/bundles.txt")"
  : > "$WORK/apis.txt"
  while read -r b; do
    case "$b" in http*) u="$b";; /*) u="$DEFRA$b";; *) u="$DEFRA/survey/$b";; esac
    curl -sSL --max-time 90 "$u" 2>/dev/null \
      | grep -oE 'https?://[a-zA-Z0-9._-]+(/[a-zA-Z0-9._~/-]*)?(api|catalog|tiles|collections|product|download)[a-zA-Z0-9._~/-]*' \
      >> "$WORK/apis.txt"
  done < "$WORK/bundles.txt"
  sort -u "$WORK/apis.txt" | head -30 | sed 's/^/      /'
  [ -s "$WORK/apis.txt" ] || echo "      (nothing that looks like an API in them)"
fi

hr "4. the survey index, which is where the tile list should live"
# The first run of this found no download URL, because every shape in this
# section was mine. What it DID find, in the CKAN resources, was a "Metadata
# Survey Index Catalogues" published as OGC API Features and WFS — an index
# of survey tiles is exactly the thing that would carry a download URL per
# tile. So this section stopped guessing shapes and started following that.
IDX=$DEFRA/spatialdata/survey-index-files
BBOX=${BBOX:--0.4257,51.2386,-0.2791,51.3265}     # TQ15 in lon/lat

if get "ogc features landing" "$IDX/ogc/features/v1" "$WORK/ogc.json"; then
  head -c 400 "$WORK/ogc.json" | sed 's/^/      /'; echo
fi
if get "its collections" "$IDX/ogc/features/v1/collections" "$WORK/cols.json"; then
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const c = j.collections || [];
    console.log("      " + c.length + " collections");
    for (const x of c.slice(0, 25))
      console.log("      " + String(x.id).padEnd(46) + String(x.title || "").slice(0, 60));
  ' "$WORK/cols.json" 2>/dev/null | head -30
  # and what one item actually carries, which is the whole question
  for col in $(node -e '
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      for (const x of (j.collections || [])) if (/lidar|composite|dsm|dtm|index/i.test(x.id + " " + (x.title||""))) console.log(x.id);
    ' "$WORK/cols.json" 2>/dev/null | head -4); do
    if get "  $col, one item" "$IDX/ogc/features/v1/collections/$col/items?limit=1" "$WORK/item.json"; then
      node -e '
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const f = (j.features || [])[0];
        if (!f) { console.log("        (no features)"); process.exit(0); }
        for (const [k, v] of Object.entries(f.properties || {}))
          console.log("        " + k.padEnd(28) + String(v).slice(0, 90));
      ' "$WORK/item.json" 2>/dev/null
    fi
    if get "  $col, over $TILE" "$IDX/ogc/features/v1/collections/$col/items?bbox=$BBOX&limit=4" "$WORK/box.json"; then
      node -e '
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        console.log("        " + (j.features || []).length + " tiles over this square");
        for (const f of (j.features || []))
          console.log("        " + JSON.stringify(f.properties).slice(0, 200));
      ' "$WORK/box.json" 2>/dev/null
    fi
  done
fi

hr "5. the WFS for the same index, in case the OGC one is not it"
get "wfs capabilities" "$IDX/wfs?service=WFS&request=GetCapabilities" "$WORK/wfs.xml" &&   grep -oE '<(wfs:)?Name>[^<]+' "$WORK/wfs.xml" | sed 's/.*Name>//' | sort -u | head -20 | sed 's/^/      /'

hr "6. and whether the DSM has a tiled service worth using"
get "wmts capabilities" "$DEFRA/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wmts?request=GetCapabilities&service=WMTS&version=2.0.1" "$WORK/wmts.xml" &&   { grep -oE '<Format>[^<]+' "$WORK/wmts.xml" | sort -u | head | sed 's/^/      format /'
    grep -oE '<ows:Identifier>[^<]+' "$WORK/wmts.xml" | sed 's/.*Identifier>//' | sort -u | head -12 | sed 's/^/      layer  /'; }

hr "what to do with this"
cat <<'NOTE'
  What is wanted is a property on an index feature that is a URL ending .tif
  or .zip. Feed that to measure-tile.sh through DSM_URL / DTM_URL, which
  already takes a direct download and skips the WCS entirely.
  A WMTS in part 6 offering image/png is rendered hillshade, not elevation,
  and is no use for measuring however fast it is. One offering a float or
  tiff format is worth a look.
NOTE
