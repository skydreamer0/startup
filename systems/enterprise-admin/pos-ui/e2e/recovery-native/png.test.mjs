import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { validatePng, captureViewport } from './png.mjs';
import { stagesByCase } from './contract.mjs';
import { validatePng as legacyPng, validateTraceDesktopPng, validateExactViewportPng } from '../admin-margin-warning/png.mjs';
function crc32(bytes){let v=0xffffffff;for(const byte of bytes){v^=byte;for(let bit=0;bit<8;bit++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0;}
function chunk(type,body){const value=Buffer.alloc(body.length+12);value.writeUInt32BE(body.length);value.write(type,4);body.copy(value,8);value.writeUInt32BE(crc32(value.subarray(4,-4)),value.length-4);return value;}
function png(width,height,options={}){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const data=Buffer.alloc((1+width*3)*height);if(options.badFilter)data[0]=5;const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(options.shortData?data.subarray(1):data)),chunk('IEND',Buffer.alloc(0))]);return bytes;}
for(const [caseId,stages] of Object.entries(stagesByCase))for(const stage of stages)test(`exact PNG dimensions for ${caseId}/${stage}`,()=>{const viewport=captureViewport(caseId,stage);assert.deepEqual(validatePng(png(viewport.width,viewport.height),{caseId,stage,viewport}),viewport);});
test('short/mobile/tablet dimensions cannot be interchanged or self-asserted by receipt',()=>{
 const receipt={caseId:'query-refund',stage:'refund-short-keyboard-390',viewport:{width:390,height:480}};
 assert.throws(()=>validatePng(png(390,844),receipt));assert.throws(()=>validatePng(png(390,844),{...receipt,viewport:{width:390,height:844}}));
 assert.throws(()=>validatePng(png(1366,768),{caseId:'retry',stage:'after-refresh',viewport:{width:1366,height:768}}));
 assert.throws(()=>validatePng(png(390,480),{...receipt,caseId:'conflict'}));
 for(const change of [{caseId:'unknown'},{stage:'unknown'},{viewport:{width:390,height:480,extra:true}}])assert.throws(()=>validatePng(png(390,480),{...receipt,...change}));
});
test('all structural CRC/decompression/end/filter gates still reject malformed PNGs',()=>{
 const receipt={caseId:'retry',stage:'after-refresh',viewport:{width:1024,height:768}},bytes=png(1024,768);
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
 for(const bad of [Buffer.from('not PNG'),bytes.subarray(0,-1),Buffer.concat([bytes,Buffer.from([0])]),corrupt,png(1024,768,{badFilter:true}),png(1024,768,{shortData:true})])assert.throws(()=>validatePng(bad,receipt));
});
test('legacy warning/mobile and exact desktop entry points keep their original policy',()=>{
 assert.throws(()=>legacyPng(png(1366,768)));assert.throws(()=>legacyPng(png(1024,768)));assert.throws(()=>legacyPng(png(390,480)));
 assert.deepEqual(legacyPng(png(390,844)),{width:390,height:844});assert.deepEqual(validateTraceDesktopPng(png(1366,768)),{width:1366,height:768});
 assert.throws(()=>validateTraceDesktopPng(png(1024,768)));assert.throws(()=>validateTraceDesktopPng(png(390,844)));
});
test('exact decoder rejects invalid, excessive and mismatched dimensions before acceptance',()=>{for(const viewport of [null,{}, {width:0,height:480},{width:390,height:0},{width:10001,height:480},{width:390,height:20001},{width:390.5,height:480},{width:390,height:NaN},{width:'390',height:480}])assert.throws(()=>validateExactViewportPng(png(390,480),viewport));assert.throws(()=>validateExactViewportPng(png(390,480),{width:391,height:480}));});
test('fixed policy exactly matches the existing native viewport schedule for every capture',()=>{
 const matrix={
  'query-refund':{'unknown-or-conflict':[1366,768],'after-refresh':[1366,768],'original-order-confirmed':[1366,768],'lookup-keyboard-390':[390,844],'refund-open-390':[390,844],'refund-short-keyboard-390':[390,480],'refund-pending-390':[390,844],'refund-complete-390':[390,844]},
  retry:{'unknown-or-conflict':[1024,768],'after-refresh':[1024,768],'original-order-confirmed':[1024,768]},
  conflict:{'unknown-or-conflict':[390,844],'after-refresh':[390,844],'conflict-remains-frozen':[390,844]},
 };
 assert.deepEqual(Object.keys(matrix).sort(),Object.keys(stagesByCase).sort());
 for(const [caseId,stages] of Object.entries(matrix)){assert.deepEqual(Object.keys(stages).sort(),[...stagesByCase[caseId]].sort());for(const [stage,[width,height]] of Object.entries(stages))assert.deepEqual(captureViewport(caseId,stage),{width,height});}
});
