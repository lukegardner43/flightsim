#!/usr/bin/env node
/* The sim is one file you can open from disk, so it cannot fetch these
   profiles at runtime — a file:// page is not allowed to read its neighbours.
   The JSON files here are the source of truth; this script copies them into
   index.html between the markers. Run it after editing any profile:
       node ai/embed.js            (writes)
       node ai/embed.js --check    (fails if index.html is out of date)
*/
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const HTML = path.join(root, 'index.html');
const OPEN = '/* AI-PROFILES-START */', CLOSE = '/* AI-PROFILES-END */';

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.json')).sort();
const profiles = files.map(f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
for (const p of profiles) {
  for (const k of ['id', 'postcode', 'matches', 'place', 'stock', 'type', 'storeys', 'wall', 'roofShape', 'roofMat'])
    if (p[k] === undefined) throw new Error(p.id + ': missing "' + k + '"');
}
const block = OPEN + '\nvar AI_PROFILES = ' + JSON.stringify(profiles, null, 1) + ';\n' + CLOSE;

const html = fs.readFileSync(HTML, 'utf8');
const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
if (a < 0 || b < 0) throw new Error('markers not found in index.html');
const next = html.slice(0, a) + block + html.slice(b + CLOSE.length);

if (process.argv.includes('--check')) {
  if (next !== html) { console.error('index.html is out of date — run: node ai/embed.js'); process.exit(1); }
  console.log('embedded profiles are in sync (' + files.join(', ') + ')');
} else {
  fs.writeFileSync(HTML, next);
  console.log('embedded ' + files.length + ' profile(s): ' + files.join(', '));
}
