/* A landmark model that arrives late must still find its building.

   modelFor is asked once, as each building is made. Before the gate, a model
   still in flight was simply absent and the landmark came out as an ordinary
   extruded box — silently, with nothing in the log to say so. This holds the
   models back by a chosen delay and checks they still land. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
/* three.js normally comes off a CDN. If a copy is sitting next to this test
   it is used, so the test runs with no network at all; otherwise the request
   goes out as it would in a browser. */
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
const DELAY = +(process.argv[2] || 3000);
const LAT = 51.28668, LON = -0.384959;

(async () => {
  const browser = await chromium.launch(launchOpts({
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] }));
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  let modelsSentAt = 0;
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (/models\/.*\.js/.test(url)) {                    // the thing under test
      await new Promise(r => setTimeout(r, DELAY));
      modelsSentAt = Date.now();
      return route.fulfill({ status: 200, contentType: 'application/javascript',
        body: fs.readFileSync(ROOT + '/models/kt23-3hp.js', 'utf8') });
    }
    if (url.startsWith('file://')) return route.continue();
    if (/three(\.min)?\.js/.test(url))
      return THREE_JS ? route.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS })
                      : route.continue();
    if (/interpreter/.test(url)) {
      const body = decodeURIComponent((route.request().postData() || '').replace(/^data=/, ''));
      if (/out count/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ elements: [{ type:'count', id:0, tags:{ ways:'400', total:'400' } }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 0.6, elements: [] }) });   // OSM has nothing; the pack carries it
    }
    if (/postcodes\.io/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status:200, result:{ postcode:'KT23 3HP', latitude:LAT, longitude:LON } }) });
    if (/\.png|tile|arcgisonline|terrarium/.test(url))
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 200, body: '' });
  });
  await page.goto('file://' + ROOT + '/index.html');
  await page.waitForTimeout(700);
  /* Without three.js there is no sim to test. Say which of the two ways of
     getting it was missing rather than failing as though the gate were
     broken. */
  if (!(await page.evaluate(() => !!window.THREE))) {
    await browser.close();
    console.log('skipped: three.js did not load — no copy at packs/test/three.min.js');
    console.log('  and the CDN was unreachable. Drop a three.min.js there to run offline.');
    process.exit(0);
  }
  await page.fill('#q', 'KT23 3HP');
  await page.click('#find');
  await page.waitForTimeout(600);
  const t0 = Date.now();
  await page.click('#go');
  await page.waitForTimeout(DELAY + 22000);
  const m = await page.evaluate(() => window.__sim ? window.__sim.models() : null);
  const diag = await page.evaluate(() => { const d=document.getElementById('diagbody'); return d?d.textContent.trim():null; });
  await browser.close();
  if (!m) { console.log('FAIL  the sim never came up'); process.exit(1); }
  console.log('models held back by ' + (DELAY/1000).toFixed(1) + ' s, released at +' +
              ((modelsSentAt - t0)/1000).toFixed(1) + ' s after go');
  console.log('  loaded  ' + m.loaded);
  console.log('  matched ' + m.matched.length + (m.matched.length ? '  ' + m.matched.slice(0,4).join(', ') : ''));
  if (diag) console.log('  diagnostics: ' + diag.replace(/\s+/g,' ').slice(0,120));
  const ok = m.loaded > 0 && m.matched.length > 0;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + '  a late model still finds its building');
  process.exit(ok ? 0 : 1);
})();
