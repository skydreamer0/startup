import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeCameraReceipt, nativeCameraLiteral, prepareNativeCamera } from './package-camera-native.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const valid = () => ({ literal:nativeCameraLiteral,lookupStatus:200,resolveStatus:200,lookupCount:1,resolveCount:1,beforeQuantity:3,afterQuantity:9,revision:2,unitsPerPackage:6,databaseMatched:true,preConfirmationRequests:0,businessUnchanged:true,tracks:[{kind:'video',state:'ended'},{kind:'video',state:'ended'}],mediaCalls:3,audioRequested:false,cancelPreserved:true,denialPreserved:true,consumedChoiceRemoved:true,repeatedActivations:2,requestStarts:[{method:'GET'},{method:'POST'}],phaseBoundaries:['open','permission-denial','stream-cancel','capture','confirmation','handoff'].map(phase=>({phase,initiated:0})),lookupSha256:'a'.repeat(64),resolveSha256:'b'.repeat(64) });
test('accepts bounded native camera receipt',()=>assert.doesNotThrow(()=>assertNativeCameraReceipt(valid())));
for(const [field,value] of Object.entries({literal:'00Case-390',lookupStatus:403,resolveStatus:409,lookupCount:0,resolveCount:2,beforeQuantity:0,afterQuantity:15,revision:1,unitsPerPackage:3,databaseMatched:false,preConfirmationRequests:1,businessUnchanged:false,tracks:[{kind:'video',state:'live'}],mediaCalls:0,audioRequested:true,cancelPreserved:false,denialPreserved:false,consumedChoiceRemoved:false,repeatedActivations:0,requestStarts:[],phaseBoundaries:[{phase:'open',initiated:1}],lookupSha256:'',resolveSha256:''})) {
  test(`rejects invalid ${field}`,()=>assert.throws(()=>assertNativeCameraReceipt({...valid(),[field]:value})));
}
test('real pinned writer produces owned Y4M decodable by pinned reader',async()=>{
 const requirePos=createRequire(new URL('../../pos-ui/package.json',import.meta.url));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'camera-native-'));
 try {
  const receipt=await prepareNativeCamera(dir,requirePos), bytes=fs.readFileSync(receipt.file);
  assert.equal(receipt.literal,nativeCameraLiteral); assert.equal(receipt.physicalCamera,false);
  await assert.rejects(prepareNativeCamera(dir,requirePos),/EEXIST/);
  const header=Buffer.from('YUV4MPEG2 W480 H480 F30:1 Ip A1:1 C420jpeg\nFRAME\n'); assert.deepEqual(bytes.subarray(0,header.length),header);
  const rgba=new Uint8ClampedArray(480*480*4);
  for(let i=0;i<480*480;i++){const v=bytes[header.length+i];rgba.set([v,v,v,255],i*4);}
  const reader=requirePos('zxing-wasm/reader');
  await reader.prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(requirePos.resolve('zxing-wasm/reader/zxing_reader.wasm'))},fireImmediately:true});
  const decoded=await reader.readBarcodes({data:rgba,width:480,height:480},{formats:['QRCode']});
  assert.equal(decoded.length,1);assert.equal(decoded[0].text,nativeCameraLiteral);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
