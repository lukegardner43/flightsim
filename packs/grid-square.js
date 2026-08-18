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
function bng(lat, lon) {
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
  const square = String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
  /* the two digits of the 10 km tile inside that square, as on a paper map:
     easting first, then northing, so TQ15 is 10 km east and 50 km north of
     TQ's south-west corner */
  const te = Math.floor((E % 100000) / 10000), tn = Math.floor((N % 100000) / 10000);
  return { E: E, N: N, square: square, tile: square + te + tn, te: te, tn: tn };
}
function gridLetters(lat, lon) {
  const b = bng(lat, lon);
  return b ? b.square : null;
}

/* ---- 10 km tiles ----
   Packs are built per 10 km Ordnance Survey tile rather than per postcode, so
   two nearby postcodes share their coverage instead of each carrying its own
   overlapping square. A tile is named the way a paper map names it: TQ15. */
const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';           /* no I */
function tileOrigin(id) {
  const m = /^([A-Z])([A-Z])(\d)(\d)$/.exec(String(id).toUpperCase());
  if (!m) return null;
  const i1 = LETTERS.indexOf(m[1]), i2 = LETTERS.indexOf(m[2]);
  if (i1 < 0 || i2 < 0) return null;
  const e100 = ((i1 - 2) % 5) * 5 + (i2 % 5);
  const n100 = (19 - Math.floor(i1 / 5) * 5) - Math.floor(i2 / 5);
  return { E: e100 * 100000 + (+m[3]) * 10000, N: n100 * 100000 + (+m[4]) * 10000 };
}
/* every 10 km tile that a square of half-width `half` metres about a point
   touches — up to four, since the sim's world is 10 km across */
function tilesAround(lat, lon, half) {
  const b = bng(lat, lon);
  if (!b) return [];
  const out = {}, list = [];
  for (const de of [-half, 0, half]) for (const dn of [-half, 0, half]) {
    const e = b.E + de, n = b.N + dn;
    const e100 = Math.floor(e / 100000), n100 = Math.floor(n / 100000);
    if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) continue;
    let l1 = (19 - n100) - (19 - n100) % 5 + Math.floor((e100 + 10) / 5);
    let l2 = (19 - n100) * 5 % 25 + e100 % 5;
    if (l1 > 7) l1++;
    if (l2 > 7) l2++;
    const id = String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65) +
               Math.floor((e % 100000) / 10000) + Math.floor((n % 100000) / 10000);
    if (!out[id]) { out[id] = 1; list.push(id); }
  }
  return list.sort();
}

/* ---- OSGB36 / British National Grid -> WGS84 ----
   Inverse Transverse Mercator on the Airy ellipsoid, then a 7-parameter
   Helmert shift. Good to a few metres, which is inside the width of a wall
   at the zoom levels the sim flies at. If you exported with
   `ogr2ogr -t_srs EPSG:4326` this code never runs. */
function bngToWgs84(E, N) {
  const a = 6377563.396, b = 6356256.909;            // Airy 1830
  const F0 = 0.9996012717, lat0 = 49 * Math.PI / 180, lon0 = -2 * Math.PI / 180;
  const N0 = -100000, E0 = 400000;
  const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b);

  let lat = lat0, M = 0;
  do {
    lat = (N - N0 - M) / (a * F0) + lat;
    const dl = lat - lat0, sl = lat + lat0;
    M = b * F0 * (
      (1 + n + 1.25 * n * n + 1.25 * n * n * n) * dl
      - (3 * n + 3 * n * n + 2.625 * n * n * n) * Math.sin(dl) * Math.cos(sl)
      + (1.875 * n * n + 1.875 * n * n * n) * Math.sin(2 * dl) * Math.cos(2 * sl)
      - (35 / 24) * n * n * n * Math.sin(3 * dl) * Math.cos(3 * sl));
  } while (Math.abs(N - N0 - M) >= 1e-5);

  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = Math.tan(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const t2 = tanLat * tanLat, t4 = t2 * t2;
  const VII = tanLat / (2 * rho * nu);
  const VIII = tanLat / (24 * rho * nu ** 3) * (5 + 3 * t2 + eta2 - 9 * t2 * eta2);
  const IX = tanLat / (720 * rho * nu ** 5) * (61 + 90 * t2 + 45 * t4);
  const X = 1 / (cosLat * nu);
  const XI = 1 / (cosLat * 6 * nu ** 3) * (nu / rho + 2 * t2);
  const XII = 1 / (cosLat * 120 * nu ** 5) * (5 + 28 * t2 + 24 * t4);
  const XIIA = 1 / (cosLat * 5040 * nu ** 7) * (61 + 662 * t2 + 1320 * t4 + 720 * t4 * t2);
  const dE = E - E0;
  const latR = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const lonR = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;

  // geodetic -> cartesian on Airy
  const sinP = Math.sin(latR), cosP = Math.cos(latR);
  const nu2 = a / Math.sqrt(1 - e2 * sinP * sinP);
  let x = nu2 * cosP * Math.cos(lonR), y = nu2 * cosP * Math.sin(lonR), z = (1 - e2) * nu2 * sinP;

  // Helmert OSGB36 -> WGS84
  const tx = 446.448, ty = -125.157, tz = 542.060;
  const rx = 0.1502 / 3600 * Math.PI / 180, ry = 0.2470 / 3600 * Math.PI / 180, rz = 0.8421 / 3600 * Math.PI / 180;
  const sc = 1 + (-20.4894e-6);
  const x2 = tx + sc * (x - rz * y + ry * z);
  const y2 = ty + sc * (rz * x + y - rx * z);
  const z2 = tz + sc * (-ry * x + rx * y + z);

  // cartesian -> geodetic on WGS84
  const aw = 6378137, bw = 6356752.3142, e2w = 1 - (bw * bw) / (aw * aw);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let phi = Math.atan2(z2, p * (1 - e2w)), phi0;
  do {
    phi0 = phi;
    const nu3 = aw / Math.sqrt(1 - e2w * Math.sin(phi) * Math.sin(phi));
    phi = Math.atan2(z2 + e2w * nu3 * Math.sin(phi), p);
  } while (Math.abs(phi - phi0) > 1e-11);
  return { lat: phi * 180 / Math.PI, lon: Math.atan2(y2, x2) * 180 / Math.PI };
}


module.exports = { gridLetters, bng, tileOrigin, tilesAround, bngToWgs84 };

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
