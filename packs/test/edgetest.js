const { fitRoof } = require('../roof-fit.js');
/* Real lidar does not step cleanly from garden to roof. A 1 m sample that
   straddles the wall averages both, so the edge of every building is a ramp
   one or two pixels wide. The synthetic tests so far used a hard step, which
   is why they never caught this. */
function rect(cx,cy,w,d){return [[cx-w/2,cy-d/2],[cx+w/2,cy-d/2],[cx+w/2,cy+d/2],[cx-w/2,cy+d/2]];}
function smoothed(cx,cy,w,d,eaves,ridge,ramp,hip){
  return (X,Y)=>{
    const u=X-cx, v=Y-cy;
    const a = 1-Math.min(1,Math.abs(v)/(d/2));
    const b = 1-Math.max(0,(Math.abs(u)-(w/2-d/2))/(d/2));
    const roof = eaves + (ridge-eaves)*(hip?Math.max(0,Math.min(a,b)):a);
    /* how far inside the wall, in metres */
    const inside = Math.min(w/2-Math.abs(u), d/2-Math.abs(v));
    if (inside <= -ramp) return 0;
    if (inside >= ramp) return roof;
    const f = (inside + ramp) / (2*ramp);      // ramp across the wall
    return roof * f;
  };
}
const cases = [
  ['semi   11x8  ramp 1.0', 11, 8,  5.2, 8.6, 1.0],
  ['semi   11x8  ramp 1.5', 11, 8,  5.2, 8.6, 1.5],
  ['detach 13x10 ramp 1.5', 13, 10, 5.4, 8.8, 1.5],
  ['terr   30x8  ramp 1.5', 30, 8,  5.4, 8.4, 1.5],
  ['bungal 13x9  ramp 1.5', 13, 9,  2.7, 5.2, 1.5],
  ['HIP det 13x10 ramp 1.5', 13, 10, 5.4, 8.8, 1.5, 1],
  ['HIP bung 14x9 ramp 1.5', 14, 9,  2.7, 5.2, 1.5, 1]
];
let pass = 0;
console.log('case                          shape     eaves(want)          ridge(want)');
for (const [n,w,d,e,r,ramp,hip] of cases){
  const f = fitRoof(rect(500,500,w,d), smoothed(500,500,w,d,e,r,ramp,hip));
  const de = f.eaves-e, dr = f.ridge-r;
  const want = hip ? 'hipped' : 'gabled';
  const ok = f.shape === want && Math.abs(de) < 0.5 && Math.abs(dr) < 0.5;
  if (ok) pass++;
  console.log((ok?'PASS ':'FAIL ')+n.padEnd(24)+f.shape.padEnd(10)+f.eaves.toFixed(2)+'('+e+')  '+(de>=0?'+':'')+de.toFixed(2)+
    '   '+f.ridge.toFixed(2)+'('+r+')  '+(dr>=0?'+':'')+dr.toFixed(2));
}
console.log('\n' + pass + '/' + cases.length + ' passed');
process.exit(pass === cases.length ? 0 : 1);
