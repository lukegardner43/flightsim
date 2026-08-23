/* Does the ruler read back a blur we chose ourselves?

   Forty flat-roofed blocks of assorted heights and sizes on a synthetic tile,
   every edge blurred by a known width. If the printed curve reaches 1.00 at
   that width the diagnostic can be trusted on real data; if it does not, the
   next run of the workflow is wasted. */
const fs=require('fs'), cp=require('child_process'), path=require('path');
const ROOT=path.resolve(__dirname, '..', '..'), SP=__dirname;
const { tileOrigin, bngToWgs84 } = require(ROOT+'/packs/grid-square.js');
const BLUR = +(process.argv[2] || 1.5);          // metres of edge smear
const TILE='TQ15', N=1000, PIX=1, o=tileOrigin(TILE);

const B=[];
let seed=7; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
for(let i=0;i<40;i++){
  B.push({ x:60+(i%8)*80, y:60+Math.floor(i/8)*110,
           w:18+Math.round(rnd()*16), d:14+Math.round(rnd()*12),
           h:4+Math.round(rnd()*14) });               // 4..18 m, flat
}
/* and ordinary gabled houses, for the ruler that runs along a ridge: eaves
   in the window the diagnostic looks at, a roof of a pitch we chose, and the
   same blur on every wall */
for(let i=0;i<48;i++){
  B.push({ x:70+(i%8)*80, y:680+Math.floor(i/8)*50,
           w:12+Math.round(rnd()*6), d:8+Math.round(rnd()*3),
           e:5.0+rnd()*1.2, r:8.2+rnd()*1.0, gabled:true });
}
/* the surface: a roof, its edge ramped over BLUR metres either side of the
   wall, exactly as a sample straddling a wall averages both */
function roofAt(b,E,Nn){
  const u=E-(o.E+b.x), v=Nn-(o.N+b.y);
  const inside=Math.min(b.w/2-Math.abs(u), b.d/2-Math.abs(v));
  if(inside<=-BLUR) return null;
  /* ridge runs along u, so the slope is across v */
  const top = b.gabled ? b.e+(b.r-b.e)*(1-Math.min(1,Math.abs(v)/(b.d/2))) : b.h;
  if(inside>=BLUR) return top;
  return top*((inside+BLUR)/(2*BLUR));
}
const dsm=Buffer.allocUnsafe(N*N*4), dtm=Buffer.allocUnsafe(N*N*4);
for(let row=0;row<N;row++){
  const Nn=o.N+N*PIX-(row+0.5)*PIX;
  for(let col=0;col<N;col++){
    const E=o.E+(col+0.5)*PIX, ground=40+(E-o.E)*0.003;
    let z=ground;
    for(const b of B){ const h=roofAt(b,E,Nn); if(h!=null){ z=ground+h; break; } }
    const i=(row*N+col)*4; dsm.writeFloatLE(z,i); dtm.writeFloatLE(ground,i);
  }
}
fs.writeFileSync(SP+'/b-dsm.img',dsm); fs.writeFileSync(SP+'/b-dtm.img',dtm);

const Q=1e6;
function enc(pts){ const out=[Math.round(pts[0][0]*Q),Math.round(pts[0][1]*Q)];
  let pa=out[0],po=out[1];
  for(let i=1;i<pts.length;i++){const qa=Math.round(pts[i][0]*Q),qo=Math.round(pts[i][1]*Q);
    out.push(qa-pa,qo-po);pa=qa;po=qo;} return out; }
const buildings=B.map(b=>{ const pts=[];
  for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const w=bngToWgs84(o.E+b.x+sx*b.w/2, o.N+b.y+sy*b.d/2); pts.push([w.lat,w.lon]); }
  return enc(pts); });
/* NOT tq15.js. A test fixture must never take the name of a pack somebody
   flies: this one did, and when make-pack.js ran while it happened to be on
   disk, a phantom "tq15" went into the sim's PACKS list and had to be taken
   out again. The unlink below is in a finally for the same reason — a test
   that throws must not leave a pack behind. */
const packFile=ROOT+'/packs/blurtest.js';
fs.writeFileSync(packFile,'TF_PACK('+JSON.stringify({id:'blurtest',tile:TILE,name:'blur test',
  bbox:[0,0,0,0],q:Q,source:'synthetic',updated:'2026-08-21',buildings})+');\n');
try {

console.log('BLUR built into the surface: '+BLUR.toFixed(1)+' m either side of the wall');
console.log('so the roof is at full height from '+BLUR.toFixed(1)+' m in, and the curve');
console.log('should read 1.00 there and below it nearer the wall.\n');
const out=cp.execSync('node '+ROOT+'/packs/make-heights.js --tile '+TILE+' --pack blurtest'+
  ' --dsm '+SP+'/b-dsm.img --dtm '+SP+'/b-dtm.img --size '+N+' --pixel '+PIX,{encoding:'utf8'});
const cut = out.indexOf('the edge blur');
console.log(cut < 0 ? out : out.slice(cut));
} finally {
  fs.unlinkSync(packFile);
  try { fs.unlinkSync(SP+'/b-dsm.img'); fs.unlinkSync(SP+'/b-dtm.img'); } catch (e) {}
}
