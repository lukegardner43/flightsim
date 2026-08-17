#!/usr/bin/env node
/* Landmark models live in models/*.json. This copies them into models/<id>.js
   (a script the sim can load from disk, where fetch is not allowed) and
   registers the filenames in index.html.

     node models/embed.js            writes
     node models/embed.js --check    fails if index.html is out of date
*/
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const HTML = path.join(root, 'index.html');
const OPEN = '/* MODELS-START */', CLOSE = '/* MODELS-END */';

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.json')).sort();
const out = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  if (!Array.isArray(d.models)) throw new Error(f + ': no models array');
  for (const m of d.models) {
    for (const k of ['id', 'name', 'match', 'parts'])
      if (m[k] === undefined) throw new Error(f + ': model "' + (m.name || '?') + '" is missing ' + k);
    if (!m.parts.length) throw new Error(f + ': model "' + m.name + '" has no parts');
    if (!m.parts.some(p => p.on === 'footprint'))
      throw new Error(f + ': model "' + m.name + '" has no on:"footprint" part, so the plain ' +
                      'outline would survive underneath the added volumes');
  }
  const js = path.basename(f, '.json') + '.js';
  fs.writeFileSync(path.join(__dirname, js), 'TF_MODELS(' + JSON.stringify(d) + ');\n');
  out.push({ file: js, n: d.models.length });
}

const html = fs.readFileSync(HTML, 'utf8');
const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
if (a < 0 || b < 0) throw new Error('markers not found in index.html');
const block = OPEN + '\nvar MODELS = [], MODEL_FILES = ' +
  JSON.stringify(out.map(o => o.file)) + ';\n' + CLOSE;
const next = html.slice(0, a) + block + html.slice(b + CLOSE.length);

if (process.argv.includes('--check')) {
  if (next !== html) { console.error('index.html is out of date — run: node models/embed.js'); process.exit(1); }
  console.log('models are in sync (' + out.map(o => o.file).join(', ') + ')');
} else {
  fs.writeFileSync(HTML, next);
  console.log('embedded: ' + out.map(o => o.file + ' (' + o.n + ' models)').join(', '));
}
