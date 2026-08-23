/* Is the landmark model the ONLY thing standing on its footprint?

     node packs/test/overlaptest.js

   gatetest answers "does a model find its building", and it stubs
   OpenStreetMap as empty — "OSM has nothing; the pack carries it". So the
   case where OSM DOES have the building has never been exercised, and that
   is the common one: OpenStreetMap usually has Polesden Lacey's house, just
   without the name on it.

   What happens then is the bug this test is for. The unnamed OSM building is
   drawn first, with a lidar height on it. The pack footprint underneath is
   recognised as a duplicate and set aside. Later the model claims that set-
   aside footprint — claimPackFootprints exists precisely so a model is not
   lost to a missing name — and draws its parts. The rule that removes an
   outline when modelled parts land inside it runs per batch, and by then the
   OSM outline is in a batch that was baked minutes ago. Two buildings, one
   inside the other.

   Polesden is a COURTYARD, which is what makes it testable: fire a ray
   straight down through the middle and a correct world has nothing there but
   grass. A box drawn across the whole footprint puts a roof in the way. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
/* three.js normally comes off a CDN, which is where the browser gets it and
   what CI exercises. Offline, a copy beside this test is used, and failing
   that the devDependency — so `npm i` is all it takes to run these on a
   machine with no network, instead of the manual download the skip message
   used to ask for. */
const THREE_JS = (function(){
  for (const f of [path.join(__dirname, 'three.min.js'),
                   path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js')])
    { try { if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8'); } catch (e) {} }
  return null;
})();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const LAT = 51.28668, LON = -0.384959;              /* KT23 3HP */
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

  const r = await page.evaluate(([lat, lon]) => {
    const s = window.__sim; if (!s) return null;
    const w = s.world(lat, lon);
    const ground = s.terrainY ? s.terrainY(w.x, w.z) : 0;
    /* straight down the middle of the courtyard, from well above the ridge */
    const ray = new THREE.Raycaster(new THREE.Vector3(w.x, ground + 120, w.z),
                                    new THREE.Vector3(0, -1, 0), 0, 400);
    const hits = ray.intersectObject(s.scene(), true)
      .filter(h => h.object && h.object.visible)
      .map(h => ({ y: +(h.point.y - ground).toFixed(1), name: h.object.name || h.object.type }));
    return { hits: hits, models: s.models(), pack: s.pack() };
  }, POL);
  await browser.close();
  if (!r) { console.log('FAIL  the sim never came up'); process.exit(1); }

  console.log('Polesden Lacey: model ' +
    (r.models.matched.some(n => /polesden/i.test(n)) ? 'placed' : 'NOT placed') +
    (r.models.fromPack.some(n => /polesden/i.test(n)) ? ', on a pack footprint' : '') +
    ';  pack ' + r.pack.drawn + ' drawn, ' + r.pack.dup + ' duplicates set aside');
  console.log('  straight down through the courtyard, ' + r.hits.length + ' surface(s):');
  for (const h of r.hits) console.log('    ' + h.y.toFixed(1).padStart(6) + ' m above ground   ' + h.name);

  /* Anything solid well above the ground in the middle of a courtyard is a
     box that should not be there. Below a metre is terrain. */
  const roofs = r.hits.filter(h => h.y > 1.5);
  const ok = roofs.length === 0;
  console.log('\n' + (ok ? 'PASS  nothing is drawn over the courtyard'
                         : 'FAIL  ' + roofs.length + ' surface(s) over the courtyard — an outline is drawn under the model'));
  process.exit(ok ? 0 : 1);
})();
