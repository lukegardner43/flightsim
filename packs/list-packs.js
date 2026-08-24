#!/usr/bin/env node
/* Rebuild index.html's PACKS list from whatever packs are actually on disk.

     node packs/list-packs.js

   make-pack.js rewrites that list as a side effect of building a pack, which
   is right when one machine builds one place. It is wrong the moment several
   runners build different squares at once: they would each rewrite the same
   block of index.html and every one of them would conflict with the others.

   So the England build does not let them. Each runner produces pack files
   and nothing else, they come back as artifacts, and this rebuilds the list
   once from the files themselves. It is also the repair tool for a list that
   has drifted from the directory — which is how a phantom "tq15" entry once
   ended up in it, pointing at a test fixture that no longer existed.

   A pack is a file that starts with TF_PACK(. Everything else in packs/ is a
   tool, and requiring a tool RUNS it.

   Which is why this file has a hyphen in its name. Called relist.js it was
   picked up by show-boxes.js's loader, which matched packs by filename shape
   — two letters and digits, no hyphen — and so required this tool and ran
   it, rewriting index.html on the way past. Filename shape is not a type;
   every loader reads the first eight bytes now. The hyphen is the belt to
   that brace. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const OPEN = '/* PACKS-START */', CLOSE = '/* PACKS-END */';

function isPack(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(8);
    return fs.readSync(fd, b, 0, 8, 0) === 8 && b.toString('utf8') === 'TF_PACK(';
  } catch (e) { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {} }
}

const manifest = [];
let footprints = 0, measured = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'packs')).sort()) {
  if (!f.endsWith('.js')) continue;
  const full = path.join(ROOT, 'packs', f);
  if (!isPack(full)) continue;
  let d = null;
  global.TF_PACK = x => { d = x; };
  try { delete require.cache[require.resolve(full)]; require(full); } catch (e) { d = null; }
  if (!d || !d.buildings) { console.log('  skipped ' + f + ' — not readable as a pack'); continue; }
  const n = d.buildings.length;
  let m = 0;
  for (const v of (d.heights || [])) if (v) m++;
  footprints += n; measured += m;
  /* the same key order make-pack.js writes, so running this on a list that is
     already right changes nothing at all */
  const e = { id: d.id };
  if (d.tile) e.tile = d.tile;
  if (d.name) e.name = d.name;
  e.file = f; e.bbox = d.bbox; e.n = n;
  manifest.push(e);
}
if (!manifest.length) { console.error('no packs found in packs/ — refusing to empty the list'); process.exit(1); }

const html = fs.readFileSync(HTML, 'utf8');
const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
if (a < 0 || b < 0) { console.error('PACKS markers not found in index.html'); process.exit(1); }
manifest.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
const block = OPEN + '\nvar PACKS = ' + JSON.stringify(manifest) + ';\n' + CLOSE;
fs.writeFileSync(HTML, html.slice(0, a) + block + html.slice(b + CLOSE.length));
console.log('PACKS: ' + manifest.length + ' packs, ' + footprints.toLocaleString() +
            ' footprints, ' + measured.toLocaleString() + ' of them measured (' +
            Math.round(100 * measured / Math.max(1, footprints)) + '%)');
