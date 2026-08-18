#!/usr/bin/env node
/* Rebuilds models/kt23-3hp.json from the uploaded brief and its reference
   photographs.

     node models/build-kt23-3hp.js && node models/embed.js

   The JSON is the shipped artefact; this is how it was written. Chimneys,
   dormers and colonnade columns are loops here rather than a hundred and ten
   hand-copied JSON objects, heights are written to the EAVES and converted to
   OSM's roof-inclusive `height` at the end, and models outside the brief are
   carried over from whatever the JSON already holds. Re-running it is
   idempotent. */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const OLD = JSON.parse(fs.readFileSync(path.join(HERE, 'kt23-3hp.json'), 'utf8'));

/* --- palette read off the reference photographs --- */
const C = {
  flint:      '#8d8e86',   stoneDress: '#cfc6ac',
  redBrick:   '#a8553f',   handBrick:  '#a35d47',  stationBrick: '#a4503c',
  ochre:      '#d9b874',   /* Polesden's rendered walls */
  whiteStuc:  '#e8e5dc',   /* Thorncroft */
  paleStuc:   '#dcd7c8',   /* Bookham Grove scored stucco */
  roughcast:  '#eceae2',   /* the Anchor */
  weatherb:   '#f2f1ec',   /* St Nicolas tower's boarded stage */
  timber:     '#bfae92',
  glass:      '#93a9b8',
  slate:      '#565c64',   redTile: '#9c5236',  stoneSlate: '#8a8b83',
  shingle:    '#4a4640',   lead: '#5a5f64'
};

const P = [];   /* part helpers all push into a per-model array via bind */
function stack(list){ return list; }

/* a chimney: square shaft rising from minHeight to height */
function chim(u, v, w, h, min, colour, note){
  return { at:[u,v], w:w, d:w*0.62, minHeight:min, height:h, roof:'flat',
           material:'brick', colour:colour, note:note || 'chimney stack' };
}
/* a dormer: small gabled box sitting on the roof slope */
function dormer(u, v, w, min, h, colour, roofMat, roofCol){
  return { at:[u,v], w:w, d:w*0.9, minHeight:min, height:h, roof:'gabled', roofHeight:0.9,
           material:'wood', colour:'#efece4', roofMaterial:roofMat, roofColour:roofCol,
           note:'dormer' };
}
/* a column of a colonnade */
function column(u, v, h){
  return { at:[u,v], w:1.25, d:1.25, sides:12, height:h, roof:'flat',
           material:'plaster', colour:C.whiteStuc, note:'colonnade column' };
}

const models = [];

/* ============================================================ 1 */
models.push({
  id:'stnicolas', name:'St Nicolas Church, Great Bookham',
  match:['st nicolas','st nicholas'], near:[51.2790,-0.3766], radius:500,
  orient:'compass',
  confidence:'high — rebuilt from the uploaded brief and its reference photograph',
  sources:[
    'Uploaded brief "Landmark Building 3D Modelling Brief, KT23 3HP", entry 1, with embedded reference photograph (St Nicolas\' Church, Great Bookham, Wikimedia Commons / CC0).',
    'Brief: "predominantly constructed from knapped flint with limestone and Roman-tile elements ... The upper portion of the tower is weatherboarded and the tower terminates in a distinctive shingle-clad spire."',
    'Brief: "Model the lower tower as a substantial square masonry volume, with the upper tower changing visually from masonry to white-painted/weatherboarded timber. Above this create a steep, narrow, dark shingle-covered spire."'
  ],
  note:'The photograph corrects what I had built from the list entry alone: the spire rises straight off the SQUARE weatherboarded stage as a steep narrow pyramid — there is no octagon under it — and the boarded stage carries a clock on its south face. The long nave and chancel run under one continuous grey stone-slate roof with very low eaves; only the porch is red tile.',
  parts:[
    { on:'footprint', height:6.0, roof:'gabled', roofHeight:5.0, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'stone', roofColour:C.stoneSlate,
      note:'nave, aisles and chancel under one long low roof' },
    { at:[-0.90,0], w:6.4, d:6.4, height:13.0, type:'church',
      material:'stone', colour:C.flint, roof:'flat',
      note:'west tower, lower masonry stage (12th century)' },
    { at:[-0.90,0], w:5.8, d:5.8, minHeight:13.0, height:17.0, type:'church',
      material:'wood', colour:C.weatherb, roof:'flat',
      note:'weatherboarded upper stage, white painted, clock on the south face' },
    { at:[-0.90,0], w:4.8, d:4.8, minHeight:17.0, height:18.2, roof:'pyramidal', roofHeight:10.3,
      type:'church', material:'wood', colour:C.weatherb,
      roofMaterial:'shingle', roofColour:C.shingle,
      note:'steep narrow shingle spire, square based' },
    { at:[0.02,1.06], w:4.4, d:3.4, height:4.2, roof:'gabled', roofHeight:2.6, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'substantial south porch, medieval arched entrance, red tile' },
    { at:[-0.55,1.02], w:6.5, d:2.6, height:4.6, roof:'skillion', roofHeight:1.6, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'lean-to at the west end of the south aisle' },
    { at:[0.62,0], w:7.5, d:7.0, height:5.2, roof:'gabled', roofHeight:3.8, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'stone', roofColour:C.stoneSlate,
      note:'chancel of 1341, stepped down from the nave' }
  ]
});

/* ============================================================ 2 */
(function(){
  const parts = [
    { on:'footprint', height:11.6, roof:'hipped', roofHeight:3.2, type:'manor',
      material:'brick', colour:C.redBrick, roofMaterial:'slate', roofColour:C.slate,
      note:'main block, two and a half storeys over a basement, red Flemish bond' },
    { at:[0,0.88], wF:0.30, dF:0.30, height:13.4, roof:'gabled', roofHeight:2.6, type:'manor',
      material:'brick', colour:C.redBrick, roofMaterial:'slate', roofColour:C.slate,
      note:'three-bay centrepiece breaking forward, segmental pediment with an oval window' },
    { at:[0,1.04], w:3.6, d:2.2, height:4.4, roof:'flat', type:'manor',
      material:'limestone', colour:C.stoneDress,
      note:'stone entrance surround and steps' }
  ];
  for (const u of [-0.78,-0.34,0.34,0.78]) parts.push(chim(u,0.06,2.0,17.2,11.6,C.redBrick));
  for (const u of [-0.62,-0.22,0.22,0.62]) parts.push(dormer(u,0.76,2.0,11.6,13.2,C.redBrick,'slate',C.slate));
  models.push({
    id:'fetchampark', name:'Fetcham Park House',
    match:['fetcham park'], near:[51.2917,-0.3543], radius:700,
    orient:'compass',
    confidence:'high — brief plus its reference photograph',
    sources:[
      'Uploaded brief, entry 2, with reference photograph of the garden front and its circular fountain.',
      'Brief: "Grade II* listed early-18th-century country house designed by William Talman, dating principally from 1705-1710"; "red brick in Flemish bond"; "contrasting Portland stone, sandstone and terracotta architectural dressings"; "approximately two-and-a-half storeys over a basement".'
    ],
    note:'The photograph shows pale stone quoins at every corner and at the centrepiece, a run of dormers in the slate roof, and a projecting three-bay centre carrying a segmental pediment with an oval window. Modelled as red brick with a stone-dressed centre.',
    parts:parts
  });
})();

/* ============================================================ 3 */
models.push({
  id:'fetchamstmary', name:"St Mary's Church, Fetcham",
  match:['st mary','fetcham church'], near:[51.2925,-0.3540], radius:600,
  orient:'compass',
  confidence:'high — brief plus its reference photograph',
  sources:[
    'Uploaded brief, entry 3, with reference photograph across the churchyard.',
    'Brief: "three-stage square masonry tower with changing proportions between levels ... diagonal buttresses, brick detailing, arched/lancet openings and timber louvres in the belfry"; "knapped flint, with irregular pale-grey and dark-grey flints"; "roofs are predominantly red clay tile, with areas of graduated stone slate on the aisles".'
  ],
  note:'The photograph shows a squat square tower with a plain parapet and a small stair turret at one corner — no spire — a steeply gabled end with a large traceried pointed window, and a lower lean-to aisle running along the far side.',
  parts:[
    { on:'footprint', height:6.2, roof:'gabled', roofHeight:4.6, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'nave and chancel, flint walls, red clay tile' },
    { at:[0.72,0.62], w:6.0, d:6.0, height:15.4, roof:'flat', type:'church',
      material:'stone', colour:C.flint,
      note:'square south tower, three stages, plain parapet' },
    { at:[0.90,0.90], w:1.9, d:1.9, height:17.0, roof:'pyramidal', roofHeight:1.4, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'stair turret at the tower corner' },
    { at:[-0.20,-1.06], w:5.0, d:3.0, height:5.4, roof:'gabled', roofHeight:3.0, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'north transept, Gothic window with tracery' },
    { at:[-0.46,-1.02], w:3.2, d:2.4, height:3.8, roof:'gabled', roofHeight:2.2, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'north porch, moulded pointed arch' },
    { at:[0.10,1.04], w:9.0, d:2.6, height:4.4, roof:'skillion', roofHeight:1.8, type:'church',
      material:'stone', colour:C.flint, roofMaterial:'stone', roofColour:C.stoneSlate,
      note:'south aisle lean-to, graduated stone slate' }
  ]
});

/* ============================================================ 4  Polesden Lacey */
(function(){
  const H = 10.4, RH = 3.4;                 /* two storeys under a low hipped roof */
  const parts = [];
  const range = (u,v,wF,dF,note) => ({ at:[u,v], wF:wF, dF:dF, height:H, roof:'hipped', roofHeight:RH,
    type:'manor', material:'plaster', colour:C.ochre, roofMaterial:'slate', roofColour:C.slate, note:note });
  parts.push(range(0, 0.76, 1.00, 0.24, 'south range — the show front, ochre render, dark green shutters'));
  parts.push(range(0,-0.76, 1.00, 0.24, 'north range across the courtyard'));
  parts.push(range(-0.84, 0, 0.16, 1.00, 'west range'));
  parts.push(range( 0.84, 0, 0.16, 1.00, 'east range'));
  /* centrepiece of the south front */
  parts.push({ at:[0,0.90], wF:0.20, dF:0.10, height:11.6, roof:'hipped', roofHeight:2.6, type:'manor',
    material:'plaster', colour:C.ochre, roofMaterial:'slate', roofColour:C.slate,
    note:'centre bay breaking forward, pedimented entrance below' });
  parts.push({ at:[0,0.98], w:5.0, d:2.0, height:5.2, roof:'flat', type:'manor',
    material:'plaster', colour:C.whiteStuc, note:'stone entrance surround and steps' });
  /* the giant-order colonnade along the east half of the south front */
  for (let i = 0; i < 7; i++) parts.push(column(0.16 + i*0.11, 0.93, 9.2));
  parts.push({ at:[0.49,0.93], wF:0.44, d:1.1, minHeight:9.2, height:10.2, roof:'flat',
    type:'manor', material:'plaster', colour:C.whiteStuc, note:'colonnade entablature' });
  /* dormers along the south roof */
  for (const u of [-0.62,-0.42,-0.22,0.22,0.42,0.62])
    parts.push(dormer(u, 0.82, 1.9, H, H+1.9, C.ochre, 'slate', C.slate));
  /* tall slim rendered stacks, evenly spread — the photograph shows about ten */
  const stacks = [[-0.86,0.72],[-0.58,0.72],[-0.30,0.72],[0.30,0.72],[0.58,0.72],[0.86,0.72],
                  [-0.70,-0.72],[0.00,-0.72],[0.70,-0.72],[-0.86,-0.20],[0.86,-0.20]];
  for (const s of stacks) parts.push(chim(s[0], s[1], 1.7, 17.4, H, C.ochre, 'tall stuccoed stack'));
  /* the cupola: square white lantern, clock faces, dark domed lead roof */
  parts.push({ at:[0,0.62], w:4.6, d:4.6, minHeight:H+RH-0.4, height:15.2, roof:'flat',
    type:'manor', material:'plaster', colour:C.whiteStuc, note:'cupola base' });
  parts.push({ at:[0,0.62], w:4.0, d:4.0, minHeight:15.2, height:19.4, roof:'dome', roofHeight:3.2,
    type:'manor', material:'plaster', colour:C.whiteStuc, roofMaterial:'lead', roofColour:C.lead,
    note:'white lantern with clock faces under a dark domed lead roof and finial' });
  models.push({
    id:'polesden', name:'Polesden Lacey',
    match:['polesden lacey'],
    /* Everything on the estate is called Polesden Lacey something. Without
       this the house lands on the stable block and the visitor centre too. */
    exclude:['stables','stable','folly','estate','cottage','farm','lodge',
             'garden','car park','shop','restaurant','visitor'],
    /* TQ 1358 5218. Fixed against two sources that agree, after twice being
       placed 800 m north of the house on a recalled coordinate:
         - the National Trust gives TQ 133524 for the car park, and the house
           stands south-east of it;
         - the Ordnance Survey pack holds a 2,078 m2 quadrangle, 59 by 59
           metres with twelve corners, 360 m south-east of that car park, with
           the stable courtyard 150-215 m north of it and nothing else over
           1,100 m2 within 400 m.
       What was here before, TQ 1350 5298, is 580 m NORTH of the car park —
       the wrong side of it — and is Polesden Lacey Farm. */
    near:[51.25752,-0.37367], radius:300, packRadius:150,
    orient:'compass', replaceOutline:true,
    confidence:'high — rebuilt from the uploaded brief and two reference photographs',
    sources:[
      'Uploaded brief, entry 4, with reference photograph "Polesden Lacey House by Dave Spicer, via Geograph/Wikimedia Commons, CC BY-SA 2.0" and a second oblique view of the same front.',
      'Brief: "large symmetrical central composition with projecting side wings and multiple interconnected volumes"; "warm honey-coloured/red-brown brick with extensive pale stone or rendered architectural detailing"; "Model the small square cupola/turret rising above the main roof, with windows, projecting cornice and dark domed roof"; "numerous brick chimney stacks, dormer windows".',
      'Historic England list entry 1028665 (Grade II*): "in the form of a quadrangle around a large central courtyard"; "stucco on brick, slate roofs, and stuccoed chimneys"; "two storeys, with a prominent cornice carried round".',
      'Position: National Trust visitor information gives grid reference TQ 133524 for the car park (nationaltrust.org.uk/visit/surrey/polesden-lacey), and the OS OpenMap Local pack holds a 2,078 m2 twelve-cornered quadrangle 360 m south-east of it at TQ 1358 5218.'
    ],
    note:'The photographs overturn most of what I had built from the list entry. The walls are a strong ochre-yellow RENDER, not brick. The cupola is SQUARE and white with clock faces under a dark domed lead roof, not the tall octagon the listing describes — the listing and the photograph disagree and the photograph wins, as the brief instructs. The show front is long, flat and shallow-centred rather than deeply E-planned, it carries a run of dormers, about ten tall slim stuccoed stacks, and a giant-order colonnade along its eastern half. The quadrangle plan is kept from the listing because it is not visible in either photograph and is not contradicted by them.',
    parts:parts
  });
})();

/* ============================================================ 5 Thorncroft Manor */
(function(){
  const parts = [
    { at:[-0.42,0], wF:0.36, dF:0.62, height:12.6, roof:'hipped', roofHeight:3.4, type:'manor',
      material:'plaster', colour:C.whiteStuc, roofMaterial:'slate', roofColour:C.slate,
      note:'the Georgian manor: three storeys, five bays, white stuccoed' },
    { at:[-0.42,0.62], w:5.4, d:2.6, height:7.4, roof:'gabled', roofHeight:1.6, type:'manor',
      material:'plaster', colour:C.whiteStuc, roofMaterial:'slate', roofColour:C.slate,
      note:'pedimented entrance portico on columns, reached by stone steps' },
    { at:[-0.74,0.10], w:7.0, d:6.0, height:5.6, roof:'hipped', roofHeight:2.2, type:'manor',
      material:'plaster', colour:C.whiteStuc, roofMaterial:'slate', roofColour:C.slate,
      note:'lower service wing to the west' },
    /* Manser's 1974-76 extension: reflective glass on a brick and cobble plinth */
    { at:[0.42,0], wF:0.44, dF:0.72, height:1.5, roof:'flat', type:'office',
      material:'brick', colour:'#8f6a56', note:'raised brick and cobble plinth' },
    { at:[0.42,0], wF:0.42, dF:0.70, minHeight:1.5, height:8.4, roof:'flat', type:'office',
      material:'glass', colour:C.glass, note:'two glazed storeys, slim dark structural grid' },
    { at:[0.42,0], wF:0.36, dF:0.62, minHeight:8.4, height:11.6, roof:'flat', type:'office',
      material:'glass', colour:'#a9bcc8', note:'top floor set back and canted, reflecting the sky' }
  ];
  for (const u of [-0.60,-0.24]) parts.push(chim(u,0,2.2,16.4,12.6,'#9d6a55'));
  models.push({
    id:'thorncroft', name:'Thorncroft Manor, Leatherhead',
    match:['thorncroft'], near:[51.2899,-0.3337], radius:600,
    orient:'compass', replaceOutline:true,
    confidence:'high — brief plus its reference photograph',
    sources:[
      'Uploaded brief, entry 5, with reference photograph "Thorncroft Manor by Ian Capper, via Geograph/Wikimedia Commons, CC BY-SA 2.0".',
      'Brief: "rebuilt in the 18th century, while a striking modern extension was added in 1974-76 by Michael Manser and Partners"; "steel frame clad with reflective/mirror glass, sitting on a raised brick and cobble plinth ... approximately three storeys, with the upper floor set back and canted".'
    ],
    note:'The brief calls the manor red brick; its own photograph shows a white-painted stuccoed front with a pedimented columned portico, and the brief says the imagery governs, so it is modelled white. Three storeys, not two. The Manser extension is modelled as its own glazed volume beside the house rather than attached to it.',
    parts:parts
  });
})();

/* ============================================================ 6 Bookham Grove */
(function(){
  const parts = [
    { on:'footprint', height:8.4, roof:'hipped', roofHeight:3.6, type:'manor',
      material:'plaster', colour:C.paleStuc, roofMaterial:'slate', roofColour:C.slate,
      note:'two-storey main block, smooth scored stucco over brick' },
    { at:[0,0.94], w:4.6, d:1.8, height:9.6, roof:'gabled', roofHeight:1.8, type:'manor',
      material:'plaster', colour:C.paleStuc, roofMaterial:'slate', roofColour:C.slate,
      note:'central pediment/gable feature with its circular decorative panel' },
    { at:[0,1.06], w:3.0, d:1.4, height:4.0, roof:'gabled', roofHeight:0.9, type:'manor',
      material:'plaster', colour:'#efece2',
      note:'projecting classical entrance surround, pediment on pilasters' }
  ];
  for (const u of [-0.80,0.80]) parts.push(chim(u,0,2.0,13.0,8.4,'#9d6a55'));
  for (const u of [-0.48,-0.16,0.16,0.48]) parts.push(dormer(u,0.76,1.8,8.4,10.0,C.paleStuc,'slate',C.slate));
  models.push({
    id:'bookhamgrove', name:'Bookham Grove',
    match:['bookham grove'], near:[51.2775,-0.3800], radius:800,
    orient:'compass',
    confidence:'medium — brief only, no photograph was embedded for this entry',
    sources:[
      'Uploaded brief, entry 6: "Grade II listed large country house dating from 1765, built for Admiral Broderick and enlarged in 1822"; "smooth scored stucco over brick, appearing pale cream/grey rather than exposed brick"; "The facade contains a central triangular pediment/gable feature at roof level. Include the circular/oval decorative feature within this composition"; "dark grey slate with several brick chimney stacks. Add prominent dormer windows".'
    ],
    note:'No photograph came with this entry, so the massing follows the written brief only: a plain two-storey stuccoed block, central pediment with an oval panel, classical doorcase, dormers and end stacks.',
    parts:parts
  });
})();

/* ============================================================ 7 Bookham station */
(function(){
  const parts = [
    { on:'footprint', height:4.6, roof:'hipped', roofHeight:3.4, type:'train_station',
      material:'brick', colour:C.stationBrick, roofMaterial:'tile', roofColour:C.redTile,
      note:'single-storey booking hall and offices, red Flemish bond, shallow red tile roof' },
    { at:[0,1.04], wF:0.52, d:1.6, minHeight:3.2, height:3.6, roof:'flat', type:'train_station',
      material:'metal', colour:'#6d7278', note:'flat entrance canopy on iron brackets' },
    { at:[0.78,0.10], w:7.0, d:6.0, height:3.9, roof:'hipped', roofHeight:2.2, type:'train_station',
      material:'brick', colour:C.stationBrick, roofMaterial:'tile', roofColour:C.redTile,
      note:'lower later wing at the east end' }
  ];
  /* four tall corbelled stacks, the strongest thing in the photograph */
  for (const u of [-0.66,-0.24,0.16,0.58]) parts.push(chim(u,0.05,1.5,9.8,4.6,'#96452f','tall corbelled brick stack'));
  models.push({
    id:'bookhamstn', name:'Bookham station',
    match:['bookham station','bookham railway'], near:[51.2836,-0.3733], radius:600,
    confidence:'high — brief plus two reference photographs (forecourt and platforms)',
    sources:[
      'Uploaded brief, entry 7, with two reference photographs: the forecourt elevation and a view along the platforms.',
      'Brief: "The station dates from the 1880s and was built for the London and South Western Railway"; "red brick laid in Flemish bond. Use a compact low-rise composition with pitched red clay-tile roofs"; "Platform canopies should use slender cast-iron columns and timber framing".'
    ],
    note:'The forecourt photograph settles the massing: one long SINGLE-storey range, not the two-storey block I had, under a shallow red tile roof, with four tall corbelled brick stacks and a flat metal canopy on brackets over the entrance. Placed by footprint orientation rather than compass, because a station building is aligned to its track, not to north.',
    parts:parts
  });
})();

/* ============================================================ 8 The Anchor Inn */
(function(){
  const parts = [
    { on:'footprint', height:5.8, roof:'gabled', roofHeight:5.0, type:'pub',
      material:'plaster', colour:C.roughcast, roofMaterial:'tile', roofColour:C.redTile,
      note:'two-storey roughcast range under a steep red clay tile roof' },
    { at:[-0.08,1.08], w:2.6, d:1.8, height:3.2, roof:'gabled', roofHeight:1.9, type:'pub',
      material:'plaster', colour:C.roughcast, roofMaterial:'tile', roofColour:C.redTile,
      note:'projecting gabled porch, obviously a later addition' },
    { at:[0.86,0.50], w:6.0, d:4.4, height:3.2, roof:'gabled', roofHeight:2.0, type:'pub',
      material:'plaster', colour:C.roughcast, roofMaterial:'tile', roofColour:C.redTile,
      note:'single-storey 19th-century extension' }
  ];
  for (const u of [-0.62,0.20]) parts.push(chim(u,0,1.8,12.2,5.8,'#8f5340','substantial stack'));
  models.push({
    id:'anchorinn', name:'The Anchor Inn, Great Bookham',
    match:['anchor'], near:[51.2845,-0.3735], radius:700,
    orient:'compass',
    confidence:'medium — brief only, no photograph was embedded for this entry',
    sources:[
      'Uploaded brief, entry 8: "Grade II listed former 17th-century house now operating as a public house"; "white-painted roughcast walls"; "The main roof should be covered in traditional red/brown clay tiles. The roof should be relatively steep and visually substantial compared with the two-storey walls"; "The entrance should be approached through a projecting gabled porch".'
    ],
    note:'Low Surrey vernacular: the roof is deliberately taller than the walls, which is what stops it reading as a small modern house.',
    parts:parts
  });
})();

/* ============================================================ 9 Ralphs Cross */
(function(){
  const parts = [
    { at:[0,0], wF:0.70, dF:1.0, height:7.8, roof:'hipped', roofHeight:4.4, type:'house',
      material:'brick', colour:'#9d5442', roofMaterial:'tile', roofColour:C.redTile,
      note:'central block, two and a half storeys, red brick with blue-header diaper, steep hipped roof' },
    { at:[0,0], w:2.8, d:2.2, minHeight:7.8, height:15.2, roof:'flat', type:'house',
      material:'brick', colour:'#8d4a3a', note:'the huge central chimney stack — the whole point of the composition' },
    { at:[-0.86,0], wF:0.15, dF:0.70, height:8.4, roof:'hipped', roofHeight:2.4, type:'house',
      material:'brick', colour:'#9d5442', roofMaterial:'tile', roofColour:C.redTile,
      note:'west porch-and-stair turret wing' },
    { at:[0.86,0], wF:0.15, dF:0.70, height:8.4, roof:'hipped', roofHeight:2.4, type:'house',
      material:'brick', colour:'#9d5442', roofMaterial:'tile', roofColour:C.redTile,
      note:'east porch-and-stair turret wing' }
  ];
  for (const u of [-0.24,0.24]) parts.push(dormer(u,0.74,1.7,7.8,9.2,'#9d5442','tile',C.redTile));
  models.push({
    id:'ralphscross', name:'Ralphs Cross, 1 and 2 Leatherhead Road',
    match:['ralphs cross',"ralph's cross"], near:[51.2820,-0.3660], radius:800,
    orient:'compass', replaceOutline:true,
    confidence:'medium — brief only, no photograph was embedded for this entry',
    sources:[
      'Uploaded brief, entry 9: "Grade II listed pair of cottages designed by William Butterfield and constructed in 1864-66"; "red brick incorporating contrasting blue-header brick diaper patterns"; "The central roof should be steeply pitched and hipped, with a very prominent large chimney stack positioned centrally along the building"; "At either end, create the projecting/set-back porch-and-stair-turret wings."',
      'Historic England list entry 1189115 (cited in the brief).'
    ],
    note:'The diaper patterning cannot be modelled as geometry and the renderer has no per-face pattern, so the walls are plain brick and the recognisable silhouette carries the building: steep hipped roof, enormous central stack, turret wings at both ends.',
    parts:parts
  });
})();

/* ============================================================ 10 Roaring House Farmhouse */
(function(){
  const parts = [
    { at:[-0.52,0], wF:0.44, dF:0.92, height:5.2, roof:'gabled', roofHeight:4.2, type:'house',
      material:'brick', colour:C.handBrick, roofMaterial:'tile', roofColour:C.redTile,
      note:'the 17th-century two-unit core: tallest ridge, handmade brick in random bond' },
    { at:[0.02,0.04], wF:0.40, dF:0.84, height:4.6, roof:'gabled', roofHeight:3.4, type:'house',
      material:'brick', colour:'#9c5a45', roofMaterial:'tile', roofColour:C.redTile,
      note:'18th-century extension along the range — lower ridge, more regular openings' },
    { at:[0.52,-0.06], wF:0.34, dF:0.72, height:4.0, roof:'gabled', roofHeight:2.8, type:'house',
      material:'stone', colour:C.flint, roofMaterial:'tile', roofColour:C.redTile,
      note:'flint-faced range, a third phase again, lower still' },
    { at:[0.88,0.30], w:5.6, d:4.6, height:3.0, roof:'gabled', roofHeight:2.0, type:'house',
      material:'wood', colour:C.timber, roofMaterial:'tile', roofColour:C.redTile,
      note:'20th-century addition, simplified but clearly attached' },
    { at:[-0.30,0.62], w:4.4, d:3.0, height:3.2, roof:'skillion', roofHeight:1.4, type:'house',
      material:'wood', colour:C.timber, roofMaterial:'tile', roofColour:C.redTile,
      note:'lean-to outshut on the front, as farmhouses always grow' }
  ];
  for (const s of [[-0.52,0],[-0.06,0],[0.44,-0.06]]) parts.push(chim(s[0],s[1],2.4,10.6,5.2,'#94553f'));
  models.push({
    id:'roaringhouse', name:'Roaring House Farmhouse',
    match:['roaring house'], near:[51.2700,-0.3860], radius:900,
    confidence:'medium — brief only, no photograph was embedded for this entry',
    replaceOutline:true,
    sources:[
      'Uploaded brief, entry 10: "Grade II listed historic farmhouse, probably originating in the 17th century, with 18th-century and 20th-century additions"; "handmade red brick in random bond"; "Include areas of exposed timber framing"; "Incorporate areas of knapped flint into the elevations"; "The roof should be pitched and irregular, with different roof levels corresponding to various phases of extension."',
      'Historic England list entry 1188778 (cited in the brief).'
    ],
    note:'Built as four phases at four different ridge heights and three different materials, because the brief asks for organic growth rather than one uniform building. replaceOutline is set so the phases read as separate volumes instead of sitting on top of one plain box.',
    parts:parts
  });
})();

/* ---- heights are authored as EAVES; OSM's height is the whole thing ----
   In OSM a building's `height` includes its roof, and the renderer clamps a
   roof to leave at least 1.2 m of wall under it. Every height above is
   written as the height to the eaves because that is how a building is
   actually described, so convert here and check the clearance. */
let bumped = 0;
for (const m of models) for (const p of m.parts) {
  if (p.roofHeight == null || p.height == null) continue;
  p.height = +(p.height + p.roofHeight).toFixed(2);
  const need = (p.minHeight || 0) + 1.2 + p.roofHeight;
  if (p.height < need) { p.height = +need.toFixed(2); bumped++; }
}
console.log(bumped ? '  raised ' + bumped + ' part(s) to leave 1.2 m of wall under the roof' : '  no clearance problems');

/* ---- keep the earlier landmarks that the brief does not cover ---- */
const REPLACED = new Set(models.map(m => m.id));
for (const m of OLD.models) if (!REPLACED.has(m.id)) models.push(m);

const out = {
  id:'kt23-3hp',
  name:'Landmarks around Great Bookham',
  produced_by:'Claude Opus 5',
  produced_on:new Date().toISOString().slice(0,10),
  method:'Massing models fitted to whatever footprint OpenStreetMap holds. The first ten follow the uploaded "Landmark Building 3D Modelling Brief, KT23 3HP" and, where the brief embedded a reference photograph, that photograph — the brief states that the imagery governs where it and the text disagree, and it does disagree, twice. The remaining models are written from the model\'s own knowledge or from listed-building descriptions and say so in their confidence field.',
  confidence_scale:'high = drawn from the brief and a reference photograph of the building. medium = drawn from the brief\'s written description with no photograph. low = plausible massing, treat as a placeholder.',
  reference_images:'The brief embedded photographs for St Nicolas Great Bookham, Fetcham Park House, St Mary\'s Fetcham, Polesden Lacey (two views), Thorncroft Manor and Bookham station (two views). Entries 6, 8, 9 and 10 carried no embeddable image and are modelled from their written descriptions.',
  models:models,
  known_gaps:OLD.known_gaps,
  sources_caveat:OLD.sources_caveat
};
fs.writeFileSync(path.join(HERE, 'kt23-3hp.json'), JSON.stringify(out, null, 1) + '\n');
console.log('models: ' + models.length + ', parts: ' + models.reduce((t,m)=>t+m.parts.length,0));
