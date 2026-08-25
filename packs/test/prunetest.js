/* The broom must not sweep up a measurement.

   prune-unmeasured.js deletes files, and this repository has a history of
   quiet destructive faults — a tool loaded as a pack, an unmeasured pack
   overwriting a measured one, heights read from the wrong pack. So the
   thing worth proving is not that it removes footprints; it is that it
   never removes anything measured, never touches a tool, and refuses to
   empty the directory. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const TOOL = path.join(__dirname, '..', 'prune-unmeasured.js');

function pack(dir, name, heights) {
  const d = { id: name.replace('.js',''), q: 1e6, bbox: [50,-2,51,-1],
              buildings: [[50000000,-1000000,10,10,10,-10]] };
  if (heights) d.heights = heights;
  fs.writeFileSync(path.join(dir, name), 'TF_PACK(' + JSON.stringify(d) + ');\n');
}
function run(dir, apply) {
  try {
    return { out: execFileSync(process.execPath,
      [TOOL].concat(apply ? ['--apply'] : []).concat(['--dir', dir]), { encoding: 'utf8' }), code: 0 };
  } catch (e) { return { out: (e.stdout||'') + (e.stderr||''), code: e.status }; }
}
let fail = 0;
function check(name, ok, saw) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(46) + saw);
  if (!ok) fail++;
}

/* ---- a normal directory ---- */
let T = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
pack(T, 'aa11.js', [7654]);            /* measured  */
pack(T, 'aa22.js', null);              /* no heights key at all */
pack(T, 'aa33.js', [0, 0, 0]);         /* an all-zero array is not a measurement */
fs.writeFileSync(path.join(T, 'atool.js'), 'module.exports = 1;\n');

let r = run(T, false);
check('a dry run changes nothing', fs.readdirSync(T).length === 4, fs.readdirSync(T).length + ' files still there');
check('and says what it would take', /would remove 2 /.test(r.out), r.out.split('\n')[0]);

r = run(T, true);
const left = fs.readdirSync(T).sort();
check('the measured pack survives',    left.indexOf('aa11.js') >= 0, left.join(' '));
check('footprints with no heights go', left.indexOf('aa22.js') < 0, 'aa22 gone');
check('an all-zero array goes',        left.indexOf('aa33.js') < 0, 'aa33 gone');
check('a tool is never touched',       left.indexOf('atool.js') >= 0, 'atool.js still there');

/* ---- a directory with nothing measured in it ---- */
const U = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
pack(U, 'bb11.js', null);
pack(U, 'bb22.js', [0]);
r = run(U, true);
check('it refuses to empty the directory', r.code === 1 && fs.readdirSync(U).length === 2,
      'exit ' + r.code + ', ' + fs.readdirSync(U).length + ' files kept');

fs.rmSync(T, {recursive:true, force:true}); fs.rmSync(U, {recursive:true, force:true});
console.log('\n' + (fail ? fail + ' failed' : 'all passed'));
process.exit(fail ? 1 : 0);
