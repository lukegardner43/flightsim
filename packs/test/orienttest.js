/* A model's frame must not be decided by rounding.

   orientedBox takes the footprint's longest edge and then swaps so u is the
   longer half. On a long building that is decisive. Polesden Lacey is 58.9 m
   east to west by 59.5 m north to south and the swap turns on 1.3 m, so the
   frame the whole model is written in was being chosen by which way that
   rounding happened to fall — and a re-survey that moved one corner a metre
   would have rotated the house ninety degrees.

   This scores the model's ground plan against the surveyed outline all eight
   ways round and insists the pinned bearing is the one that fits. It is the
   check that would have caught a silent flip. */
'use strict';
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..');
const rings = [];
global.TF_PACK = d => {
  const q = d.q || 1e6;
  for (const enc of d.buildings) {
    const pts = []; let la = enc[0], lo = enc[1];
    pts.push([la/q, lo/q]);
    for (let i = 2; i < enc.length; i += 2) { la += enc[i]; lo += enc[i+1]; pts.push([la/q, lo/q]); }
    rings.push(pts);
  }
};
for (const f of fs.readdirSync(D).sort()) {
  if (!f.endsWith('.js')) continue;
  const fd = fs.openSync(path.join(D, f), 'r'), b = Buffer.alloc(8);
  fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  if (b.toString() === 'TF_PACK(') require(path.join(D, f));
}

function fitOf(model, lat, lon) {
  const mLat = 110540, mLon = 111320 * Math.cos(lat * Math.PI/180);
  const pip = (la, lo, pts) => {
    let n = false;
    for (let i = 0, j = pts.length-1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if (((a[0] > la) !== (b[0] > la)) && (lo < (b[1]-a[1])*(la-a[0])/(b[0]-a[0]) + a[1])) n = !n;
    }
    return n;
  };
  let R = null;
  for (const r of rings) if (pip(lat, lon, r)) { R = r; break; }
  if (!R) return null;
  const W = R.map(p => ({ x: (p[1]-lon)*mLon, z: -(p[0]-lat)*mLat }));
  if (Math.abs(W[0].x - W[W.length-1].x) < 1e-6) W.pop();
  let cx = 0, cz = 0;
  for (const p of W) { cx += p.x; cz += p.z; }
  cx /= W.length; cz /= W.length;
  let best = null;
  for (let i = 0; i < W.length; i++) {
    const j = (i+1) % W.length, dx = W[j].x - W[i].x, dz = W[j].z - W[i].z, L = Math.hypot(dx, dz);
    if (!best || L > best.L) best = { L, dx, dz };
  }
  let ux = best.dx/best.L, uz = best.dz/best.L;
  const ext = (ux, uz) => {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of W) {
      const dx = p.x-cx, dz = p.z-cz, u = dx*ux + dz*uz, v = -dx*uz + dz*ux;
      u0 = Math.min(u0,u); u1 = Math.max(u1,u); v0 = Math.min(v0,v); v1 = Math.max(v1,v);
    }
    return { u0, u1, v0, v1, hu:(u1-u0)/2, hv:(v1-v0)/2 };
  };
  let e = ext(ux, uz);
  if (e.hv > e.hu) { const t = ux; ux = -uz; uz = t; e = ext(ux, uz); }
  const bearing = (dx, dz) => { const b = Math.atan2(dx, -dz)*180/Math.PI; return (b%360+360)%360; };

  const blocks = [];
  for (const p of model.parts) {
    if (p.minHeight > 0 || !p.at || p.sides) continue;
    if (p.wF == null || p.dF == null) continue;
    blocks.push({ u0: p.at[0]-p.wF, u1: p.at[0]+p.wF, v0: p.at[1]-p.dF, v1: p.at[1]+p.dF });
  }
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const p of W) { mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x); mnz=Math.min(mnz,p.z); mxz=Math.max(mxz,p.z); }
  const inS = (x, z) => {
    let n = false;
    for (let i = 0, j = W.length-1; i < W.length; j = i++) {
      const a = W[i], b = W[j];
      if (((a.z > z) !== (b.z > z)) && (x < (b.x-a.x)*(z-a.z)/(b.z-a.z) + a.x)) n = !n;
    }
    return n;
  };
  const out = [];
  for (const want of [0, 90, 180, 270]) for (const mir of [false, true]) {
    const c = [[ux,uz], [-uz,ux], [-ux,-uz], [uz,-ux]];
    let bi = 0, bd = 1e9;
    for (let i = 0; i < 4; i++) {
      const bg = bearing(c[i][0], c[i][1]);
      const dd = Math.abs(((bg-want)%360 + 540)%360 - 180);
      if (dd < bd) { bd = dd; bi = i; }
    }
    const UX = c[bi][0], UZ = c[bi][1], E = ext(UX, UZ);
    const ccx = cx + (E.u0+E.u1)/2*UX - (E.v0+E.v1)/2*UZ;
    const ccz = cz + (E.u0+E.u1)/2*UZ + (E.v0+E.v1)/2*UX;
    let both = 0, mo = 0, so = 0;
    for (let x = mnx-4; x <= mxx+4; x++) for (let z = mnz-4; z <= mxz+4; z++) {
      const s = inS(x, z), dx = x-ccx, dz = z-ccz;
      const u = (dx*UX + dz*UZ)/E.hu, v = (mir?-1:1)*(-dx*UZ + dz*UX)/E.hv;
      let m = false;
      for (const b of blocks) if (u >= b.u0 && u <= b.u1 && v >= b.v0 && v <= b.v1) { m = true; break; }
      if (s && m) both++; else if (m) mo++; else if (s) so++;
    }
    out.push({ want, mir, iou: both/(both+mo+so), bearing: bearing(UX, UZ) });
  }
  out.sort((a, b) => b.iou - a.iou);
  return out;
}

const models = require('../../models/kt23-3hp.json').models;
let fail = 0, ran = 0;
for (const m of models) {
  if (m.uBearing == null || !m.near) continue;
  ran++;
  const r = fitOf(m, m.near[0], m.near[1]);
  if (!r) { console.log('FAIL  ' + m.name + ': no surveyed footprint under it'); fail++; continue; }
  const top = r[0], pinned = r.find(x => x.want === m.uBearing && !x.mir);
  const ok = top.want === m.uBearing && !top.mir;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + m.name.padEnd(22) +
    'pinned uBearing ' + String(m.uBearing).padStart(3) +
    ' fits ' + (pinned.iou*100).toFixed(1) + '%' +
    (ok ? ', best of eight; next ' + (r[1].iou*100).toFixed(1) + '%'
        : ', but ' + top.want + (top.mir ? ' mirrored' : '') + ' fits better at ' + (top.iou*100).toFixed(1) + '%'));
  if (!ok) fail++;
  /* a frame that only just wins is a frame that can flip */
  const margin = pinned.iou - r.filter(x => !(x.want === m.uBearing && !x.mir))[0].iou;
  const clear = margin > 0.10;
  console.log((clear ? 'PASS  ' : 'FAIL  ') + '  and wins clearly'.padEnd(22) +
    'margin over the next placement ' + (margin*100).toFixed(1) + ' points, want more than 10');
  if (!clear) fail++;
}
if (!ran) { console.log('FAIL  no model pins a uBearing, so this tested nothing'); process.exit(1); }
console.log('\n' + (fail ? fail + ' failed' : 'all passed') + '  (' + ran + ' model' + (ran===1?'':'s') + ' with a pinned frame)');
process.exit(fail ? 1 : 0);
