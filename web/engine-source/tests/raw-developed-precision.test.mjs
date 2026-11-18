import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeRawNativeImport} from '../src/native-color-import.js';
import {createRgb16Bank} from '../src/rgb16-surface.js';
import {describeSourcePrecision} from '../src/source-precision.js';
import {Budget} from '../src/cache.js';
const MiB=1024**2,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=await readFile(new URL('../vendor/libraw-native/libraw-native.wasm',import.meta.url)),color=await readFile(new URL('../vendor/color-managed-native/color-managed-native.wasm',import.meta.url));
// These are complete developed RGB16 oracles from the previous pinned LibRaw
// default processing, not the sensor payload and not promoted SDR8 pixels.
for(const [name,codedDepth,oracle] of [
 ['sensor-float32.dng',32,'cf1f375366ac9e4174b9772a579756d65ea839f0a857730529df8035610e1b9a'],
 ['sensor-uint16-margins.dng',16,'d6fd23fdc5b9847b57629529f580eaee1fda73f2689a1b058988be0012250f76']
])test('RAW '+codedDepth+' coded precision stays separate from its developed RGB16 bank',async()=>{
 const bytes=await readFile(new URL('./fixtures/raw16/'+name,import.meta.url)),budget=new Budget(512*MiB),encodedFee=budget.reserve(bytes.length*3+64*MiB),previews=[];let bank,codecFee,header,result;
 try{
  result=await decodeRawNativeImport({blob:new Blob([bytes]),sourceSha256:sha(bytes),colorBackend:'cpu'},{readResource:async()=>raw,colorResource:async()=>color,onPreview:value=>previews.push(value),request:async(action,value)=>{
   if(action==='decode-header'){
    header=value;assert.equal(header.sourceDepth,codedDepth);assert.equal(header.codedDepth,codedDepth);assert.equal(header.sourceSampleType,'unknown');assert.equal(header.nativeSampleDepth,16);assert.equal(header.nativeSampleType,'uint16');assert.equal(header.nativeSampleRole,'developed');codecFee=budget.reserve(value.codecMemoryBytes);
    assert.equal(value.deferBanks,true);assert.equal(bank,undefined);return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='decode-residency'){
    assert.equal(value.rawGeometry.owner,'libraw-developed-frame/1');assert.equal(bank,undefined);
    const {width,height}=value.rawGeometry;
    bank=await createRgb16Bank({width,height,sourceDepth:header.nativeSampleDepth,budget});return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='decoded-native-band')await bank.writeBand({...value,data:value.bytes});else assert.equal(action,'decoded-band');return{};
  }});
  const surface=await bank.seal(),window=await surface.readWindow();try{assert.equal(sha(new Uint8Array(window.pixels.data.buffer,window.pixels.data.byteOffset,window.pixels.data.byteLength)),oracle);}finally{window.release();}
  const precision=describeSourcePrecision({header,provenance:result.provenance,nativeSurface:surface.descriptor});assert.equal(precision.coded.depth,codedDepth);assert.equal(precision.coded.sampleType,'unknown');assert.equal(precision.decoded.containerBits,16);assert.equal(precision.decoded.role,'developed');assert.equal(precision.defaultWorkingDepth,16);assert.equal(result.provenance.sourceBitDepth,codedDepth);assert.equal(result.provenance.nativeSampleDepth,16);assert.ok(previews.length>0);assert.equal(previews[0].pixels.format,'rgb8');
 }finally{await bank?.dispose();codecFee?.();encodedFee();assert.equal(budget.total(),0);}
});
