/* Does the thumbstick do what a thumb needs?

     node packs/test/sticktest.js

   "The iPhone controls are super clunky" is not a thing you can chase on a
   laptop by feel, but every part of why is measurable. The stick was linear
   from a dead centre — no dead zone, so a thumb resting slightly off middle
   flew the aeroplane — and saturated 46 px out on a 126 px ring, so a third
   of the throw was full deflection and the knob overshot its own ring.

   This drives the real element with real pointer events and reads back what
   the flight model is being handed. No world is built: the controls are
   wired at load, which is the whole point of testing them here rather than
   after a two-minute terrain build. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
/* index.html builds its flight state at top level with THREE.Vector3, so
   without three.js nothing after that line runs and there is no __sim to ask. */
const THREE_JS = (function(){
  for (const f of [path.join(__dirname, 'three.min.js'),
                   path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js')])
    { try { if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8'); } catch (e) {} }
  return null;
})();

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });   /* an iPhone */
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (/three(\.min)?\.js/.test(u))
      return THREE_JS ? r.fulfill({ status:200, contentType:'application/javascript', body:THREE_JS })
                      : r.continue();
    return r.fulfill({ status: 200, body: '' });
  });
  await page.goto('file://' + ROOT + '/index.html');
  await page.waitForTimeout(400);
  if (!(await page.evaluate(() => !!window.__sim))) {
    await browser.close();
    console.log('skipped: three.js did not load, so index.html never reached __sim');
    process.exit(0);
  }
  await page.evaluate(() => document.getElementById('ctl').classList.add('on'));
  await page.waitForTimeout(150);

  const box = await page.evaluate(() => {
    const r = document.getElementById('stick').getBoundingClientRect();
    const k = document.getElementById('knob');
    return { cx:r.left + r.width/2, cy:r.top + r.height/2,
             rad: r.width/2 - k.offsetWidth/2, w:r.width, kw:k.offsetWidth };
  });
  const read = () => page.evaluate(() => window.__sim.controls());
  /* Events go straight to the element rather than through the mouse, because
     the briefing card is still over the controls at this point and a real
     click would land on that instead. The handlers are what is under test. */
  async function push(fx, fy) {                       /* fraction of full throw */
    return page.evaluate(([fx, fy]) => {
      const el = document.getElementById('stick'), k = document.getElementById('knob');
      const r = el.getBoundingClientRect();
      const rad = r.width/2 - k.offsetWidth/2;
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, {
        pointerId: 7, clientX: x, clientY: y, bubbles: true }));
      ev('pointerdown', cx, cy);
      ev('pointermove', cx + fx*rad, cy + fy*rad);
      const v = window.__sim.controls();
      v.x = v.x; v.y = v.y;
      return v;
    }, [fx, fy]);
  }
  const release = () => page.evaluate(() => {
    const el = document.getElementById('stick'), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7,
      clientX: r.left + r.width/2, clientY: r.top + r.height/2, bubbles: true }));
    return window.__sim.controls();
  });

  let pass = 0, n = 0;
  const check = (name, ok, got) => { n++; if (ok) pass++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(46) + got); };

  console.log('stick ' + box.w + ' px, knob ' + box.kw + ' px, so ' +
              box.rad.toFixed(0) + ' px of throw\n');

  const centre = await push(0, 0);  await release();
  check('a thumb at dead centre asks for nothing', centre.x === 0 && centre.y === 0,
        'x ' + centre.x.toFixed(3) + '  y ' + centre.y.toFixed(3));

  const nudge = await push(0.08, 0);  await release();     /* inside the dead zone */
  check('a resting thumb is not an input', nudge.x === 0,
        'x ' + nudge.x.toFixed(3) + ' at 8% of throw, dead zone ' + (centre.dead*100).toFixed(0) + '%');

  const half = await push(0.5, 0);  await release();
  const want = Math.pow((0.5 - centre.dead) / (1 - centre.dead), 2);
  check('half throw is gentle, not half authority', Math.abs(half.x - want) < 0.03,
        'x ' + half.x.toFixed(3) + ' (a square law wants ' + want.toFixed(3) + ')');

  const full = await push(1.4, 0);                    /* past the edge, clamped */
  check('the edge is full authority', Math.abs(full.x - 1) < 0.02,
        'x ' + full.x.toFixed(3));

  /* while it is still held at full deflection */
  const knobIn = await page.evaluate(() => {
    const r = document.getElementById('stick').getBoundingClientRect();
    const k = document.getElementById('knob').getBoundingClientRect();
    return k.left >= r.left - 0.5 && k.right <= r.right + 0.5;
  });
  check('the knob stays inside its ring', knobIn, knobIn ? 'yes' : 'it overhangs');
  const rel = await release();
  check('let go and it centres', rel.x === 0 && rel.y === 0 && !rel.active,
        'x ' + rel.x.toFixed(3) + '  active ' + rel.active);

  /* The throttle listened only for pointerup. iOS takes a pointer away with
     pointercancel — a notification, an edge swipe, a call — and after that
     every later touch carried a different id and was ignored for the rest of
     the flight. */
  const thr = await page.evaluate(() => {
    const pad = document.getElementById('thrpad'), r = pad.getBoundingClientRect();
    const ev = (t, id, y) => pad.dispatchEvent(new PointerEvent(t, {
      pointerId:id, clientX:r.left + r.width/2, clientY:y, bubbles:true }));
    ev('pointerdown', 11, r.top + r.height*0.5);
    const mid = window.__sim.controls().throttle;
    ev('pointercancel', 11, r.top + r.height*0.5);      /* iOS takes the finger */
    ev('pointerdown', 12, r.top + r.height*0.1);        /* a new finger, near the top */
    const after = window.__sim.controls().throttle;
    ev('pointerup', 12, r.top + r.height*0.1);
    return { mid: mid, after: after };
  });
  check('the throttle survives a cancelled pointer', thr.after > 0.8,
        'set to ' + thr.mid.toFixed(2) + ', then after a cancel ' + thr.after.toFixed(2));

  await browser.close();
  console.log('\n' + pass + '/' + n + ' passed');
  process.exit(pass === n ? 0 : 1);
})();
