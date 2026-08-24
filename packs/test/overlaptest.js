/* Is the landmark model the ONLY thing standing on its footprint, and does
   the surveyed massing reach it?

     node packs/test/overlaptest.js

   gatetest answers "does a model find its building", and it stubs
   OpenStreetMap as empty — "OSM has nothing; the pack carries it". So the
   case where OSM DOES have the building has never been exercised there, and
   it is the common one: OpenStreetMap usually has Polesden Lacey's house,
   just without the name on it.

   What happens then is the first bug this test is for. The unnamed OSM
   building is drawn first, with a lidar height on it. The pack footprint
   underneath is recognised as a duplicate and set aside. Later the model
   claims that set-aside footprint — claimPackFootprints exists precisely so
   a model is not lost to a missing name — and draws its parts. The rule that
   removes an outline when modelled parts land inside it runs per batch, and
   by then the OSM outline is in a batch that was baked minutes ago. Two
   buildings, one inside the other.

   Polesden has a COURTYARD, which is what makes that testable: a box drawn
   across the whole footprint roofs it over. The test does not assume WHERE
   the courtyard is — the plan-based rebuild moved it, and a test that has to
   be re-aimed every time the model changes is a test that will be switched
   off. It samples everything more than 5 m inside the surveyed outline and
   asks how much of it is open to the sky.

   The second thing it checks is that the surveyed massing reaches the
   model's FABRIC and not merely the chimneys standing on it — lowering a
   stack while the range under it stays put sinks the stack into its own
   roof, which is exactly what the first version of that code did. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
/* three.js normally comes off a CDN, which is what CI exercises. Offline, a
   copy beside this test is used, and failing that the devDependency — so
   `npm i` is all it takes to run this with no network. */
const THREE_JS = (function(){
  for (const f of [path.join(__dirname, 'three.min.js'),
                   path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js')])
    { try { if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8'); } catch (e) {} }
  return null;
})();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const LAT = 51.28668, LON = -0.384959;               /* KT23 3HP */
const POL = [51.257612, -0.373547];                  /* Polesden Lacey */

/* the pack's own outline for the house, served back as an unnamed OSM
   building — which is what OpenStreetMap actually holds there */
const rings = [];
global.TF_PACK = d => {
  const q = d.q || 1e6;
  for (const a of d.buildings) {
    const pts = []; let lat = a[0], lon = a[1];
    pts.push([lat/q, lon/q]);
    for (let i = 2; i < a.length; i += 2) { lat += a[i]; lon += a[i+1]; pts.push([lat/q, lon/q]); }
    rings.push(pts);
  }
};
require(path.join(ROOT, 'packs', 'kt233hp.js'));
const inRing = (pts, lat, lon) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][0], xi = pts[i][1], yj = pts[j][0], xj = pts[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi) + xi) hit = !hit;
  }
  return hit;
};
const house = rings.filter(p => inRing(p, POL[0], POL[1]))
                   .sort((a, b) => b.length - a.length)[0];
if (!house) { console.log('FAIL  no pack footprint under Polesden to build the case from'); process.exit(1); }
const OSM = { version: 0.6, elements: [{
  type: 'way', id: 900001,
  tags: { building: 'yes' },                        /* NO name — that is the point */
  geometry: house.map(p => ({ lat: p[0], lon: p[1] }))
}]};

(async () => {
  const browser = await chromium.launch(launchOpts({
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] }));
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (/three(\.min)?\.js/.test(url))
      return THREE_JS ? route.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS })
                      : route.continue();
    if (/interpreter/.test(url)) {
      const body = decodeURIComponent((route.request().postData() || '').replace(/^data=/, ''));
      if (/out count/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ elements: [{ type:'count', id:0, tags:{ ways:'1', total:'1' } }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OSM) });
    }
    if (/postcodes\.io/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status:200, result:{ postcode:'KT23 3HP', latitude:LAT, longitude:LON } }) });
    if (/\.png|tile|arcgisonline|terrarium/.test(url))
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 200, body: '' });
  });
  await page.goto('file://' + ROOT + '/index.html');
  await page.waitForTimeout(700);
  if (!(await page.evaluate(() => !!window.THREE))) {
    await browser.close();
    console.log('skipped: three.js did not load — no copy at packs/test/three.min.js');
    process.exit(0);
  }
  await page.fill('#q', 'KT23 3HP');
  await page.click('#find');
  await page.waitForTimeout(600);
  await page.click('#go');
  await page.waitForTimeout(38000);              /* the pack merge is on a 30 s timer */

  const r = await page.evaluate(([ringLL]) => {
    const s = window.__sim, scene = s.scene();
    const R = ringLL.map(p => { const w = s.world(p[0], p[1]); return { x:w.x, z:w.z }; });
    const inR = (x,z) => { let h = false;
      for (let i = 0, j = R.length-1; i < R.length; j = i++)
        if ((R[i].z > z) !== (R[j].z > z) && x < (R[j].x-R[i].x)*(z-R[i].z)/(R[j].z-R[i].z)+R[i].x) h = !h;
      return h; };
    /* how far inside the outline a point is, so a courtyard can be told from
       the ragged edge of a twelve-cornered survey */
    const inset = (x,z) => { let d = 1e9;
      for (let i = 0, j = R.length-1; i < R.length; j = i++) {
        const ax=R[j].x, az=R[j].z, dx=R[i].x-ax, dz=R[i].z-az, L=dx*dx+dz*dz;
        let t = L ? ((x-ax)*dx + (z-az)*dz)/L : 0; t = Math.max(0, Math.min(1, t));
        d = Math.min(d, Math.hypot(x-(ax+t*dx), z-(az+t*dz)));
      }
      return d; };
    let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
    for (const p of R) { x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); z0=Math.min(z0,p.z); z1=Math.max(z1,p.z); }
    const down = new THREE.Vector3(0,-1,0);
    const roof = (x,z) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 260, z), down, 0, 600);
      const h = ray.intersectObject(scene, true).filter(o => o.object && o.object.visible);
      return h.length ? h[0].point.y : null;
    };
    let deep = 0, open = 0;
    for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) {
      if (!inR(x,z) || inset(x,z) < 5) continue;
      deep++;
      const y = roof(x,z);
      if (!(y != null && y > 1.5)) open++;
    }
    return { deep, open, models: s.models() };
  }, [house]);
  await browser.close();

  console.log('Polesden Lacey: model ' +
    (r.models.matched.some(n => /polesden/i.test(n)) ? 'placed' : 'NOT placed'));
  const massed = (r.models.massed || []).filter(l => /polesden/i.test(l));
  for (const l of massed) console.log('  surveyed massing: ' + l.replace(/^Polesden Lacey: /, ''));
  console.log('  ' + r.deep + ' m2 of the footprint is more than 5 m inside it, ' +
              r.open + ' of that open to the sky');

  let pass = 0;
  /* An outline drawn under the model roofs the courtyard over. The plan puts
     one there and the model builds one, so some of the deep interior must be
     open — and if the box comes back, none of it is. */
  const clear = r.deep > 0 && r.open > r.deep * 0.15;
  if (clear) pass++;
  console.log('\n' + (clear ? 'PASS  the courtyard is open to the sky'
                            : 'FAIL  the interior is roofed over — an outline is drawn under the model'));
  /* and the surveyed step has to reach the FABRIC, not just the chimneys
     standing on it. Matching on the word "range" was matching my own note
     text, which the plan-based rebuild quite properly stopped using. */
  const fabric = massed.filter(l => !/stack|dormer|chimney|column|porch|cupola|lantern|entablature/i.test(l));
  if (fabric.length) pass++;
  console.log((fabric.length ? 'PASS  the surveyed step reaches the fabric'
                             : 'FAIL  only things standing on the roof were lowered') +
              '  (' + massed.length + ' lowered, ' + fabric.length + ' of them fabric)');
  console.log('\n' + pass + '/2 passed');
  process.exit(pass === 2 ? 0 : 1);
})();
