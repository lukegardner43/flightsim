#!/usr/bin/env node
/* Turns a glTF binary into plane/<id>.js, a script the sim can load.

     node plane/glb-to-js.js --in hawk_t1.glb --id hawk --span 9.39

   Why not just load the .glb? Because this page has to keep working when it
   is opened straight off a disk, where a script may be loaded but a file may
   not be read. That is the same reason the building packs and the landmark
   models are .js and not .json. It also means no GLTFLoader at runtime: the
   loading code below is about forty lines instead of a dependency.

   Geometry is quantised — positions to 16 bits across the model's own
   bounding box, normals to 8, colours to 8 — and base64'd. That is about a
   third of the size of the same thing as JSON numbers, and at this scale the
   error is well under a millimetre.

   The livery is baked in here as vertex colours rather than shipped as a
   texture, because the model arrives untextured and named part by part,
   which is a better starting point than a texture would be.
*/
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (dflt !== undefined) return dflt;
    console.error('missing --' + name); process.exit(1);
  }
  return process.argv[i + 1];
}
const IN = arg('in'), ID = arg('id', 'hawk'), SPAN = +arg('span', '9.39');
const DROP = arg('drop', '').split(',').map(s => s.trim()).filter(Boolean);

/* ---------- read the container ---------- */
const buf = fs.readFileSync(IN);
if (buf.toString('ascii', 0, 4) !== 'glTF') { console.error('not a .glb'); process.exit(1); }
let off = 12; const chunks = [];
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  chunks.push({ type: buf.toString('ascii', off + 4, off + 8), off: off + 8, len });
  off += 8 + len;
}
const gltf = JSON.parse(buf.toString('utf8', chunks[0].off, chunks[0].off + chunks[0].len));
const BIN = chunks[1].off;
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array,
             5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(i) {
  const a = gltf.accessors[i], bv = gltf.bufferViews[a.bufferView];
  const T = CT[a.componentType], n = NC[a.type];
  const start = BIN + (bv.byteOffset || 0) + (a.byteOffset || 0);
  /* a byteStride means the data is interleaved; copy it out element by element */
  if (bv.byteStride && bv.byteStride !== n * T.BYTES_PER_ELEMENT) {
    const out = new T(a.count * n);
    for (let e = 0; e < a.count; e++)
      for (let c = 0; c < n; c++)
        out[e * n + c] = new T(buf.buffer, buf.byteOffset + start + e * bv.byteStride, n)[c];
    return out;
  }
  return new T(buf.buffer, buf.byteOffset + start, a.count * n);
}

/* ---------- flatten the node tree ---------- */
function mul(a, b) {                       /* column-major 4x4, a then b */
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}
const flat = [];
(function walk(idx, m) {
  const n = gltf.nodes[idx];
  const world = mul(m, trs(n));
  if (n.mesh != null) flat.push({ mesh: n.mesh, m: world, name: gltf.meshes[n.mesh].name || ('mesh' + n.mesh) });
  for (const c of n.children || []) walk(c, world);
})(gltf.scenes[gltf.scene || 0].nodes[0], [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
for (const r of (gltf.scenes[gltf.scene || 0].nodes || []).slice(1))
  (function walk(idx, m) {
    const n = gltf.nodes[idx];
    const world = mul(m, trs(n));
    if (n.mesh != null) flat.push({ mesh: n.mesh, m: world, name: gltf.meshes[n.mesh].name || ('mesh' + n.mesh) });
    for (const c of n.children || []) walk(c, world);
  })(r, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

/* ---------- what each named part is ---------- */
const ROLE = [
  [/Glass/i,                                  'glass'],
  [/Wheel|Strut|Jaw|Doors|DoorBox/i,          'gear'],
  [/Cockpit|Seat|Panel|Hub/i,                 'cockpit'],
  [/Engine/i,                                 'engine'],
  [/Antenna|Probe|Rods|Sensor/i,              'trim'],
  [/./,                                       'paint']
];
function roleOf(name) {
  for (const [re, r] of ROLE) if (re.test(name)) return r;
  return 'paint';
}

/* ---------- pull every primitive into world space ---------- */
const parts = [];
for (const f of flat) {
  for (const p of gltf.meshes[f.mesh].primitives || []) {
    if (p.attributes.POSITION == null) continue;
    const P = accessor(p.attributes.POSITION);
    const N = p.attributes.NORMAL != null ? accessor(p.attributes.NORMAL) : null;
    const I = p.indices != null ? accessor(p.indices) : null;
    const m = f.m, n = P.length / 3;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = P[i*3], y = P[i*3+1], z = P[i*3+2];
      pos[i*3]   = m[0]*x + m[4]*y + m[8]*z  + m[12];
      pos[i*3+1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
      pos[i*3+2] = m[2]*x + m[6]*y + m[10]*z + m[14];
      if (N) {
        const a = N[i*3], b = N[i*3+1], c = N[i*3+2];
        let nx = m[0]*a + m[4]*b + m[8]*c, ny = m[1]*a + m[5]*b + m[9]*c, nz = m[2]*a + m[6]*b + m[10]*c;
        const L = Math.hypot(nx, ny, nz) || 1;
        nrm[i*3] = nx/L; nrm[i*3+1] = ny/L; nrm[i*3+2] = nz/L;
      }
    }
    const idx = I ? Array.from(I) : Array.from({ length: n }, (_, i) => i);
    parts.push({ name: f.name, role: roleOf(f.name), pos, nrm, idx });
  }
}
const before = parts.length;
const kept = parts.filter(p => !DROP.some(d => new RegExp(d, 'i').test(p.name)));
console.log('parts: ' + before + (kept.length < before ? ' (' + (before - kept.length) + ' dropped)' : ''));

/* ---------- orient and scale ---------- */
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const p of kept) for (let i = 0; i < p.pos.length; i += 3)
  for (let k = 0; k < 3; k++) {
    if (p.pos[i+k] < mn[k]) mn[k] = p.pos[i+k];
    if (p.pos[i+k] > mx[k]) mx[k] = p.pos[i+k];
  }
const size = mx.map((v, k) => v - mn[k]);
/* Y is up, so the two horizontal axes are 0 and 2. An aeroplane is LONGER
   than its span — a Hawk is 11.85 m long and 9.39 m across — so the bigger of
   the two is the length and the other is the span. Getting this the wrong way
   round scales it by the wrong number and lays it out sideways, which is what
   the first run of this did. */
const AX_LEN = size[0] >= size[2] ? 0 : 2;
const AX_SPAN = AX_LEN === 0 ? 2 : 0;
const scale = SPAN / size[AX_SPAN];
console.log('world size: ' + size.map(v => v.toFixed(1)).join(' x ') +
  '  ->  span axis ' + 'xyz'[AX_SPAN] + ', length axis ' + 'xyz'[AX_LEN] +
  ', scale ' + scale.toFixed(6));

/* Which way is the nose? The nose gear and nose antennas are at that end. */
let noseSum = 0, noseN = 0;
for (const p of kept) if (/Nose/i.test(p.name))
  for (let i = 0; i < p.pos.length; i += 3) { noseSum += p.pos[i + AX_LEN]; noseN++; }
const mid = (mn[AX_LEN] + mx[AX_LEN]) / 2;
const noseAt = noseN ? (noseSum / noseN) : mn[AX_LEN];
const flip = noseAt > mid ? -1 : 1;         /* the sim flies toward -z */
console.log('nose is at the ' + (noseAt > mid ? 'high' : 'low') + ' end of ' + 'xyz'[AX_LEN] +
  ', so it is ' + (flip < 0 ? 'flipped' : 'kept') + ' to point at -z');

/* Centre it on the middle of the box, not on the ground line. The sim flies
   the origin of this group, and putting the origin on the wheels hangs the
   aeroplane a couple of metres above where the camera expects it. */
const cen = [ (mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2 ];
function place(x, y, z) {                    /* -> sim axes: x span, y up, z aft */
  const v = [x - cen[0], y - cen[1], z - cen[2]];
  const out = AX_SPAN === 0 ? [v[0], v[1], v[2]] : [v[2], v[1], v[0]];
  return [out[0] * scale, out[1] * scale, out[2] * scale * flip];
}

/* ---------- the Red Arrows wrapper ---------- */
const RED = [0xd8, 0x12, 0x1f], WHITE = [0xf1, 0xef, 0xe8], BLUE = [0x0b, 0x3d, 0x91];
const DARKGLASS = [0x1d, 0x2a, 0x38], GEAR = [0x54, 0x59, 0x5f], INSIDE = [0x26, 0x2a, 0x2f];
const STEEL = [0x8a, 0x90, 0x96];
let hi = -1e9, lo = 1e9, aft = -1e9;
for (const p of kept) if (p.role === 'paint' || p.role === 'trim')
  for (let i = 0; i < p.pos.length; i += 3) {
    const q = place(p.pos[i], p.pos[i+1], p.pos[i+2]);
    if (q[1] > hi) hi = q[1];
    if (q[1] < lo) lo = q[1];
    if (q[2] > aft) aft = q[2];
  }
function livery(role, name, q) {
  if (role === 'glass') return DARKGLASS;
  if (role === 'gear') return GEAR;
  if (role === 'cockpit') return INSIDE;
  if (role === 'engine') return STEEL;
  /* the fin: white flash over a blue root, which is the tell from a mile off */
  /* A band of white with a blue cap, high up where it is seen against the
     sky. The first pass put white from 42% of the fin and blue above 78%,
     which made the whole thing navy from any distance. */
  if (/Tail|Rudder/i.test(name) && q[1] > hi * 0.62) {
    return q[1] > hi * 0.86 ? BLUE : WHITE;
  }
  return RED;
}

/* ---------- merge by role, quantise, encode ---------- */
const groups = {}, tally = {};
for (const p of kept) {
  const g = groups[p.role] || (groups[p.role] = { pos: [], nrm: [], col: [], idx: [] });
  const base = g.pos.length / 3;
  for (let i = 0; i < p.pos.length; i += 3) {
    const q = place(p.pos[i], p.pos[i+1], p.pos[i+2]);
    g.pos.push(q[0], q[1], q[2]);
    const nx = p.nrm[i], ny = p.nrm[i+1], nz = p.nrm[i+2];
    const o = AX_SPAN === 0 ? [nx, ny, nz] : [nz, ny, nx];
    g.nrm.push(o[0], o[1], o[2] * flip);
    const c = livery(p.role, p.name, q);
    g.col.push(c[0], c[1], c[2]);
    const key = c === WHITE ? 'white' : c === BLUE ? 'blue' : c === RED ? 'red' : 'other';
    tally[p.name] = tally[p.name] || {};
    tally[p.name][key] = (tally[p.name][key] || 0) + 1;
  }
  /* Pointing the nose at -z is a REFLECTION, and a reflection reverses the
     winding of every triangle. Flipping the normals alone leaves the faces
     culled the wrong way round, so from above you see the inside of the
     aeroplane, lit from within, and it renders nearly black. */
  if (flip < 0) for (let t = 0; t < p.idx.length; t += 3)
    g.idx.push(base + p.idx[t], base + p.idx[t+2], base + p.idx[t+1]);
  else for (const i of p.idx) g.idx.push(base + i);
}
let bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
for (const k in groups) for (let i = 0; i < groups[k].pos.length; i += 3)
  for (let c = 0; c < 3; c++) {
    if (groups[k].pos[i+c] < bb[c]) bb[c] = groups[k].pos[i+c];
    if (groups[k].pos[i+c] > bb[3+c]) bb[3+c] = groups[k].pos[i+c];
  }
const ext = [bb[3]-bb[0], bb[4]-bb[1], bb[5]-bb[2]];
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out = { id: ID, span: SPAN, bbox: bb.map(v => +v.toFixed(4)), groups: {} };
let bytes = 0, tris = 0, verts = 0;
for (const k in groups) {
  const g = groups[k], n = g.pos.length / 3;
  const P = new Uint16Array(n * 3), N = new Int8Array(n * 3), C = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const c = i % 3;
    P[i] = Math.max(0, Math.min(65535, Math.round((g.pos[i] - bb[c]) / (ext[c] || 1) * 65535)));
    N[i] = Math.max(-127, Math.min(127, Math.round(g.nrm[i] * 127)));
    C[i] = g.col[i];
  }
  const I = n > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
  out.groups[k] = { n: n, wide: n > 65535, p: b64(P), q: b64(N), c: b64(C), i: b64(I) };
  bytes += P.byteLength + N.byteLength + C.byteLength + I.byteLength;
  tris += g.idx.length / 3; verts += n;
}
for (const n in tally) if (tally[n].white || tally[n].blue)
  console.log('  livery on ' + n + ': ' + JSON.stringify(tally[n]));

/* Where a roundel actually sits: on the upper skin, half way out along the
   wing. Found by sampling the skin itself — take every painted vertex in a
   narrow spanwise strip, use the middle of its chord and the top of its
   section. Splitting by part name did not work, because this model keeps the
   wing inside the fuselage mesh and only breaks out the moving surfaces. */
const skin = [];
for (const p of kept) if (p.role === 'paint')
  for (let i = 0; i < p.pos.length; i += 3) skin.push(place(p.pos[i], p.pos[i+1], p.pos[i+2]));
out.roundel = [-1, 1].map(function(sg){
  /* Far enough out that the strip is wing and nothing else. At half span it
     also caught the tip of the tailplane, and one vertex three metres aft
     drags the chord midpoint with it. */
  const at = sg*0.62*SPAN/2;
  const strip = skin.filter(q => Math.abs(q[0] - at) < 0.22);
  if (strip.length < 20) return null;
  let z0 = 1e9, z1 = -1e9;
  for (const q of strip) { if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2]; }
  const zc = (z0 + z1)/2;
  let top = -1e9;
  for (const q of strip) if (Math.abs(q[2] - zc) < (z1 - z0)*0.35 && q[1] > top) top = q[1];
  return [ +at.toFixed(3), +(top + 0.02).toFixed(3), +zc.toFixed(3) ];
}).filter(Boolean);
console.log('roundels at ' + out.roundel.map(r => '(' + r.join(', ') + ')').join(' and '));

const js = 'TF_PLANE(' + JSON.stringify(out) + ');\n';
const file = path.join(__dirname, ID + '.js');
fs.writeFileSync(file, js);
console.log('kept:  ' + verts.toLocaleString() + ' vertices, ' + Math.round(tris).toLocaleString() +
  ' triangles in ' + Object.keys(groups).length + ' groups');
console.log('size:  ' + Math.round(bytes / 1024) + ' KB packed -> ' + Math.round(js.length / 1024) +
  ' KB of javascript');
console.log('wrote: ' + file);
