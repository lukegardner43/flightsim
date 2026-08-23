const { fitParts, fitRoof } = require('../roof-fit.js');

/* Buildings whose massing we chose: a two-storey house with a single-storey
   rear extension, a terrace with one loft conversion, a barn with a lean-to,
   and — importantly — plain buildings that must NOT be split. */
function rect(cx, cy, w, d, ang){
  const c=Math.cos(ang), s=Math.sin(ang), o=[];
  for (const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]])
    o.push([cx+(sx*w/2)*c-(sy*d/2)*s, cy+(sx*w/2)*s+(sy*d/2)*c]);
  return o;
}
/* blocks: list of {u0,u1,eaves,ridge,kind} in the building's own frame,
   u measured along the w axis from -w/2 */
function sampler(cx, cy, w, d, ang, blocks, noise){
  const c=Math.cos(-ang), s=Math.sin(-ang);
  return (X,Y)=>{
    const dx=X-cx, dy=Y-cy;
    const u=dx*c-dy*s, v=dx*s+dy*c;
    if (Math.abs(u)>w/2 || Math.abs(v)>d/2) return 0;
    const uu = u + w/2;                         // 0..w
    for (const b of blocks){
      if (uu < b.u0 || uu > b.u1) continue;
      const rel=b.ridge-b.eaves;
      const n = noise ? Math.sin(X*12.9+Y*78.2)*noise : 0;
      if (b.kind==='flat') return b.eaves+n;
      return b.eaves + rel*(1-Math.abs(v)/(d/2)) + n;   // gabled across v
    }
    return 0;
  };
}
/* along the d axis instead (front/back split) */
function samplerV(cx, cy, w, d, ang, blocks, noise){
  const c=Math.cos(-ang), s=Math.sin(-ang);
  return (X,Y)=>{
    const dx=X-cx, dy=Y-cy;
    const u=dx*c-dy*s, v=dx*s+dy*c;
    if (Math.abs(u)>w/2 || Math.abs(v)>d/2) return 0;
    const vv = v + d/2;
    for (const b of blocks){
      if (vv < b.u0 || vv > b.u1) continue;
      const rel=b.ridge-b.eaves;
      const n = noise ? Math.sin(X*12.9+Y*78.2)*noise : 0;
      if (b.kind==='flat') return b.eaves+n;
      return b.eaves + rel*(1-Math.abs(u)/(w/2)) + n;
    }
    return 0;
  };
}
const cases = [
  { name:'house + rear ext', w:9, d:14, ang:0, axis:'v', want:2,
    blocks:[{u0:0,u1:8,eaves:5.2,ridge:8.4,kind:'gabled'},
            {u0:8,u1:14,eaves:2.7,ridge:4.2,kind:'gabled'}], V:true,
    heights:[[5.2,8.4],[2.7,4.2]] },
  { name:'terrace, one loft', w:30, d:8, ang:0, axis:'u', want:2,
    blocks:[{u0:0,u1:20,eaves:5.4,ridge:8.4,kind:'gabled'},
            {u0:20,u1:30,eaves:7.6,ridge:10.8,kind:'gabled'}],
    heights:[[5.4,8.4],[7.6,10.8]] },
  { name:'barn + lean-to', w:22, d:10, ang:0.5, axis:'u', want:2,
    blocks:[{u0:0,u1:15,eaves:6.0,ridge:9.0,kind:'gabled'},
            {u0:15,u1:22,eaves:3.0,ridge:4.4,kind:'gabled'}],
    heights:[[6.0,9.0],[3.0,4.4]] },
  { name:'three steps', w:36, d:9, ang:0, axis:'u', want:3,
    blocks:[{u0:0,u1:12,eaves:4.0,ridge:6.6,kind:'gabled'},
            {u0:12,u1:24,eaves:6.6,ridge:9.4,kind:'gabled'},
            {u0:24,u1:36,eaves:9.2,ridge:12.0,kind:'gabled'}],
    heights:[[4.0,6.6],[6.6,9.4],[9.2,12.0]] },
  /* must NOT split */
  { name:'plain semi',   w:11, d:8,  ang:0, want:0,
    blocks:[{u0:0,u1:11,eaves:5.2,ridge:8.6,kind:'gabled'}] },
  { name:'plain block',  w:26, d:18, ang:0.4, want:0,
    blocks:[{u0:0,u1:26,eaves:15.0,ridge:15.2,kind:'flat'}] },
  { name:'long terrace, one height', w:40, d:8, ang:0, want:0,
    blocks:[{u0:0,u1:40,eaves:5.6,ridge:9.0,kind:'gabled'}] }
];
let pass=0;
for (const t of cases){
  const cx=500, cy=500;
  const ring = rect(cx,cy,t.w,t.d,t.ang);
  const smp = (t.V?samplerV:sampler)(cx,cy,t.w,t.d,t.ang,t.blocks,0.3);
  const r = fitParts(ring, smp);
  const got = r ? r.parts.length : 0;
  let ok = got === t.want;
  let detail = '';
  if (ok && t.want && r){
    /* heights right, and in the right order along the axis */
    for (let i=0;i<r.parts.length;i++){
      const [e,rd] = t.heights[i];
      if (Math.abs(r.parts[i].eaves-e) > 1.0 || Math.abs(r.parts[i].ridge-rd) > 1.0) ok=false;
    }
    detail = r.parts.map(p=>p.eaves.toFixed(1)+'/'+p.ridge.toFixed(1)).join('  ');
    if (r.axis !== t.axis) { ok=false; detail += '  AXIS '+r.axis+' want '+t.axis; }
  }
  if (ok) pass++;
  console.log((ok?'PASS ':'FAIL ')+t.name.padEnd(22)+' parts '+got+' (want '+t.want+')  '+detail);
}
console.log('\n'+pass+'/'+cases.length+' passed');
process.exit(pass === cases.length ? 0 : 1);
