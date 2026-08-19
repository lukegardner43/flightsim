#!/usr/bin/env node
/* Prints a GDAL WCS service description.

   GDAL can read a Web Coverage Service directly, which matters for more than
   tidiness: a 10 km square at 1 m is a hundred million samples and no server
   hands that over in one GetCoverage. The driver fetches it in blocks,
   negotiates the version and works out the axis labels — every part of a
   hand-built GetCoverage URL that is easy to get wrong, and the first attempt
   at this got wrong.

   It lives in a file rather than a heredoc inside the workflow because a
   heredoc inside a YAML block scalar is a good way to break the YAML, which
   is exactly what happened.

     node packs/wcs-service.js <slug> <coverage> [base] > dsm.xml
*/
'use strict';
const slug = process.argv[2], cov = process.argv[3];
const base = process.argv[4] || 'https://environment.data.gov.uk/spatialdata';
if (!slug || !cov) { console.error('usage: wcs-service.js <slug> <coverage> [base]'); process.exit(1); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
process.stdout.write(
  '<WCS_GDAL>\n' +
  '  <ServiceURL>' + esc(base + '/' + slug + '/wcs') + '</ServiceURL>\n' +
  '  <CoverageName>' + esc(cov) + '</CoverageName>\n' +
  '  <Version>2.0.1</Version>\n' +
  '  <BlockXSize>1024</BlockXSize>\n' +
  '  <BlockYSize>1024</BlockYSize>\n' +
  '</WCS_GDAL>\n');
