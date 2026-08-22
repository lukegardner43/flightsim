#!/usr/bin/env bash
# Does measure-tile.sh still do what the workflow step it was lifted out of
# did? Stubbed gdal, so no network and no lidar: this checks the plumbing —
# the chunk loop covers the square, the mosaic is built, and make-heights is
# called with the origin and size it was given.
set -uo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
N=2000                       # a 2 km square: 4 chunks of 1 km, twice over

mkdir -p "$TMP/bin"
cat > "$TMP/bin/gdalwarp" <<'STUB'
#!/usr/bin/env bash
out=${@: -1}
# the mosaic pass writes ENVI; the chunk passes write a stand-in tif
if [[ "$*" == *"-of ENVI"* ]]; then
  python3 -c "
import struct,sys
n=int(sys.argv[2])
open(sys.argv[1],'wb').write(struct.pack('<%df'%(n*n),*([5.0]*(n*n))))
" "$out" "${SQ:-2000}"
else
  : > "$out"
fi
echo "$out" >> "$TMP_LOG"
STUB
printf '#!/usr/bin/env bash\n: > "${@: -1}"\n' > "$TMP/bin/gdalbuildvrt"
printf '#!/usr/bin/env bash\necho "Driver: stub"\n'                > "$TMP/bin/gdalinfo"
chmod +x "$TMP/bin"/*
export TMP_LOG="$TMP/calls.txt"; : > "$TMP_LOG"
export SQ=$N
export PATH="$TMP/bin:$PATH"
export DSM_SLUG=stub DSM_COV=stub DTM_SLUG=stub DTM_COV=stub

# Its OWN pack, named explicitly. make-heights finds the pack covering a
# square by itself when not told which, and on the first run of this test that
# was the real Bookham one — it measured it against a stub raster of a
# constant five metres and wrote the result. Nothing here may name a pack that
# anyone flies.
FIX=$ROOT/packs/tiletest.js
trap 'rm -rf "$TMP" "$FIX"' EXIT
node -e '
const {bngToWgs84}=require(process.argv[1]+"/packs/grid-square.js");
const Q=1e6, b=[];
for(let k=0;k<3;k++){
  const pts=[[514500+k*40,154500],[514520+k*40,154500],[514520+k*40,154520],[514500+k*40,154520]]
    .map(([E,N])=>{const w=bngToWgs84(E,N);return [Math.round(w.lat*Q),Math.round(w.lon*Q)];});
  const r=[pts[0][0],pts[0][1]];
  for(let i=1;i<pts.length;i++) r.push(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
  b.push(r);
}
require("fs").writeFileSync(process.argv[2], "TF_PACK("+JSON.stringify(
  {id:"tiletest",tile:"TQ15",name:"tile test",bbox:[0,0,0,0],q:Q,source:"synthetic",
   updated:"2026-08-22",buildings:b})+");\n");
' "$ROOT" "$FIX"

cd "$TMP"
out=$("$ROOT/packs/measure-tile.sh" TQ15 514000 154000 516000 156000 "$N" tiletest 2>&1)
rc=$?
chunks=$(grep -c 'parts/' "$TMP_LOG")
echo "$out" | tail -6
echo
pass=0
[ "$rc" = "0" ] && { echo "PASS  exits clean"; pass=$((pass+1)); } || echo "FAIL  exit $rc"
[ "$chunks" = "8" ] && { echo "PASS  8 chunk fetches for a 2 km square, two surfaces"; pass=$((pass+1)); } \
                    || echo "FAIL  $chunks chunk fetches, wanted 8"
grep -q 'origin 514000,154000' <<<"$out" && { echo "PASS  measured at the origin it was given"; pass=$((pass+1)); } \
                                         || echo "FAIL  wrong origin"
grep -q 'using tiletest.js' <<<"$out" && { echo "PASS  used the pack it was told to, not a real one"; pass=$((pass+1)); } \
                                      || echo "FAIL  wrong pack"
echo; echo "$pass/4 passed"
[ "$pass" = "4" ]
