const { fitRoof } = require('../roof-fit.js');

/* Build a synthetic normalised height model containing roofs whose shape,
   eaves and ridge we chose ourselves, then see whether the fit finds them. */
function rect(cx, cy, w, d, ang){
  const c = Math.cos(ang), s = Math.sin(ang), out = [];
  for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]])
    out.push([cx + (sx*w/2)*c - (sy*d/2)*s, cy + (sx*w/2)*s + (sy*d/2)*c]);
  return out;
}
/* height of a roof at a point, in the building's own frame */
function makeSampler(cx, cy, w, d, ang, kind, eaves, ridge, noise){
  const c = Math.cos(-ang), s = Math.sin(-ang);
  return (X, Y) => {
    const dx = X - cx, dy = Y - cy;
    const u = dx*c - dy*s, v = dx*s + dy*c;          // u along w, v along d
    if (Math.abs(u) > w/2 || Math.abs(v) > d/2) return 0;   // ground outside
    const n = noise ? (Math.sin(X*12.9 + Y*78.2)*0.5) * noise : 0;
    const rel = ridge - eaves;
    if (kind === 'flat')  return eaves + n;
    if (kind === 'gabled'){                          // ridge runs along u
      return eaves + rel * (1 - Math.abs(v)/(d/2)) + n;
    }
    if (kind === 'hipped'){                          // hips at both ends of u
      const a = 1 - Math.abs(v)/(d/2);
      const b = 1 - Math.max(0, (Math.abs(u) - (w/2 - d/2)) / (d/2));
      return eaves + rel * Math.max(0, Math.min(a, b)) + n;
    }
    if (kind === 'pyramidal'){
      const a = 1 - Math.abs(v)/(d/2), b = 1 - Math.abs(u)/(w/2);
      return eaves + rel * Math.max(0, Math.min(a, b)) + n;
    }
    return 0;
  };
}
const cases = [
  ['gabled  E-W ridge', 500, 500, 12, 7, 0,           'gabled',    5.2, 8.6],
  ['gabled  N-S ridge', 500, 500, 7, 12, 0,           'gabled',    5.2, 8.6],
  ['gabled  45 deg',    500, 500, 14, 8, Math.PI/4,   'gabled',    5.0, 8.4],
  ['hipped  bungalow',  500, 500, 14, 9, 0,           'hipped',    2.9, 5.4],
  ['hipped  rotated',   500, 500, 15, 9, 0.6,         'hipped',    5.4, 8.8],
  ['pyramid square',    500, 500, 10, 10, 0,          'pyramidal', 4.0, 8.0],
  ['flat    block',     500, 500, 24, 18, 0,          'flat',     14.0, 14.3],
  ['flat    shed',      500, 500, 30, 20, 0.3,        'flat',      6.0, 6.2],
  ['gabled  terrace',   500, 500, 40, 8, 0,           'gabled',    5.6, 9.0]
];
/* Harder: the OS outline is the wall face, so the footprint catches a ring of
   garden, and a chimney sticks up through the roof. Both are what actually
   breaks a naive min/max. */
const hard = [
  ['bleed   gabled semi', 500, 500, 11, 8, 0,   'gabled', 5.2, 8.6, 1.6, 0],
  ['bleed   hipped det',  500, 500, 13, 10, 0.4,'hipped', 5.0, 8.2, 1.4, 0],
  ['chimney gabled',      500, 500, 12, 7, 0,   'gabled', 5.2, 8.6, 0,   3.0]
];
let pass = 0;
for (const [label, cx, cy, w, d, ang, kind, eaves, ridge, bleed, chim] of cases.map(c => c.concat([0,0])).concat(hard)){
  /* the ring is the roof plus an apron of ground, if this case has one */
  const ring = rect(cx, cy, w + 2*(bleed||0), d + 2*(bleed||0), ang);
  const base = makeSampler(cx, cy, w, d, ang, kind, eaves, ridge, 0.35);
  const f = fitRoof(ring, (X, Y) => {
    if (chim && Math.abs(X - (cx + w*0.3)) < 0.6 && Math.abs(Y - cy) < 0.6) return ridge + chim;
    return base(X, Y);
  });
  // bearing of the ridge: the u axis is (cos ang, sin ang) in (East, North)
  const ridgeBearing = ((Math.atan2(Math.cos(ang), Math.sin(ang))*180/Math.PI % 180) + 180) % 180;
  const bOK = f.shape === 'flat' || f.bearing == null ||
              Math.min(Math.abs(f.bearing - ridgeBearing),
                       180 - Math.abs(f.bearing - ridgeBearing)) <= 12;
  const ok = f.ok && f.shape === kind &&
             Math.abs(f.eaves - eaves) < 0.8 && Math.abs(f.ridge - ridge) < 0.8 && bOK;
  if (ok) pass++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label.padEnd(20) +
    ' shape ' + String(f.shape).padEnd(10) +
    ' eaves ' + f.eaves.toFixed(1) + ' (want ' + eaves.toFixed(1) + ')' +
    ' ridge ' + f.ridge.toFixed(1) + ' (want ' + ridge.toFixed(1) + ')' +
    ' bearing ' + String(f.bearing) + ' (want ' + Math.round(ridgeBearing) + ')' +
    ' n=' + f.n);
}
console.log('\n' + pass + '/' + (cases.length + hard.length) + ' passed');
