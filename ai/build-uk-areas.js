#!/usr/bin/env node
/* Writes ai/uk-areas.json: one AI interpretation profile per UK postcode
   area, which is as close as the postcode system gets to "cities and
   counties".

     node ai/build-uk-areas.js && node ai/embed.js

   Written as ARCHETYPES plus an area-to-archetype map rather than 121 hand
   copied weight tables, because the differences that matter between Bolton
   and Bradford are not differences a language model actually knows. What it
   does hold, and what this encodes, is the broad character of British
   building stock by region: terraced or semi-detached, brick or stone or
   render, slate or tile, two storeys or four.

   Everything here is inference. aiDress writes ai:levels, ai:wallmat and
   ai:roofmat, never building:levels, so none of it can be reported as a
   measurement.
*/
'use strict';
const fs = require('fs');
const path = require('path');

/* ---- the archetypes ---- */
const A = {};

A['london-inner'] = {
  character: 'Inner London: Georgian and Victorian terraces, mansion blocks and post-war estates, ' +
    'in London stock brick and slate, three to five storeys, with commercial frontage at ground level.',
  shedArea: 1400,
  stock: { house: 0.38, block: 0.52, shed: 0.10 },
  type: {
    house: [['terrace', 0.74], ['house', 0.14], ['semidetached_house', 0.08], ['detached', 0.04]],
    block: [['apartments', 0.58], ['commercial', 0.18], ['retail', 0.14], ['office', 0.10]],
    shed: [['warehouse', 0.40], ['industrial', 0.25], ['garage', 0.20], ['shed', 0.15]],
    shed_large: [['warehouse', 0.46], ['industrial', 0.30], ['factory', 0.24]]
  },
  storeys: { house: [[3, 0.44], [2, 0.30], [4, 0.20], [5, 0.06]],
             block: [[5, 0.30], [4, 0.28], [6, 0.18], [3, 0.14], [8, 0.10]], shed: [[1, 1]] },
  wall: { house: [['stock_brick', 0.40], ['brick', 0.22], ['render', 0.14], ['red_brick', 0.12], ['plaster', 0.06], ['stone', 0.06]],
          block: [['stock_brick', 0.32], ['brick', 0.22], ['concrete', 0.22], ['render', 0.14], ['glass', 0.10]],
          shed: [['metal', 0.50], ['brick', 0.24], ['concrete', 0.20], ['wood', 0.06]] },
  roofShape: { house: [['gabled', 0.50], ['hipped', 0.22], ['flat', 0.20], ['pyramidal', 0.08]],
               block: [['flat', 0.62], ['hipped', 0.24], ['gabled', 0.14]], shed: [['flat', 0.55], ['gabled', 0.45]] },
  roofMat: { house: [['slate', 0.62], ['tile', 0.22], ['clay', 0.10], ['metal', 0.06]],
             block: [['bitumen', 0.42], ['gravel', 0.26], ['slate', 0.20], ['tile', 0.12]],
             shed: [['metal', 0.70], ['bitumen', 0.20], ['eternit', 0.10]] }
};

A['london-outer'] = {
  character: 'Outer London: interwar semi-detached suburbia, hipped tile roofs, bay windows, ' +
    'red brick with render and mock timber, on long arterial roads and crescents.',
  shedArea: 1100,
  stock: { house: 0.78, block: 0.12, shed: 0.10 },
  type: {
    house: [['semidetached_house', 0.52], ['terrace', 0.22], ['detached', 0.14], ['bungalow', 0.07], ['house', 0.05]],
    block: [['apartments', 0.66], ['retail', 0.18], ['commercial', 0.16]],
    shed: [['garage', 0.36], ['warehouse', 0.24], ['shed', 0.20], ['industrial', 0.20]],
    shed_large: [['warehouse', 0.48], ['industrial', 0.32], ['factory', 0.20]]
  },
  storeys: { house: [[2, 0.84], [3, 0.10], [1, 0.06]],
             block: [[4, 0.40], [3, 0.34], [5, 0.18], [6, 0.08]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.42], ['render', 0.20], ['brick', 0.18], ['plaster', 0.10], ['timber_framing', 0.05], ['concrete', 0.05]],
          block: [['brick', 0.48], ['render', 0.30], ['concrete', 0.22]],
          shed: [['metal', 0.56], ['concrete', 0.20], ['brick', 0.16], ['wood', 0.08]] },
  roofShape: { house: [['hipped', 0.52], ['gabled', 0.40], ['flat', 0.05], ['pyramidal', 0.03]],
               block: [['hipped', 0.44], ['flat', 0.42], ['gabled', 0.14]], shed: [['gabled', 0.78], ['flat', 0.22]] },
  roofMat: { house: [['tile', 0.58], ['slate', 0.28], ['clay', 0.14]],
             block: [['tile', 0.44], ['gravel', 0.30], ['slate', 0.26]],
             shed: [['metal', 0.74], ['eternit', 0.26]] }
};

A['home-counties'] = {
  character: 'Home counties: interwar and post-war low-density suburbia and commuter villages — ' +
    'detached and semi-detached, generous plots, red and brown brick with render, pebbledash and ' +
    'tile hanging, concrete and clay tile roofs, very little above three storeys.',
  shedArea: 900,
  stock: { house: 0.82, block: 0.04, shed: 0.14 },
  type: {
    house: [['detached', 0.44], ['semidetached_house', 0.32], ['bungalow', 0.11], ['terrace', 0.08], ['house', 0.05]],
    block: [['apartments', 0.70], ['retail', 0.20], ['commercial', 0.10]],
    shed: [['garage', 0.34], ['barn', 0.24], ['shed', 0.20], ['warehouse', 0.12], ['industrial', 0.10]],
    shed_large: [['warehouse', 0.42], ['industrial', 0.28], ['barn', 0.18], ['factory', 0.12]]
  },
  storeys: { house: [[2, 0.76], [1, 0.17], [3, 0.07]],
             block: [[3, 0.55], [4, 0.35], [2, 0.10]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.40], ['brick', 0.17], ['render', 0.15], ['plaster', 0.09], ['timber_framing', 0.07], ['stone', 0.05], ['concrete', 0.04], ['wood', 0.03]],
          block: [['brick', 0.50], ['render', 0.30], ['concrete', 0.20]],
          shed: [['brick', 0.34], ['metal', 0.30], ['concrete', 0.18], ['wood', 0.18]] },
  roofShape: { house: [['hipped', 0.46], ['gabled', 0.44], ['pyramidal', 0.07], ['flat', 0.03]],
               block: [['hipped', 0.45], ['flat', 0.40], ['gabled', 0.15]], shed: [['gabled', 0.80], ['flat', 0.20]] },
  roofMat: { house: [['tile', 0.52], ['slate', 0.34], ['clay', 0.14]],
             block: [['tile', 0.45], ['gravel', 0.30], ['slate', 0.25]],
             shed: [['metal', 0.75], ['eternit', 0.25]] }
};

A['northern-industrial'] = {
  character: 'Northern mill and industrial towns: terraced streets of red brick under Welsh slate, ' +
    'two storeys, gable end to the street, with mills and sheds among them.',
  shedArea: 1000,
  stock: { house: 0.74, block: 0.10, shed: 0.16 },
  type: {
    house: [['terrace', 0.58], ['semidetached_house', 0.22], ['detached', 0.10], ['house', 0.06], ['bungalow', 0.04]],
    block: [['apartments', 0.56], ['retail', 0.24], ['commercial', 0.20]],
    shed: [['industrial', 0.30], ['warehouse', 0.26], ['garage', 0.24], ['shed', 0.20]],
    shed_large: [['factory', 0.36], ['warehouse', 0.34], ['industrial', 0.30]]
  },
  storeys: { house: [[2, 0.84], [3, 0.12], [1, 0.04]],
             block: [[4, 0.38], [3, 0.34], [5, 0.18], [6, 0.10]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.58], ['brick', 0.16], ['stone', 0.12], ['render', 0.08], ['concrete', 0.06]],
          block: [['red_brick', 0.44], ['concrete', 0.28], ['render', 0.16], ['glass', 0.12]],
          shed: [['metal', 0.52], ['brick', 0.24], ['concrete', 0.18], ['wood', 0.06]] },
  roofShape: { house: [['gabled', 0.74], ['hipped', 0.18], ['flat', 0.05], ['pyramidal', 0.03]],
               block: [['flat', 0.52], ['gabled', 0.26], ['hipped', 0.22]], shed: [['gabled', 0.72], ['flat', 0.28]] },
  roofMat: { house: [['slate', 0.58], ['tile', 0.30], ['clay', 0.12]],
             block: [['bitumen', 0.40], ['slate', 0.30], ['tile', 0.30]],
             shed: [['metal', 0.68], ['eternit', 0.22], ['bitumen', 0.10]] }
};

A['scottish-urban'] = {
  character: 'Scottish cities: sandstone and granite tenements of three and four storeys under steep ' +
    'slate roofs, with post-war blocks and render-and-harl suburbs beyond them.',
  shedArea: 1100,
  stock: { house: 0.56, block: 0.32, shed: 0.12 },
  type: {
    house: [['terrace', 0.34], ['semidetached_house', 0.30], ['detached', 0.24], ['bungalow', 0.12]],
    block: [['apartments', 0.78], ['retail', 0.12], ['commercial', 0.10]],
    shed: [['industrial', 0.30], ['warehouse', 0.26], ['garage', 0.24], ['shed', 0.20]],
    shed_large: [['warehouse', 0.42], ['industrial', 0.34], ['factory', 0.24]]
  },
  storeys: { house: [[2, 0.74], [1, 0.16], [3, 0.10]],
             block: [[4, 0.42], [3, 0.32], [5, 0.18], [6, 0.08]], shed: [[1, 1]] },
  wall: { house: [['sandstone', 0.34], ['render', 0.24], ['red_brick', 0.16], ['granite', 0.12], ['stone', 0.10], ['concrete', 0.04]],
          block: [['sandstone', 0.34], ['concrete', 0.28], ['render', 0.22], ['granite', 0.16]],
          shed: [['metal', 0.56], ['concrete', 0.22], ['brick', 0.16], ['wood', 0.06]] },
  roofShape: { house: [['gabled', 0.62], ['hipped', 0.30], ['flat', 0.08]],
               block: [['gabled', 0.42], ['flat', 0.36], ['hipped', 0.22]], shed: [['gabled', 0.70], ['flat', 0.30]] },
  roofMat: { house: [['slate', 0.74], ['tile', 0.18], ['clay', 0.08]],
             block: [['slate', 0.48], ['bitumen', 0.32], ['tile', 0.20]],
             shed: [['metal', 0.72], ['eternit', 0.28]] }
};

A['scottish-rural'] = {
  character: 'Rural and highland Scotland: white harled render and exposed stone, steep slate roofs, ' +
    'one and a half or two storeys, crofts and scattered steadings rather than streets.',
  shedArea: 800,
  stock: { house: 0.72, block: 0.06, shed: 0.22 },
  type: {
    house: [['detached', 0.48], ['semidetached_house', 0.20], ['terrace', 0.16], ['bungalow', 0.16]],
    block: [['apartments', 0.62], ['retail', 0.22], ['commercial', 0.16]],
    shed: [['barn', 0.36], ['shed', 0.26], ['garage', 0.22], ['industrial', 0.16]],
    shed_large: [['barn', 0.44], ['warehouse', 0.30], ['industrial', 0.26]]
  },
  storeys: { house: [[2, 0.50], [1, 0.42], [3, 0.08]],
             block: [[3, 0.56], [2, 0.28], [4, 0.16]], shed: [[1, 1]] },
  wall: { house: [['harling', 0.42], ['stone', 0.18], ['plaster', 0.16], ['granite', 0.10], ['red_brick', 0.08], ['wood', 0.06]],
          block: [['harling', 0.46], ['concrete', 0.28], ['stone', 0.26]],
          shed: [['metal', 0.58], ['wood', 0.18], ['concrete', 0.16], ['stone', 0.08]] },
  roofShape: { house: [['gabled', 0.78], ['hipped', 0.18], ['flat', 0.04]],
               block: [['gabled', 0.56], ['hipped', 0.28], ['flat', 0.16]], shed: [['gabled', 0.82], ['flat', 0.18]] },
  roofMat: { house: [['slate', 0.58], ['tile', 0.24], ['metal', 0.12], ['clay', 0.06]],
             block: [['slate', 0.52], ['tile', 0.28], ['bitumen', 0.20]],
             shed: [['metal', 0.80], ['eternit', 0.20]] }
};

A['welsh-valleys'] = {
  character: 'South Wales: terraced rows following the contour, render and pebbledash over stone and ' +
    'brick, steep slate roofs, two storeys, stepping down the hillside.',
  shedArea: 900,
  stock: { house: 0.78, block: 0.07, shed: 0.15 },
  type: {
    house: [['terrace', 0.52], ['semidetached_house', 0.24], ['detached', 0.16], ['bungalow', 0.08]],
    block: [['apartments', 0.60], ['retail', 0.22], ['commercial', 0.18]],
    shed: [['industrial', 0.28], ['garage', 0.26], ['shed', 0.24], ['warehouse', 0.22]],
    shed_large: [['warehouse', 0.40], ['industrial', 0.36], ['factory', 0.24]]
  },
  storeys: { house: [[2, 0.86], [3, 0.09], [1, 0.05]],
             block: [[3, 0.52], [4, 0.30], [2, 0.18]], shed: [[1, 1]] },
  wall: { house: [['pebbledash', 0.34], ['stone', 0.22], ['red_brick', 0.20], ['render', 0.12], ['brick', 0.12]],
          block: [['render', 0.44], ['red_brick', 0.30], ['concrete', 0.26]],
          shed: [['metal', 0.56], ['concrete', 0.20], ['brick', 0.16], ['stone', 0.08]] },
  roofShape: { house: [['gabled', 0.80], ['hipped', 0.16], ['flat', 0.04]],
               block: [['gabled', 0.48], ['flat', 0.32], ['hipped', 0.20]], shed: [['gabled', 0.76], ['flat', 0.24]] },
  roofMat: { house: [['slate', 0.72], ['tile', 0.20], ['clay', 0.08]],
             block: [['slate', 0.44], ['bitumen', 0.32], ['tile', 0.24]],
             shed: [['metal', 0.74], ['eternit', 0.26]] }
};

A['limestone-country'] = {
  character: 'Limestone country: honey and grey stone walls, stone slate and clay tile, steep gables, ' +
    'two storeys, villages of stone rather than brick.',
  shedArea: 850,
  stock: { house: 0.80, block: 0.05, shed: 0.15 },
  type: {
    house: [['detached', 0.36], ['terrace', 0.26], ['semidetached_house', 0.24], ['bungalow', 0.08], ['house', 0.06]],
    block: [['apartments', 0.60], ['retail', 0.24], ['commercial', 0.16]],
    shed: [['barn', 0.34], ['garage', 0.24], ['shed', 0.22], ['warehouse', 0.20]],
    shed_large: [['barn', 0.36], ['warehouse', 0.36], ['industrial', 0.28]]
  },
  storeys: { house: [[2, 0.80], [3, 0.11], [1, 0.09]],
             block: [[3, 0.58], [4, 0.26], [2, 0.16]], shed: [[1, 1]] },
  wall: { house: [['limestone', 0.44], ['sandstone', 0.16], ['stone', 0.14], ['red_brick', 0.14], ['render', 0.12]],
          block: [['limestone', 0.40], ['render', 0.32], ['concrete', 0.28]],
          shed: [['stone', 0.38], ['metal', 0.34], ['concrete', 0.16], ['wood', 0.12]] },
  roofShape: { house: [['gabled', 0.70], ['hipped', 0.24], ['flat', 0.06]],
               block: [['gabled', 0.44], ['hipped', 0.32], ['flat', 0.24]], shed: [['gabled', 0.80], ['flat', 0.20]] },
  roofMat: { house: [['stone', 0.30], ['clay', 0.30], ['slate', 0.26], ['tile', 0.14]],
             block: [['slate', 0.40], ['tile', 0.34], ['bitumen', 0.26]],
             shed: [['metal', 0.66], ['eternit', 0.20], ['stone', 0.14]] }
};

A['east-anglian'] = {
  character: 'East Anglia: soft red brick, flint and rendered timber frame, pantile and clay tile, ' +
    'the occasional thatch, two storeys, in market towns and long villages.',
  shedArea: 950,
  stock: { house: 0.79, block: 0.06, shed: 0.15 },
  type: {
    house: [['detached', 0.34], ['semidetached_house', 0.28], ['terrace', 0.24], ['bungalow', 0.09], ['house', 0.05]],
    block: [['apartments', 0.62], ['retail', 0.22], ['commercial', 0.16]],
    shed: [['barn', 0.32], ['garage', 0.24], ['warehouse', 0.24], ['shed', 0.20]],
    shed_large: [['barn', 0.34], ['warehouse', 0.36], ['industrial', 0.30]]
  },
  storeys: { house: [[2, 0.82], [1, 0.11], [3, 0.07]],
             block: [[3, 0.58], [4, 0.28], [2, 0.14]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.42], ['brick', 0.18], ['render', 0.16], ['plaster', 0.12], ['stone', 0.07], ['timber_framing', 0.05]],
          block: [['red_brick', 0.44], ['render', 0.32], ['concrete', 0.24]],
          shed: [['metal', 0.52], ['brick', 0.20], ['wood', 0.16], ['concrete', 0.12]] },
  roofShape: { house: [['gabled', 0.62], ['hipped', 0.32], ['flat', 0.06]],
               block: [['hipped', 0.40], ['gabled', 0.34], ['flat', 0.26]], shed: [['gabled', 0.80], ['flat', 0.20]] },
  roofMat: { house: [['clay', 0.42], ['tile', 0.30], ['slate', 0.20], ['thatch', 0.04], ['eternit', 0.04]],
             block: [['tile', 0.44], ['bitumen', 0.30], ['slate', 0.26]],
             shed: [['metal', 0.66], ['eternit', 0.22], ['clay', 0.12]] }
};

A['seaside-victorian'] = {
  character: 'A Victorian and Edwardian seaside city: painted stucco terraces and villas of three and ' +
    'four storeys along the front, brick behind, slate roofs, converted flats throughout.',
  shedArea: 1200,
  stock: { house: 0.62, block: 0.26, shed: 0.12 },
  type: {
    house: [['terrace', 0.48], ['semidetached_house', 0.22], ['detached', 0.18], ['house', 0.08], ['bungalow', 0.04]],
    block: [['apartments', 0.66], ['retail', 0.16], ['commercial', 0.10], ['office', 0.08]],
    shed: [['garage', 0.30], ['warehouse', 0.26], ['industrial', 0.24], ['shed', 0.20]],
    shed_large: [['warehouse', 0.44], ['industrial', 0.34], ['factory', 0.22]]
  },
  storeys: { house: [[2, 0.50], [3, 0.34], [4, 0.12], [1, 0.04]],
             block: [[4, 0.36], [5, 0.24], [3, 0.24], [6, 0.16]], shed: [[1, 1]] },
  wall: { house: [['stucco', 0.38], ['red_brick', 0.20], ['plaster', 0.18], ['brick', 0.14], ['stone', 0.10]],
          block: [['stucco', 0.40], ['brick', 0.28], ['concrete', 0.20], ['glass', 0.12]],
          shed: [['metal', 0.54], ['brick', 0.22], ['concrete', 0.18], ['wood', 0.06]] },
  roofShape: { house: [['hipped', 0.44], ['gabled', 0.42], ['flat', 0.14]],
               block: [['flat', 0.50], ['hipped', 0.30], ['gabled', 0.20]], shed: [['gabled', 0.70], ['flat', 0.30]] },
  roofMat: { house: [['slate', 0.52], ['tile', 0.30], ['clay', 0.18]],
             block: [['bitumen', 0.40], ['slate', 0.32], ['tile', 0.28]],
             shed: [['metal', 0.70], ['eternit', 0.30]] }
};

A['midlands-suburban'] = {
  character: 'The Midlands: red brick everywhere — interwar semis, Victorian terraces and post-war ' +
    'estates — under concrete and clay tile, two storeys, with industry threaded through.',
  shedArea: 1000,
  stock: { house: 0.78, block: 0.10, shed: 0.12 },
  type: {
    house: [['semidetached_house', 0.44], ['terrace', 0.30], ['detached', 0.16], ['bungalow', 0.06], ['house', 0.04]],
    block: [['apartments', 0.60], ['retail', 0.22], ['commercial', 0.18]],
    shed: [['industrial', 0.30], ['warehouse', 0.28], ['garage', 0.24], ['shed', 0.18]],
    shed_large: [['warehouse', 0.40], ['factory', 0.32], ['industrial', 0.28]]
  },
  storeys: { house: [[2, 0.86], [3, 0.09], [1, 0.05]],
             block: [[4, 0.38], [3, 0.32], [5, 0.20], [6, 0.10]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.58], ['brick', 0.18], ['render', 0.12], ['concrete', 0.06], ['timber_framing', 0.06]],
          block: [['red_brick', 0.46], ['concrete', 0.28], ['render', 0.16], ['glass', 0.10]],
          shed: [['metal', 0.56], ['brick', 0.20], ['concrete', 0.18], ['wood', 0.06]] },
  roofShape: { house: [['gabled', 0.58], ['hipped', 0.36], ['flat', 0.06]],
               block: [['flat', 0.50], ['hipped', 0.30], ['gabled', 0.20]], shed: [['gabled', 0.74], ['flat', 0.26]] },
  roofMat: { house: [['tile', 0.54], ['slate', 0.32], ['clay', 0.14]],
             block: [['bitumen', 0.40], ['tile', 0.34], ['slate', 0.26]],
             shed: [['metal', 0.70], ['eternit', 0.30]] }
};

A['west-country'] = {
  character: 'The West Country: painted render over cob and stone, granite in the far west, steep ' +
    'slate roofs and some thatch, two storeys, in narrow streets and scattered farms.',
  shedArea: 850,
  stock: { house: 0.78, block: 0.07, shed: 0.15 },
  type: {
    house: [['detached', 0.36], ['terrace', 0.28], ['semidetached_house', 0.22], ['bungalow', 0.10], ['house', 0.04]],
    block: [['apartments', 0.62], ['retail', 0.22], ['commercial', 0.16]],
    shed: [['barn', 0.32], ['garage', 0.26], ['shed', 0.22], ['warehouse', 0.20]],
    shed_large: [['barn', 0.38], ['warehouse', 0.34], ['industrial', 0.28]]
  },
  storeys: { house: [[2, 0.80], [1, 0.13], [3, 0.07]],
             block: [[3, 0.56], [4, 0.26], [2, 0.18]], shed: [[1, 1]] },
  wall: { house: [['render', 0.38], ['stone', 0.22], ['red_brick', 0.16], ['plaster', 0.14], ['granite', 0.06], ['wood', 0.04]],
          block: [['render', 0.46], ['concrete', 0.28], ['stone', 0.26]],
          shed: [['stone', 0.38], ['metal', 0.34], ['concrete', 0.16], ['wood', 0.12]] },
  roofShape: { house: [['gabled', 0.72], ['hipped', 0.22], ['flat', 0.06]],
               block: [['gabled', 0.44], ['hipped', 0.32], ['flat', 0.24]], shed: [['gabled', 0.78], ['flat', 0.22]] },
  roofMat: { house: [['slate', 0.58], ['tile', 0.24], ['clay', 0.12], ['thatch', 0.06]],
             block: [['slate', 0.44], ['tile', 0.32], ['bitumen', 0.24]],
             shed: [['metal', 0.72], ['eternit', 0.28]] }
};

A['northern-stone'] = {
  character: 'Northern stone country: gritstone and limestone under Westmorland and Welsh slate, ' +
    'two storeys, strong gables, field barns among the houses.',
  shedArea: 850,
  stock: { house: 0.76, block: 0.06, shed: 0.18 },
  type: {
    house: [['terrace', 0.34], ['detached', 0.30], ['semidetached_house', 0.24], ['bungalow', 0.08], ['house', 0.04]],
    block: [['apartments', 0.60], ['retail', 0.24], ['commercial', 0.16]],
    shed: [['barn', 0.38], ['garage', 0.22], ['shed', 0.22], ['warehouse', 0.18]],
    shed_large: [['barn', 0.40], ['warehouse', 0.34], ['industrial', 0.26]]
  },
  storeys: { house: [[2, 0.82], [3, 0.10], [1, 0.08]],
             block: [[3, 0.58], [4, 0.26], [2, 0.16]], shed: [[1, 1]] },
  wall: { house: [['sandstone', 0.34], ['stone', 0.26], ['limestone', 0.16], ['red_brick', 0.14], ['render', 0.10]],
          block: [['sandstone', 0.38], ['render', 0.32], ['concrete', 0.30]],
          shed: [['stone', 0.40], ['metal', 0.34], ['concrete', 0.16], ['wood', 0.10]] },
  roofShape: { house: [['gabled', 0.76], ['hipped', 0.18], ['flat', 0.06]],
               block: [['gabled', 0.46], ['hipped', 0.30], ['flat', 0.24]], shed: [['gabled', 0.82], ['flat', 0.18]] },
  roofMat: { house: [['slate', 0.62], ['stone', 0.16], ['tile', 0.14], ['clay', 0.08]],
             block: [['slate', 0.46], ['tile', 0.30], ['bitumen', 0.24]],
             shed: [['metal', 0.66], ['eternit', 0.20], ['stone', 0.14]] }
};

A['new-town'] = {
  character: 'A planned new town: post-war and later estates on a designed layout — brown and buff ' +
    'brick, shallow tile roofs, cul-de-sacs, grid roads, distribution sheds at the edge.',
  shedArea: 1300,
  stock: { house: 0.76, block: 0.10, shed: 0.14 },
  type: {
    house: [['semidetached_house', 0.38], ['terrace', 0.32], ['detached', 0.22], ['bungalow', 0.08]],
    block: [['apartments', 0.62], ['office', 0.16], ['retail', 0.14], ['commercial', 0.08]],
    shed: [['warehouse', 0.40], ['industrial', 0.26], ['garage', 0.20], ['shed', 0.14]],
    shed_large: [['warehouse', 0.58], ['industrial', 0.26], ['factory', 0.16]]
  },
  storeys: { house: [[2, 0.86], [3, 0.08], [1, 0.06]],
             block: [[4, 0.40], [3, 0.34], [5, 0.18], [6, 0.08]], shed: [[1, 1]] },
  wall: { house: [['brick', 0.44], ['red_brick', 0.28], ['render', 0.14], ['concrete', 0.08], ['wood', 0.06]],
          block: [['brick', 0.40], ['concrete', 0.30], ['render', 0.18], ['glass', 0.12]],
          shed: [['metal', 0.68], ['concrete', 0.18], ['brick', 0.14]] },
  roofShape: { house: [['gabled', 0.56], ['hipped', 0.38], ['flat', 0.06]],
               block: [['flat', 0.58], ['hipped', 0.26], ['gabled', 0.16]], shed: [['gabled', 0.62], ['flat', 0.38]] },
  roofMat: { house: [['tile', 0.66], ['slate', 0.22], ['clay', 0.12]],
             block: [['bitumen', 0.46], ['tile', 0.32], ['gravel', 0.22]],
             shed: [['metal', 0.82], ['eternit', 0.18]] }
};

A['northern-ireland'] = {
  character: 'Northern Ireland: red brick terraces in the city, white and cream render in the country, ' +
    'slate and concrete tile, two storeys, with bungalows common along the roads.',
  shedArea: 900,
  stock: { house: 0.79, block: 0.08, shed: 0.13 },
  type: {
    house: [['terrace', 0.34], ['detached', 0.28], ['semidetached_house', 0.24], ['bungalow', 0.14]],
    block: [['apartments', 0.60], ['retail', 0.24], ['commercial', 0.16]],
    shed: [['barn', 0.30], ['garage', 0.26], ['industrial', 0.24], ['shed', 0.20]],
    shed_large: [['warehouse', 0.40], ['barn', 0.32], ['industrial', 0.28]]
  },
  storeys: { house: [[2, 0.78], [1, 0.16], [3, 0.06]],
             block: [[3, 0.54], [4, 0.30], [5, 0.16]], shed: [[1, 1]] },
  wall: { house: [['red_brick', 0.36], ['render', 0.30], ['plaster', 0.14], ['brick', 0.12], ['stone', 0.08]],
          block: [['red_brick', 0.42], ['render', 0.32], ['concrete', 0.26]],
          shed: [['metal', 0.60], ['concrete', 0.18], ['brick', 0.14], ['wood', 0.08]] },
  roofShape: { house: [['gabled', 0.72], ['hipped', 0.24], ['flat', 0.04]],
               block: [['gabled', 0.42], ['flat', 0.34], ['hipped', 0.24]], shed: [['gabled', 0.76], ['flat', 0.24]] },
  roofMat: { house: [['slate', 0.48], ['tile', 0.40], ['clay', 0.12]],
             block: [['bitumen', 0.40], ['slate', 0.32], ['tile', 0.28]],
             shed: [['metal', 0.76], ['eternit', 0.24]] }
};

A['island'] = {
  character: 'The islands: granite and painted render, slate roofs, two storeys, dense old town and ' +
    'scattered country beyond.',
  shedArea: 800,
  stock: { house: 0.76, block: 0.12, shed: 0.12 },
  type: {
    house: [['terrace', 0.34], ['detached', 0.30], ['semidetached_house', 0.24], ['bungalow', 0.12]],
    block: [['apartments', 0.64], ['retail', 0.22], ['commercial', 0.14]],
    shed: [['garage', 0.30], ['barn', 0.26], ['shed', 0.24], ['warehouse', 0.20]],
    shed_large: [['warehouse', 0.44], ['barn', 0.30], ['industrial', 0.26]]
  },
  storeys: { house: [[2, 0.74], [3, 0.14], [1, 0.12]],
             block: [[3, 0.54], [4, 0.30], [5, 0.16]], shed: [[1, 1]] },
  wall: { house: [['granite', 0.34], ['render', 0.32], ['stone', 0.18], ['plaster', 0.10], ['red_brick', 0.06]],
          block: [['render', 0.44], ['granite', 0.30], ['concrete', 0.26]],
          shed: [['stone', 0.38], ['metal', 0.36], ['concrete', 0.16], ['wood', 0.10]] },
  roofShape: { house: [['gabled', 0.70], ['hipped', 0.24], ['flat', 0.06]],
               block: [['gabled', 0.42], ['hipped', 0.34], ['flat', 0.24]], shed: [['gabled', 0.78], ['flat', 0.22]] },
  roofMat: { house: [['slate', 0.66], ['tile', 0.22], ['clay', 0.12]],
             block: [['slate', 0.46], ['bitumen', 0.30], ['tile', 0.24]],
             shed: [['metal', 0.74], ['eternit', 0.26]] }
};

/* ---- what the walls actually look like ----

   The weights above say what a building is MADE of. This says what it LOOKS
   like, which is not the same question: a Glasgow tenement and a Rhondda
   terrace can both come out "stone" and still look nothing like each other
   from a thousand feet. Each entry is a spec for wallTexture() in the sim:

     bond   brick | stock | ashlar | rubble | flint | pebbledash | harl |
            render | timber            — the fabric and its coursing
     win    sash12 | sash6 | sash2 | casement | bay | tenement | strip |
            picture | lancet           — the shape of the openings
     bays   openings across one tile      rows   storeys down one tile
     tile   [metres across, metres down] the texture repeats over
     trim   "stone" for dressed surrounds
     string / quoins / eaves / tilehang  — the regional giveaways

   Nothing here carries colour: the wall-material weights above still tint
   it. Pattern here, colour there. Confidence is the same as everything else
   in this file — medium for the character, low for any given number.
*/
const TEX = {};

TEX['london-inner'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[7, 5.0], clerestory:true, door:'wide' },
  house:   { bond:'stock', win:'sash12', bays:2, rows:3, tile:[6.4, 10],  string:true, eaves:true },
  block:   { bond:'stock', win:'sash6',  bays:3, rows:4, tile:[11, 13],   string:true },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:3, tile:[13, 11],  trim:'stone', quoins:true, string:true, eaves:true, mat:'limestone' },
  masonry: { bond:'ashlar', win:'lancet', bays:1, rows:1, tile:[8, 9],    trim:'stone', quoins:true, mat:'limestone' }
};
TEX['london-outer'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[6.5, 4.4], clerestory:true, door:true },
  house:   { bond:'brick', win:'bay', bays:2, rows:2, tile:[8, 6.2] },
  block:   { bond:'brick', win:'casement', bays:3, rows:3, tile:[12, 9.6] },
  grand:   { bond:'brick', win:'sash12', bays:3, rows:2, tile:[14, 8.6], trim:'stone', quoins:true, eaves:true, mat:'red_brick' },
  masonry: { bond:'stock', win:'lancet', bays:1, rows:1, tile:[8, 9], trim:'stone', mat:'stock_brick' }
};
TEX['home-counties'] = {
  shed:    { bond:'brick', win:'none', bays:2, rows:1, tile:[5.5, 3.6], door:true },
  house:   { bond:'brick', win:'casement', bays:2, rows:2, tile:[9, 6.4], tilehang:true },
  block:   { bond:'brick', win:'casement', bays:3, rows:3, tile:[12, 9.6] },
  grand:   { bond:'brick', win:'sash12', bays:3, rows:2, tile:[15, 8.8], trim:'stone', quoins:true, eaves:true, mat:'red_brick' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 9], trim:'stone', quoins:true, mat:'flint' }
};
TEX['northern-industrial'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[8, 5.4], clerestory:true, door:'wide' },
  house:   { bond:'brick', win:'sash2', bays:2, rows:2, tile:[5.2, 6.0] },
  block:   { bond:'brick', win:'casement', bays:4, rows:4, tile:[15, 12] },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:3, tile:[13, 11], trim:'stone', string:true, eaves:true, mat:'sandstone' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 9.5], trim:'stone', quoins:true, mat:'sandstone' }
};
TEX['scottish-urban'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[7.5, 5.2], clerestory:true, door:'wide' },
  house:   { bond:'ashlar', win:'tenement', bays:2, rows:3, tile:[7, 10.5], trim:'stone', string:true },
  block:   { bond:'ashlar', win:'tenement', bays:3, rows:4, tile:[11, 14],  trim:'stone', string:true, eaves:true },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:3, tile:[13, 11.5],  trim:'stone', quoins:true, string:true, eaves:true, mat:'sandstone' },
  masonry: { bond:'ashlar', win:'lancet', bays:1, rows:1, tile:[8, 10], trim:'stone', quoins:true, mat:'sandstone' }
};
TEX['scottish-rural'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[9, 5.6], door:'wide', plinth:true },
  house:   { bond:'harl', win:'sash6', bays:2, rows:2, tile:[6, 6.2] },
  block:   { bond:'harl', win:'casement', bays:3, rows:3, tile:[11, 9.4] },
  grand:   { bond:'rubble', win:'sash6', bays:3, rows:3, tile:[13, 11], trim:'stone', quoins:true, mat:'granite' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[7.5, 9.5], trim:'stone', quoins:true, mat:'granite' }
};
TEX['welsh-valleys'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[7, 4.8], clerestory:true, door:true },
  house:   { bond:'pebbledash', win:'sash2', bays:2, rows:2, tile:[5, 6.0] },
  block:   { bond:'render', win:'casement', bays:3, rows:3, tile:[11, 9.4] },
  grand:   { bond:'rubble', win:'sash6', bays:3, rows:2, tile:[13, 8.6], trim:'stone', quoins:true, mat:'stone' },
  masonry: { bond:'rubble', win:'lancet', bays:2, rows:1, tile:[10, 8.5], trim:'stone', mat:'stone' }
};
TEX['limestone-country'] = {
  shed:    { bond:'rubble', win:'none', bays:2, rows:1, tile:[8, 5.0], door:'wide', plinth:true },
  house:   { bond:'ashlar', win:'sash6', bays:2, rows:2, tile:[7, 7.0], trim:'stone', quoins:true },
  block:   { bond:'ashlar', win:'sash6', bays:3, rows:3, tile:[12, 11], trim:'stone', string:true },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:3, tile:[14, 11.5], trim:'stone', quoins:true, string:true, eaves:true, mat:'limestone' },
  masonry: { bond:'ashlar', win:'lancet', bays:1, rows:1, tile:[8, 10], trim:'stone', quoins:true, mat:'limestone' }
};
TEX['east-anglian'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[10, 6.0], door:'wide', plinth:true },
  house:   { bond:'brick', win:'casement', bays:2, rows:2, tile:[6.4, 6.2], quoins:true },
  block:   { bond:'brick', win:'sash6', bays:3, rows:3, tile:[11, 10] },
  grand:   { bond:'brick', win:'sash12', bays:3, rows:2, tile:[14, 8.8], trim:'stone', quoins:true, eaves:true, mat:'red_brick' },
  masonry: { bond:'flint', win:'lancet', bays:1, rows:1, tile:[8, 10], trim:'stone', quoins:true, mat:'flint' }
};
TEX['seaside-victorian'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[6.5, 4.4], clerestory:true, door:true },
  house:   { bond:'render', win:'bay', bays:2, rows:3, tile:[6.6, 9.6], trim:'stone', string:true, eaves:true },
  block:   { bond:'render', win:'sash6', bays:3, rows:4, tile:[11, 13], string:true, eaves:true },
  grand:   { bond:'render', win:'sash12', bays:3, rows:3, tile:[13, 11], trim:'stone', quoins:true, string:true, eaves:true, mat:'stucco' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 9.5], trim:'stone', mat:'flint' }
};
TEX['midlands-suburban'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[9, 6.0], clerestory:true, door:'wide' },
  house:   { bond:'brick', win:'casement', bays:2, rows:2, tile:[7.6, 6.2] },
  block:   { bond:'brick', win:'strip', bays:2, rows:4, tile:[13, 12] },
  grand:   { bond:'brick', win:'sash12', bays:3, rows:2, tile:[14, 8.8], trim:'stone', quoins:true, eaves:true, mat:'red_brick' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 9.5], trim:'stone', quoins:true, mat:'red_sandstone' }
};
TEX['west-country'] = {
  shed:    { bond:'rubble', win:'none', bays:2, rows:1, tile:[8, 5.0], door:'wide', plinth:true },
  house:   { bond:'render', win:'casement', bays:2, rows:2, tile:[6.4, 6.0] },
  block:   { bond:'render', win:'casement', bays:3, rows:3, tile:[11, 9.4] },
  grand:   { bond:'ashlar', win:'sash6', bays:3, rows:2, tile:[13, 8.6], trim:'stone', quoins:true, mat:'limestone' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[7.5, 9.5], trim:'stone', quoins:true, mat:'stone' }
};
TEX['northern-stone'] = {
  shed:    { bond:'rubble', win:'none', bays:2, rows:1, tile:[7.5, 4.8], door:'wide', plinth:true },
  house:   { bond:'rubble', win:'casement', bays:2, rows:2, tile:[6.6, 6.4], quoins:true },
  block:   { bond:'rubble', win:'sash6', bays:3, rows:3, tile:[11, 10], trim:'stone' },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:3, tile:[13, 11], trim:'stone', quoins:true, string:true, mat:'sandstone' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 10], trim:'stone', quoins:true, mat:'sandstone' }
};
TEX['new-town'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[12, 7.5], clerestory:true, door:'wide' },
  house:   { bond:'brick', win:'strip', bays:1, rows:2, tile:[6.2, 6.0] },
  block:   { bond:'brick', win:'strip', bays:2, rows:5, tile:[14, 15] },
  grand:   { bond:'render', win:'picture', bays:2, rows:2, tile:[13, 8.4], mat:'render' },
  masonry: { bond:'render', win:'lancet', bays:2, rows:1, tile:[10, 8.5], mat:'render' }
};
TEX['northern-ireland'] = {
  shed:    { bond:'steel', win:'none', bays:2, rows:1, tile:[8.5, 5.4], door:'wide', plinth:true },
  house:   { bond:'brick', win:'casement', bays:2, rows:2, tile:[7, 6.2] },
  block:   { bond:'brick', win:'casement', bays:3, rows:3, tile:[12, 9.6] },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:2, tile:[13, 8.8], trim:'stone', quoins:true, eaves:true, mat:'sandstone' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[8, 9.5], trim:'stone', quoins:true, mat:'stone' }
};
TEX['island'] = {
  shed:    { bond:'rubble', win:'none', bays:2, rows:1, tile:[7, 4.6], door:'wide', plinth:true },
  house:   { bond:'rubble', win:'sash6', bays:2, rows:2, tile:[6, 6.4], quoins:true },
  block:   { bond:'render', win:'sash6', bays:3, rows:3, tile:[11, 10] },
  grand:   { bond:'ashlar', win:'sash12', bays:3, rows:2, tile:[13, 8.8], trim:'stone', quoins:true, mat:'granite' },
  masonry: { bond:'rubble', win:'lancet', bays:1, rows:1, tile:[7.5, 9.5], trim:'stone', quoins:true, mat:'granite' }
};

/* ---- and what the roofs are made of ----

   The weights say "slate" or "tile"; this says WHICH. Welsh slate is small,
   dark and dead regular; a Westmorland or Cotswold stone slate roof is
   graduated, big at the eaves and small at the ridge, and you can see that
   taper from the air. A pantile is an S in section and reads as corduroy; a
   plain clay tile does not; a concrete interlocking tile is wide and flat.

   Only these two vary by region. Thatch, sheet metal and flat felt look the
   same in Cornwall as in Caithness, so they are left national.
*/
const ROOF = {};
ROOF['london-inner'] = { slate:'welsh', tile:'plain' };
ROOF['london-outer'] = { slate:'welsh', tile:'plain' };
ROOF['home-counties'] = { slate:'welsh', tile:'plain' };
ROOF['northern-industrial'] = { slate:'welsh', tile:'pantile' };
ROOF['scottish-urban'] = { slate:'welsh', tile:'pantile' };
ROOF['scottish-rural'] = { slate:'welsh', tile:'plain' };
ROOF['welsh-valleys'] = { slate:'welsh', tile:'plain' };
ROOF['limestone-country'] = { slate:'stone', tile:'roman' };
ROOF['east-anglian'] = { slate:'welsh', tile:'pantile' };
ROOF['seaside-victorian'] = { slate:'welsh', tile:'plain' };
ROOF['midlands-suburban'] = { slate:'welsh', tile:'concrete' };
ROOF['west-country'] = { slate:'welsh', tile:'roman' };
ROOF['northern-stone'] = { slate:'westmorland', tile:'pantile' };
ROOF['new-town'] = { slate:'welsh', tile:'concrete', metal:'standing' };
ROOF['northern-ireland'] = { slate:'welsh', tile:'concrete' };
ROOF['island'] = { slate:'welsh', tile:'plain' };

for (const k in ROOF) {
  if (!A[k]) throw new Error('roof spec for unknown archetype "' + k + '"');
  A[k].roof = ROOF[k];
}
for (const k in A) if (!A[k].roof) throw new Error('archetype "' + k + '" has no roof spec');

for (const k in TEX) {
  if (!A[k]) throw new Error('texture spec for unknown archetype "' + k + '"');
  A[k].texture = TEX[k];
}
for (const k in A) if (!A[k].texture) throw new Error('archetype "' + k + '" has no texture spec');

/* ---- every UK postcode area, and which archetype it takes ---- */
const AREAS = [
  ['AB', 'Aberdeen and Aberdeenshire', 'scottish-urban'],
  ['AL', 'St Albans and mid Hertfordshire', 'home-counties'],
  ['B',  'Birmingham', 'midlands-suburban'],
  ['BA', 'Bath and north-east Somerset', 'limestone-country'],
  ['BB', 'Blackburn and east Lancashire', 'northern-industrial'],
  ['BD', 'Bradford and the Aire valley', 'northern-industrial'],
  ['BH', 'Bournemouth, Poole and east Dorset', 'seaside-victorian'],
  ['BL', 'Bolton', 'northern-industrial'],
  ['BN', 'Brighton, Hove and the Sussex coast', 'seaside-victorian'],
  ['BR', 'Bromley and south-east London', 'london-outer'],
  ['BS', 'Bristol', 'seaside-victorian'],
  ['BT', 'Northern Ireland', 'northern-ireland'],
  ['CA', 'Carlisle and Cumbria', 'northern-stone'],
  ['CB', 'Cambridge and the fens', 'east-anglian'],
  ['CF', 'Cardiff and the south Wales coast', 'welsh-valleys'],
  ['CH', 'Chester, Wirral and north-east Wales', 'northern-industrial'],
  ['CM', 'Chelmsford and mid Essex', 'home-counties'],
  ['CO', 'Colchester and north Essex', 'east-anglian'],
  ['CR', 'Croydon', 'london-outer'],
  ['CT', 'Canterbury and east Kent', 'east-anglian'],
  ['CV', 'Coventry and Warwickshire', 'midlands-suburban'],
  ['CW', 'Crewe and south Cheshire', 'midlands-suburban'],
  ['DA', 'Dartford and north-west Kent', 'london-outer'],
  ['DD', 'Dundee and Angus', 'scottish-urban'],
  ['DE', 'Derby and Derbyshire', 'midlands-suburban'],
  ['DG', 'Dumfries and Galloway', 'scottish-rural'],
  ['DH', 'Durham', 'northern-industrial'],
  ['DL', 'Darlington and the northern dales', 'northern-stone'],
  ['DN', 'Doncaster and north Lincolnshire', 'northern-industrial'],
  ['DT', 'Dorchester and west Dorset', 'west-country'],
  ['DY', 'Dudley and the Black Country', 'midlands-suburban'],
  ['E',  'East London', 'london-inner'],
  ['EC', 'the City of London', 'london-inner'],
  ['EH', 'Edinburgh and the Lothians', 'scottish-urban'],
  ['EN', 'Enfield and south Hertfordshire', 'london-outer'],
  ['EX', 'Exeter and east Devon', 'west-country'],
  ['FK', 'Falkirk and Stirling', 'scottish-urban'],
  ['FY', 'Blackpool and the Fylde', 'seaside-victorian'],
  ['G',  'Glasgow', 'scottish-urban'],
  ['GL', 'Gloucester and the Cotswolds', 'limestone-country'],
  ['GU', 'Guildford and west Surrey', 'home-counties'],
  ['GY', 'Guernsey', 'island'],
  ['HA', 'Harrow and north-west London', 'london-outer'],
  ['HD', 'Huddersfield', 'northern-industrial'],
  ['HG', 'Harrogate and the Yorkshire dales', 'northern-stone'],
  ['HP', 'Hemel Hempstead and the Chilterns', 'home-counties'],
  ['HR', 'Hereford and the Marches', 'east-anglian'],
  ['HS', 'the Outer Hebrides', 'scottish-rural'],
  ['HU', 'Hull and Holderness', 'northern-industrial'],
  ['HX', 'Halifax and Calderdale', 'northern-stone'],
  ['IG', 'Ilford and east London', 'london-outer'],
  ['IM', 'the Isle of Man', 'island'],
  ['IP', 'Ipswich and Suffolk', 'east-anglian'],
  ['IV', 'Inverness and the Highlands', 'scottish-rural'],
  ['JE', 'Jersey', 'island'],
  ['KA', 'Kilmarnock and Ayrshire', 'scottish-urban'],
  ['KT', 'Kingston and north Surrey', 'home-counties'],
  ['KW', 'Kirkwall, Caithness and Orkney', 'scottish-rural'],
  ['KY', 'Kirkcaldy and Fife', 'scottish-urban'],
  ['L',  'Liverpool and Merseyside', 'northern-industrial'],
  ['LA', 'Lancaster, Furness and the Lakes', 'northern-stone'],
  ['LD', 'Llandrindod Wells and mid Wales', 'welsh-valleys'],
  ['LE', 'Leicester and Leicestershire', 'midlands-suburban'],
  ['LL', 'Llandudno and north Wales', 'welsh-valleys'],
  ['LN', 'Lincoln and Lincolnshire', 'east-anglian'],
  ['LS', 'Leeds', 'northern-industrial'],
  ['LU', 'Luton and south Bedfordshire', 'home-counties'],
  ['M',  'Manchester', 'northern-industrial'],
  ['ME', 'Medway and mid Kent', 'home-counties'],
  ['MK', 'Milton Keynes and north Buckinghamshire', 'new-town'],
  ['ML', 'Motherwell and Lanarkshire', 'scottish-urban'],
  ['N',  'North London', 'london-inner'],
  ['NE', 'Newcastle and Tyneside', 'northern-industrial'],
  ['NG', 'Nottingham and Nottinghamshire', 'midlands-suburban'],
  ['NN', 'Northampton and Northamptonshire', 'midlands-suburban'],
  ['NP', 'Newport and the Gwent valleys', 'welsh-valleys'],
  ['NR', 'Norwich and Norfolk', 'east-anglian'],
  ['NW', 'North-west London', 'london-inner'],
  ['OL', 'Oldham and Rochdale', 'northern-industrial'],
  ['OX', 'Oxford and Oxfordshire', 'limestone-country'],
  ['PA', 'Paisley, Renfrewshire and Argyll', 'scottish-urban'],
  ['PE', 'Peterborough and the fens', 'east-anglian'],
  ['PH', 'Perth and highland Perthshire', 'scottish-rural'],
  ['PL', 'Plymouth and south-west Devon', 'west-country'],
  ['PO', 'Portsmouth and the Solent', 'seaside-victorian'],
  ['PR', 'Preston and central Lancashire', 'northern-industrial'],
  ['RG', 'Reading and the Thames valley', 'home-counties'],
  ['RH', 'Redhill, Crawley and east Surrey', 'home-counties'],
  ['RM', 'Romford and east London', 'london-outer'],
  ['S',  'Sheffield and Rotherham', 'northern-industrial'],
  ['SA', 'Swansea and west Wales', 'welsh-valleys'],
  ['SE', 'South-east London', 'london-inner'],
  ['SG', 'Stevenage and north Hertfordshire', 'home-counties'],
  ['SK', 'Stockport and north Derbyshire', 'northern-industrial'],
  ['SL', 'Slough, Windsor and east Berkshire', 'home-counties'],
  ['SM', 'Sutton', 'london-outer'],
  ['SN', 'Swindon and north Wiltshire', 'home-counties'],
  ['SO', 'Southampton and central Hampshire', 'seaside-victorian'],
  ['SP', 'Salisbury and south Wiltshire', 'limestone-country'],
  ['SR', 'Sunderland and east Durham', 'northern-industrial'],
  ['SS', 'Southend and south Essex', 'seaside-victorian'],
  ['ST', 'Stoke-on-Trent and Staffordshire', 'northern-industrial'],
  ['SW', 'South-west London', 'london-inner'],
  ['SY', 'Shrewsbury and Shropshire', 'east-anglian'],
  ['TA', 'Taunton and Somerset', 'west-country'],
  ['TD', 'Galashiels and the Scottish Borders', 'scottish-rural'],
  ['TF', 'Telford', 'new-town'],
  ['TN', 'Tonbridge and the Weald', 'home-counties'],
  ['TQ', 'Torquay and south Devon', 'west-country'],
  ['TR', 'Truro and Cornwall', 'west-country'],
  ['TS', 'Teesside and Cleveland', 'northern-industrial'],
  ['TW', 'Twickenham and west London', 'london-outer'],
  ['UB', 'Southall and west London', 'london-outer'],
  ['W',  'West London', 'london-inner'],
  ['WA', 'Warrington and south Lancashire', 'northern-industrial'],
  ['WC', 'central London', 'london-inner'],
  ['WD', 'Watford and south-west Hertfordshire', 'london-outer'],
  ['WF', 'Wakefield and west Yorkshire', 'northern-industrial'],
  ['WN', 'Wigan', 'northern-industrial'],
  ['WR', 'Worcester and Worcestershire', 'midlands-suburban'],
  ['WS', 'Walsall and the Black Country', 'midlands-suburban'],
  ['WV', 'Wolverhampton', 'midlands-suburban'],
  ['YO', 'York and the Vale of York', 'northern-stone'],
  ['ZE', 'Shetland', 'scottish-rural']
];

const out = {
  id: 'uk-areas',
  kind: 'areas',
  name: 'UK postcode areas',
  produced_by: 'Claude Opus 5',
  produced_on: new Date().toISOString().slice(0, 10),
  method: 'Written from the model\'s training knowledge of British building stock by region. ' +
    'No live lookup, no aerial imagery, no OSM query, no site visit. Stored as archetypes plus an ' +
    'area-to-archetype map rather than 121 separate weight tables, because the differences between ' +
    'Bolton and Bradford are not differences a language model actually knows; the differences ' +
    'between Bolton and Bath are.',
  confidence: {
    archetypes: 'medium — the broad character of British regional building stock is the kind of ' +
      'thing a language model does hold: terrace or semi, brick or stone or render, slate or tile.',
    assignment: 'medium for areas named after one city, lower for the large rural areas, which ' +
      'contain several characters and get the commonest one.',
    proportions: 'low to medium — the weights are considered estimates, not surveys, and are the ' +
      'thing most worth correcting.',
    edges: 'low — a postcode area is not a county and its edges are arbitrary. GU covers both ' +
      'Guildford and Aldershot; LL covers both Llandudno and Wrexham.'
  },
  caveat: 'Every value here is inference. aiDress writes ai:levels, ai:wallmat and ai:roofmat, ' +
    'never building:levels, so nothing from this file is ever counted as a measurement.',
  archetypes: A,
  areas: AREAS.map(a => ({ matches: [a[0]], place: a[1], archetype: a[2] }))
};

fs.writeFileSync(path.join(__dirname, 'uk-areas.json'), JSON.stringify(out, null, 1) + '\n');
const byArch = {};
for (const a of AREAS) byArch[a[2]] = (byArch[a[2]] || 0) + 1;
console.log(AREAS.length + ' postcode areas, ' + Object.keys(A).length + ' archetypes');
console.log(Object.entries(byArch).sort((x, y) => y[1] - x[1])
  .map(([k, v]) => '  ' + k.padEnd(20) + v).join('\n'));
