/* The diagnostics panel must still shout about a real exception, and must
   stay silent for a load that is allowed to fail. Both halves, on the real
   handler lifted from index.html. */
const { chromium, launchOpts, need } = require('./chromium.js');
if (!need()) process.exit(0);
const fs = require('fs');
const html = fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'index.html'), 'utf8');
const block = html.slice(html.indexOf('  window.addEventListener("error"'),
                          html.indexOf('  window.addEventListener("unhandledrejection"'));
const page_html = `<body><script>
  var LINES = []; function diag(k, d, fatal){ LINES.push((fatal?'FATAL ':'note ')+k+' — '+d); }
  window.__lines = LINES;
${block}
</script>
<script src="does-not-exist-optional.js" data-optional="1"></script>
<script src="does-not-exist-unexpected.js"></script>
<script>setTimeout(function(){ null.boom; }, 10);</script>
</body>`;
(async () => {
  const b = await chromium.launch(launchOpts());
  const p = await b.newPage();
  await p.route('**/*', r => r.request().url().startsWith('data:') ? r.continue() : r.abort());
  await p.setContent(page_html, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const lines = await p.evaluate(() => window.__lines);
  await b.close();
  const optional  = lines.some(l => /optional/.test(l));
  const unexpected= lines.some(l => /note .*unexpected/.test(l));
  const real      = lines.some(l => /^FATAL Runtime error/.test(l));
  console.log(lines.length ? lines.join('\n') : '(nothing reported)');
  console.log('\n' + (!optional ? 'PASS' : 'FAIL') + '  a load marked optional is silent');
  console.log((unexpected ? 'PASS' : 'FAIL') + '  an unexpected load failure is noted, not fatal');
  console.log((real ? 'PASS' : 'FAIL') + '  a real exception is still fatal');
  process.exit(!optional && unexpected && real ? 0 : 1);
})();
