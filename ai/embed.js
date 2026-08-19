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

/* What the renderer will actually accept, read out of index.html rather than
   copied here, so a profile cannot quietly name a material the sim has never
   heard of and fall back to grey. The first draft of the area profiles asked
   for "asbestos" roofs; the sim knows eternit. */
const htmlSrc = fs.readFileSync(HTML, 'utf8');
function keysOf(name) {
  const m = new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\};').exec(htmlSrc);
  if (!m) throw new Error('cannot find ' + name + ' in index.html');
  return new Set([...m[1].matchAll(/(?:^|[,{\s])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map(x => x[1]));
}
const WALL_OK = keysOf('WALL_MAT');
const ROOF_OK = keysOf('ROOF_MAT');
const BOND_OK = keysOf('WALL_BOND');
const WIN_OK = keysOf('WALL_WIN');
const TEXCLS_OK = new Set(['house', 'block', 'shed', 'grand', 'masonry']);
const UNIT_OK = keysOf('ROOF_UNIT');
const ROOFKIND_OK = new Set(['slate', 'tile', 'thatch', 'metal', 'flat']);
const SHAPE_OK = new Set(['hipped', 'gabled', 'pyramidal', 'cone', 'dome', 'onion', 'skillion', 'flat']);
const TYPE_OK = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'apartments',
  'residential', 'commercial', 'retail', 'office', 'industrial', 'warehouse', 'factory', 'barn',
  'shed', 'garage', 'hotel', 'school', 'church']);

function checkList(list, ok, what, where) {
  for (const [v] of list || [])
    if (!ok.has(String(v))) throw new Error(where + ': ' + what + ' "' + v + '" is not one the sim knows');
}
function checkProfile(p) {
  for (const k of ['id', 'postcode', 'matches', 'place', 'stock', 'type', 'storeys', 'wall', 'roofShape', 'roofMat'])
    if (p[k] === undefined) throw new Error((p.id || '?') + ': missing "' + k + '"');
  for (const cls of ['house', 'block', 'shed']) {
    checkList(p.type[cls], TYPE_OK, 'building type', p.id);
    checkList(p.wall[cls], WALL_OK, 'wall material', p.id);
    checkList(p.roofShape[cls], SHAPE_OK, 'roof shape', p.id);
    checkList(p.roofMat[cls], ROOF_OK, 'roof material', p.id);
  }
  checkList(p.type.shed_large, TYPE_OK, 'building type', p.id);
  checkTexture(p);
  checkRoof(p);
}
/* Same idea as the wall spec: naming a unit the renderer does not draw gives
   you a silently generic roof, not an error. */
function checkRoof(p) {
  const r = p.roof;
  if (r === undefined) return;                       /* optional: national roofs */
  for (const kind in r) {
    const where = p.id + ' roof.' + kind;
    if (!ROOFKIND_OK.has(kind)) throw new Error(where + ': not a roof fabric the sim draws');
    if (!UNIT_OK.has(String(r[kind]))) throw new Error(where + ': unit "' + r[kind] + '" is not one the sim draws');
  }
}
/* The wall spec is drawn, not looked up, so a typo here does not fall back to
   grey — it falls back to a generic brick wall that looks deliberate. Hence
   the vocabulary check, against the tables in index.html. */
function checkTexture(p) {
  const t = p.texture;
  if (t === undefined) return;                       /* optional: no spec, national texture */
  for (const cls in t) {
    const where = p.id + ' texture.' + cls;
    if (!TEXCLS_OK.has(cls)) throw new Error(where + ': not a class of building the sim draws');
    const sp = t[cls];
    if (!sp || typeof sp !== 'object') throw new Error(where + ': not a spec');
    if (!BOND_OK.has(String(sp.bond))) throw new Error(where + ': bond "' + sp.bond + '" is not one the sim draws');
    if (!WIN_OK.has(String(sp.win))) throw new Error(where + ': window "' + sp.win + '" is not one the sim draws');
    if (!Array.isArray(sp.tile) || sp.tile.length !== 2 || !sp.tile.every(n => n > 0.5 && n < 60))
      throw new Error(where + ': tile must be [metres across, metres down], each 0.5-60');
    for (const k of ['bays', 'rows'])
      if (sp[k] !== undefined && !(Number.isInteger(sp[k]) && sp[k] >= 1 && sp[k] <= 8))
        throw new Error(where + ': ' + k + ' must be a whole number 1-8');
    if (sp.trim !== undefined && sp.trim !== 'stone')
      throw new Error(where + ': trim can only be "stone"');
    if (sp.door !== undefined && sp.door !== true && sp.door !== 'wide')
      throw new Error(where + ': door can only be true or "wide"');
  }
}

/* A file is either one profile, or a set of archetypes plus a map of postcode
   areas onto them. The second shape is how the whole country fits in a file
   somebody can actually read: the weights live once per archetype, not once
   per area. They are expanded here, so the sim itself is none the wiser. */
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.json')).sort();
const profiles = [];
const archetypes = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  if (d.kind === 'areas') {
    for (const k in d.archetypes) {
      if (archetypes[k]) throw new Error('two files define the archetype "' + k + '"');
      archetypes[k] = d.archetypes[k];
    }
    for (const a of d.areas) {
      if (!d.archetypes[a.archetype])
        throw new Error(f + ': ' + a.matches[0] + ' wants archetype "' + a.archetype + '", which is not defined');
      /* The archetype is NOT expanded into the page. A hundred and twenty
         copies of the same weight tables was 325 KB of a 534 KB file, on a
         page a phone loads off disk with no compression to save it. The sim
         merges the archetype in once at startup instead. */
      profiles.push(Object.assign({
        id: 'area-' + a.matches[0].toLowerCase(),
        postcode: a.matches[0],
        matches: a.matches,
        place: a.place,
        archetype: a.archetype
      }, a.overrides || {}));
    }
  } else {
    profiles.push(d);
  }
}
/* validate what the sim will actually end up with, not what is stored */
for (const p of profiles)
  checkProfile(p.archetype ? Object.assign({}, archetypes[p.archetype], p) : p);
const block = OPEN + '\nvar AI_ARCHETYPES = ' + JSON.stringify(archetypes) + ';\n' +
  'var AI_PROFILES = ' + JSON.stringify(profiles) + ';\n' +
  /* one pass at startup, so everything downstream sees a whole profile */
  'for(var _i=0;_i<AI_PROFILES.length;_i++){\n' +
  '  var _p = AI_PROFILES[_i], _a = _p.archetype && AI_ARCHETYPES[_p.archetype];\n' +
  '  if(_a) for(var _k in _a) if(_p[_k] === undefined) _p[_k] = _a[_k];\n' +
  '}\n' + CLOSE;

const html = htmlSrc;
const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
if (a < 0 || b < 0) throw new Error('markers not found in index.html');
const next = html.slice(0, a) + block + html.slice(b + CLOSE.length);

if (process.argv.includes('--check')) {
  if (next !== html) { console.error('index.html is out of date — run: node ai/embed.js'); process.exit(1); }
  console.log('embedded profiles are in sync (' + profiles.length + ' from ' + files.join(', ') + ')');
} else {
  fs.writeFileSync(HTML, next);
  console.log('embedded ' + profiles.length + ' profiles and ' + Object.keys(archetypes).length +
    ' archetypes from ' + files.length + ' file(s): ' + files.join(', '));
}
