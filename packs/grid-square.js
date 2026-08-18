#!/usr/bin/env node
/* Which 100 km Ordnance Survey grid square is a postcode in?
   OS publishes OpenMap Local one grid square at a time (TQ, SU, NZ …), so the
   build workflow needs the two letters before it can download anything. Prints
   the letters, the latitude and the longitude, one per line, for the shell to
   read.

   Usage:  node packs/grid-square.js KT23 3HP
           node packs/grid-square.js 51.2790 -0.3760
*/
'use strict';

/* WGS84 lat/lon -> OSGB36 easting/northing -> the two grid letters. Same
   arithmetic the sim uses for the grid reference on its HUD. */
function gridLetters(lat, lon) {
  const d = Math.PI / 180, phi = lat * d, lam = lon * d;
  const a1 = 6378137, f1 = 1 / 298.257223563, e1 = 2 * f1 - f1 * f1;
  const v1 = a1 / Math.sqrt(1 - e1 * Math.sin(phi) ** 2);
  const x1 = v1 * Math.cos(phi) * Math.cos(lam), y1 = v1 * Math.cos(phi) * Math.sin(lam),
        z1 = (1 - e1) * v1 * Math.sin(phi);
  const tx = -446.448, ty = 125.157, tz = -542.060, s = 20.4894e-6,
        rx = (-0.1502 / 3600) * d, ry = (-0.2470 / 3600) * d, rz = (-0.8421 / 3600) * d;
  const x2 = tx + x1 * (1 + s) - y1 * rz + z1 * ry,
        y2 = ty + x1 * rz + y1 * (1 + s) - z1 * rx,
        z2 = tz - x1 * ry + y1 * rx + z1 * (1 + s);
  const a = 6377563.396, b = 6356256.909, e2 = (a * a - b * b) / (a * a);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let ph = Math.atan2(z2, p * (1 - e2)), phP = 2 * Math.PI, v = a, guard = 0;
  while (Math.abs(ph - phP) > 1e-11 && guard++ < 40) {
    v = a / Math.sqrt(1 - e2 * Math.sin(ph) ** 2);
    phP = ph; ph = Math.atan2(z2 + e2 * v * Math.sin(ph), p);
  }
  const la = Math.atan2(y2, x2);
  const F0 = 0.9996012717, ph0 = 49 * d, la0 = -2 * d, E0 = 400000, N0 = -100000;
  const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
  v = a * F0 / Math.sqrt(1 - e2 * Math.sin(ph) ** 2);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * Math.sin(ph) ** 2, 1.5);
  const eta2 = v / rho - 1, dP = ph - ph0, sP = ph + ph0;
  const M = b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * dP
    - (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(dP) * Math.cos(sP)
    + (1.875 * n2 + 1.875 * n3) * Math.sin(2 * dP) * Math.cos(2 * sP)
    - (35 / 24) * n3 * Math.sin(3 * dP) * Math.cos(3 * sP));
  const cp = Math.cos(ph), sp = Math.sin(ph), tp = Math.tan(ph), t2 = tp * tp, t4 = t2 * t2;
  const I = M + N0, II = v / 2 * sp * cp, III = v / 24 * sp * cp ** 3 * (5 - t2 + 9 * eta2),
        IIIA = v / 720 * sp * cp ** 5 * (61 - 58 * t2 + t4);
  const IV = v * cp, V = v / 6 * cp ** 3 * (v / rho - t2),
        VI = v / 120 * cp ** 5 * (5 - 18 * t2 + t4 + 14 * eta2 - 58 * t2 * eta2);
  const dl = la - la0;
  const N = I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6;
  const E = E0 + IV * dl + V * dl ** 3 + VI * dl ** 5;
  const e100 = Math.floor(E / 100000), n100 = Math.floor(N / 100000);
  if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) return null;
  let l1 = (19 - n100) - (19 - n100) % 5 + Math.floor((e100 + 10) / 5);
  let l2 = (19 - n100) * 5 % 25 + e100 % 5;
  if (l1 > 7) l1++;
  if (l2 > 7) l2++;
  return String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
}

module.exports = { gridLetters };

/* Only act as a command when run as one — analysis/sample.js requires this
   file for gridLetters and must not have it start resolving postcodes. */
if (require.main !== module) return;

(async () => {
  const args = process.argv.slice(2).join(' ').trim();
  if (!args) { console.error('give a postcode, or a latitude and longitude'); process.exit(1); }
  let lat, lon;
  const nums = args.split(/[\s,]+/).map(Number);
  if (nums.length === 2 && nums.every(v => !isNaN(v))) {
    [lat, lon] = nums;
  } else {
    const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(args.replace(/\s+/g, '')));
    const j = await r.json().catch(() => ({}));
    if (!j.result || j.result.latitude == null) {
      console.error('postcode not found: ' + args + '. Check it, or give a latitude and longitude instead.');
      process.exit(1);
    }
    lat = j.result.latitude; lon = j.result.longitude;
    console.error('resolved ' + j.result.postcode + ' (' + (j.result.admin_ward || j.result.admin_district || '') + ')');
  }
  const sq = gridLetters(lat, lon);
  if (!sq) { console.error('that point is outside the British National Grid'); process.exit(1); }
  console.log(sq);
  console.log(lat);
  console.log(lon);
})();
