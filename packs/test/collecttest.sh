#!/usr/bin/env bash
# What the collect job keeps and what it holds back.
#
# The England build writes a pack for every tile of a grid square but only
# measures a handful of them per pass, so most of what the runners hand over
# is footprints with no heights on them. Committing all of it was 700 MB to
# carry 3% worth keeping. This is the rule that stops it, and the case that
# matters most is the LAST one: a tile already in the repository must still
# be updated, or a measured tile could go backwards.
set -uo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/incoming/packs-XX" "$T/out"

pack(){ # pack <file> <heights-json>
  printf 'TF_PACK({"id":"%s","q":1000000,"bbox":[50,-2,51,-1],"buildings":[[50000000,-1000000,10,10,10,-10]]%s});\n' \
    "$(basename "$1" .js)" "$2" > "$1"
}
pack "$T/incoming/packs-XX/aa11.js" ',"heights":[7654]'          # measured, new
pack "$T/incoming/packs-XX/aa22.js" ''                            # no heights at all, new
pack "$T/incoming/packs-XX/aa33.js" ',"heights":[0,0,0]'          # all zero, new
pack "$T/incoming/packs-XX/aa44.js" ''                            # no heights, ALREADY in the repo
pack "$T/out/aa44.js"               ',"heights":[1234]'           # ...and the copy there IS measured
echo 'module.exports = 1;' > "$T/incoming/packs-XX/notapack.js"   # a tool came along for the ride

read -r NEW HELD HELDKB KEPT < <("$ROOT/packs/collect-packs.sh" "$T/incoming" "$T/out")

fail=0
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1   $3"; else echo "FAIL  $1   got $2, want $3"; fail=1; fi }

check "a measured tile is kept"                  "$([ -f "$T/out/aa11.js" ] && echo yes || echo no)" yes
check "footprints with no heights are held back" "$([ -f "$T/out/aa22.js" ] && echo yes || echo no)" no
check "an all-zero heights array is not a measurement" \
                                                 "$([ -f "$T/out/aa33.js" ] && echo yes || echo no)" no
check "a tool is not mistaken for a pack"        "$([ -f "$T/out/notapack.js" ] && echo yes || echo no)" no
check "counted as new"                           "$NEW"  1
check "counted as held back"                     "$HELD" 2
# the one that would quietly lose work
check "footprints never overwrite a measurement" \
      "$(grep -c '"heights":\[1234\]' "$T/out/aa44.js")" 1
check "and that refusal is counted"              "$KEPT" 1

echo
read -r N2 H2 K2 D2 < <(KEEP_UNMEASURED=true "$ROOT/packs/collect-packs.sh" "$T/incoming" "$T/out")
check "KEEP_UNMEASURED takes them all"           "$H2" 0
check "but still refuses the downgrade"          "$D2" 1

echo
if [ "$fail" = "0" ]; then echo "all passed"; else echo "$fail failed"; fi
exit "$fail"
