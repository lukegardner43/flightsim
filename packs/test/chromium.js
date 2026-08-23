/* Which chromium, and is there one at all?

     const { chromium, launchOpts } = require('./chromium.js');

   Both browser tests hard-coded executablePath:'/opt/pw-browsers/chromium',
   which is the sandbox this was written in and not a GitHub runner, where
   playwright installs its own and that path does not exist. So neither test
   could run in CI — and CI is the only place with the network to fetch
   three.js, which is the other reason gatetest kept skipping.

   Use the pre-installed browser when it is there, and let playwright find
   its own when it is not. */
'use strict';
const fs = require('fs');
const PREINSTALLED = '/opt/pw-browsers/chromium';

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { /* reported by need() */ }

const launchOpts = (extra) => Object.assign(
  fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {},
  { args: ['--no-sandbox'] }, extra || {});

/* Call at the top of a browser test. Returns false and says why when there is
   no playwright, so the test can exit 0 rather than fail for want of a
   dependency — but CI installs it, so a skip there is a bug and not a shrug. */
function need() {
  if (chromium) return true;
  console.log('skipped: this one needs playwright, which the other tests here do not.');
  console.log('  npm i && npx playwright install chromium');
  return false;
}
module.exports = { chromium, launchOpts, need };
