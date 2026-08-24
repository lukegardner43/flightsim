/* A building whose plan shrinks as it rises.

   The Shard was 310 m of rectangular slab: OSM gives its height and its
   outline and nothing anywhere said that the outline stops being true forty
   metres up. This serves a Shard-shaped way to the sim, lets the model stand
   on it, and then measures the thing that was wrong — the width of the
   geometry at a series of heights. A straight extrusion is the same width all
   the way up, which is exactly the failure. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const THREE_JS = (function(){
  for (const f of [path.join(__dirname, 'three.min.js'),
                   path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js')])
    { try { if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8'); } catch (e) {} }
  return null;
})();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const LAT = 51.5045, LON = -0.0865;

/* a square 60 m on a side about the tower's own coordinate */
const HALF = 30, mLat = 110540, mLon = 111320 * Math.cos(LAT*Math.PI/180);
const dLat = HALF/mLat, dLon = HALF/mLon;
const RING = [[LAT-dLat,LON-dLon],[LAT-dLat,LON+dLon],[LAT+dLat,LON+dLon],
              [LAT+dLat,LON-dLon],[LAT-dLat,LON-dLon]].map(p => ({lat:p[0], lon:p[1]}));
const SHARD = { type:'way', id:1, geometry:RING,
                tags:{ building:'commercial', name:'The Shard', height:'309.6',
                       'building:levels':'72' } };
/* The tower's coordinate is inside the station block as well — that is the
   whole reason the lidar cannot see it — so a model anchored on a point has
   to be able to say how big the thing it describes is. Run with --station
   the tower is absent and only the block is served: nothing should attach to
   it, and certainly not a 310 m spire. */
const BIG = 200, bLat = BIG/mLat, bLon = BIG/mLon;
const STATION = { type:'way', id:2,
  geometry:[[LAT-bLat,LON-bLon],[LAT-bLat,LON+bLon],[LAT+bLat,LON+bLon],
            [LAT+bLat,LON-bLon],[LAT-bLat,LON-bLon]].map(p=>({lat:p[0],lon:p[1]})),
  tags:{ building:'train_station' } };
let STATION_ONLY = false;

async function run() {
  const browser = await chromium.launch(launchOpts({
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] }));
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  await page.route('**/*', async route => {
    const url = route.request().url();
    /* Southwark is dense, and the OS pack puts the station block and half a
       dozen neighbours inside fifty metres of the tower — at fifty and sixty
       metres up, which is exactly where the taper wants measuring. So the
       packs come back empty and the Shard is the only building for a mile. */
    if (/packs\/[a-z0-9-]+\.js$/.test(url))
      return route.fulfill({ status:200, contentType:'application/javascript',
        body: 'TF_PACK({"id":"empty","q":1000000,"bbox":[51.4,-0.2,51.6,0.0],"buildings":[]});' });
    if (url.startsWith('file://')) return route.continue();
    if (/three(\.min)?\.js/.test(url))
      return THREE_JS ? route.fulfill({ status:200, contentType:'application/javascript', body:THREE_JS })
                      : route.continue();
    if (/interpreter/.test(url)) {
      const body = decodeURIComponent((route.request().postData() || '').replace(/^data=/, ''));
      if (/out count/.test(body)) return route.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify({ elements:[{ type:'count', id:0, tags:{ ways:'400', total:'400' } }] }) });
      /* only the buildings query gets the tower; the rest get nothing */
      const wants = /"building"/.test(body) || /\[building\]/.test(body) || /building/.test(body);
      return route.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify({ version:0.6,
          elements: wants ? (STATION_ONLY ? [STATION] : [SHARD]) : [] }) });
    }
    if (/postcodes\.io/.test(url)) return route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ status:200, result:{ postcode:'SE1 9SG', latitude:LAT, longitude:LON } }) });
    if (/\.png|tile|arcgisonline|terrarium/.test(url))
      return route.fulfill({ status:200, contentType:'image/png', body:PNG });
    return route.fulfill({ status:200, body:'' });
  });
  await page.goto('file://' + ROOT + '/index.html');
  await page.waitForTimeout(700);
  if (!(await page.evaluate(() => !!window.THREE))) {
    await browser.close();
    console.log('skipped: three.js did not load — no copy at packs/test/three.min.js');
    process.exit(0);
  }
  await page.fill('#q', 'SE1 9SG');
  await page.click('#find');
  await page.waitForTimeout(600);
  await page.click('#go');
  await page.waitForTimeout(20000);

  const r = await page.evaluate(() => {
    const s = window.__sim; if (!s) return null;
    const c = s.world(51.5045, -0.0865);
    const pad = s.terrainY(c.x, c.z);
    /* The widest the geometry gets, in slabs of height, close enough to the
       tower's coordinate to be the tower. 50 m clears the base — a 60 m
       square reaches 42.4 m to its corner. The ground plane is inside it
       too, which is why band 0 is never judged. */
    const band = new Array(32).fill(0), v = new THREE.Vector3();
    s.scene().traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      o.updateMatrixWorld();
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
        const dx = v.x - c.x, dz = v.z - c.z, d = Math.sqrt(dx*dx + dz*dz);
        if (d > 50) continue;
        const k = Math.floor((v.y - pad) / 10);
        if (k >= 0 && k < band.length && d > band[k]) band[k] = d;
      }
    });
    return { pad: pad, band: band, models: s.models() };
  });
  await browser.close();
  if (!r) { console.log('FAIL  the sim never came up'); return 1; }

  console.log('models loaded ' + r.models.loaded + ', matched ' +
              (r.models.matched.join(', ') || 'nothing'));
  if (r.models.missed.length) console.log('  missed: ' + r.models.missed.slice(0,3).join('; '));
  console.log('\n height   half-width');
  /* The shell is lofted in bands about thirteen metres apart, so a ten metre
     slab can fall between two rings and hold no vertices at all. Read the
     nearest slab that has some rather than calling that zero. */
  const at = m => {
    const k0 = Math.floor(m/10);
    for (let s2 = 0; s2 < 4; s2++)
      for (const k of [k0 - s2, k0 + s2]) if (k >= 0 && k < r.band.length && r.band[k]) return r.band[k];
    return 0;
  };
  for (let k = 0; k < r.band.length; k++) {
    if (!r.band[k]) continue;
    console.log(String(k*10).padStart(5) + ' m ' + r.band[k].toFixed(1).padStart(9) + '  ' +
                '#'.repeat(Math.round(r.band[k]/1.5)));
  }

  let fail = 0;
  function check(name, ok, saw) {
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + saw);
    if (!ok) fail++;
  }
  if (STATION_ONLY) {
    const top = r.band.reduce((t, w, k) => w ? k : t, -1);
    check('a 160,000 m2 block does not become the Shard',
          r.models.matched.indexOf('The Shard') < 0,
          'matched ' + (r.models.matched.join(', ') || 'nothing'));
    check('and nothing near it reaches three hundred metres', top < 12,
          'highest geometry in the ' + (top*10) + '-' + (top*10+10) + ' m band');
    return fail;
  }
  const top = r.band.reduce((t, w, k) => w ? k : t, -1);
  check('it reaches the architectural height', top >= 30,
        'highest geometry in the ' + (top*10) + '-' + (top*10+10) + ' m band, want 300+');
  const low = at(10), mid = at(200), high = at(280);
  check('the plan is narrower than the base at 200 m',
        low > 0 && mid > 0 && mid < low * 0.55,
        '10 m ' + low.toFixed(1) + ' -> 200 m ' + mid.toFixed(1));
  check('and narrower again near the top',
        high > 0 && high < mid * 0.6,
        '200 m ' + mid.toFixed(1) + ' -> 280 m ' + high.toFixed(1));
  /* the failure this test exists for: a straight extrusion */
  let shrinking = true, prev = 1e9;
  for (let k = 3; k <= top; k++) if (r.band[k]) { if (r.band[k] > prev + 0.5) shrinking = false; prev = r.band[k]; }
  check('it never gets wider on the way up', shrinking, shrinking ? 'monotone' : 'a band is wider than the one below it');
  check('the base still stands on the mapped outline', low > 36 && low < 44,
        'corner reach near the bottom is ' + low.toFixed(1) + ' m, the square way reaches 42.4');

  return fail;
}

/* Two runs, because the two halves are different failures. With the tower
   served, does it taper? With only the block it stands inside served, does
   the sim refuse it? */
(async () => {
  let fail = 0;
  for (const st of [false, true]) {
    STATION_ONLY = st;
    console.log('\n=== ' + (st ? 'the station block on its own' : 'the tower') + ' ===');
    fail += await run();
  }
  console.log('\n' + (fail ? fail + ' failed' : 'all passed'));
  process.exit(fail ? 1 : 0);
})();
