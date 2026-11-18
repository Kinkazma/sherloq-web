import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeCameraRaw,inspectCameraRaw,nativeRawMemoryPlan,nativeRawProcessing} from '../src/raw-codec-runtime.js';
import createModule from '../vendor/libraw-native/libraw-native.js';
const data=await fs.readFile(new URL('./fixtures/raw16/native16-cfa.dng',import.meta.url)),wasm=await fs.readFile(new URL('../vendor/libraw-native/libraw-native.wasm',import.meta.url));
const payload=()=>({blob:new Blob([data]),maximumMemoryBytes:128*1024**2});
const resource={readResource:async()=>wasm};
async function decode(p=payload(),extra={}){const bands=[],sensor=[];let header;const result=await decodeCameraRaw(p,{...resource,onHeader(h){header=h;},onBand(b){bands.push(b.bytes);},onSensorBand(b){sensor.push(b.bytes);},...extra});return{...result,header,bytes:Buffer.concat(bands),sensorBytes:Buffer.concat(sensor)};}
test('native RAW policy is explicit and covers 100 MP without an artificial pixel limit',()=>{
 assert.equal(nativeRawProcessing().workingColorSpace,'prophoto-d65-linear');assert.throws(()=>nativeRawProcessing({halfSize:true}),/Unknown/);assert.throws(()=>nativeRawProcessing({workingColorSpace:'xyz'}),/Invalid/);
 const plan=nativeRawMemoryPlan({rawWidth:10000,rawHeight:10000,sourceWidth:10000,sourceHeight:10000,flip:0},64*1024**2);assert.ok(plan.heapMaximumBytes<2*1024**3);assert.ok(plan.maximumRgbBandBytes<=1024**2);assert.equal(plan.decodedNativeBytes,600000000);
});
test('actual LibRaw WASM develops native RGB16 and preserves unchanged sensor samples',async()=>{
 const d=await decode({...payload(),includeSensor:true});assert.equal(d.header.width,128);assert.equal(d.header.height,96);assert.equal(d.bytes.length,128*96*6);assert.equal(d.header.analysisDepth,16);assert.equal(d.header.thumbnailUsed,false);assert.equal(d.provenance.autoBright,false);assert.equal(d.header.workingProfileBytes.length,496);
 assert.equal(createHash('sha256').update(d.bytes).digest('hex'),'b76c09bbf1971775732133b07470426c038d15c47cca10a1a85f2997fe45cb69');
 const sensor=new Uint16Array(d.sensorBytes.buffer,d.sensorBytes.byteOffset,d.sensorBytes.length/2);for(let y=0;y<96;y++)for(let x=0;x<128;x++)assert.equal(sensor[y*128+x],64+(x*17+y*11+(x*y)%31)%4000);
 const pixels=new Uint16Array(d.bytes.buffer,d.bytes.byteOffset,d.bytes.length/2);assert.ok(pixels.filter(n=>n%257!==0).length>36000,'Real low-order information must survive; RGB8 promotion is insufficient.');assert.ok(d.metrics.maximumBandBytes<=1024**2);
});
function orientation(bytes,value){const out=Buffer.from(bytes),view=new DataView(out.buffer,out.byteOffset,out.length),ifd=view.getUint32(4,true),entries=view.getUint16(ifd,true);for(let n=0;n<entries;n++){const o=ifd+2+n*12;if(view.getUint16(o,true)===274){view.setUint16(o+8,value,true);return out;}}throw Error('Fixture orientation tag missing.');}
test('oriented RGB16 row streaming follows all eight TIFF orientations exactly',async()=>{
 const original=await decode(),base=new Uint16Array(original.bytes.buffer,original.bytes.byteOffset,original.bytes.length/2);const flips=[0,1,3,2,4,6,7,5];
 for(let exif=1;exif<=8;exif++){const d=await decode({...payload(),blob:new Blob([orientation(data,exif)])}),a=new Uint16Array(d.bytes.buffer,d.bytes.byteOffset,d.bytes.length/2),flip=flips[exif-1],w=flip&4?96:128,h=flip&4?128:96;assert.equal(d.header.width,w);assert.equal(d.header.height,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sx=x,sy=y;if(flip&4)[sx,sy]=[sy,sx];if(flip&2)sy=95-sy;if(flip&1)sx=127-sx;for(let c=0;c<3;c++)assert.equal(a[(y*w+x)*3+c],base[(sy*128+sx)*3+c],`orientation ${exif}, ${x},${y},${c}`);}}
});
test('RAW identity and budget errors reject before instantiating a decoder',async()=>{
 let creates=0;const hooks={...resource,moduleFactory:async()=>{creates++;throw Error('Should not instantiate.');}};
 await assert.rejects(inspectCameraRaw({...payload(),sourceSha256:'0'.repeat(64)},hooks),e=>e.code==='SOURCE_CHANGED');await assert.rejects(inspectCameraRaw({...payload(),maximumMemoryBytes:1},hooks),e=>e.code==='INVALID_INPUT');assert.equal(creates,0);
});
test('aborted streamed RAW always closes and releases encoded and staging owners',async()=>{
 const controller=new AbortController();let closes=0,frees=0;const moduleFactory=async config=>{const m=await createModule(config);return new Proxy(m,{get(target,key){if(key==='_raw_native_close')return()=>{closes++;return target[key]();};if(key==='_free')return p=>{frees++;return target[key](p);};return target[key];}});};
 await assert.rejects(decode(payload(),{moduleFactory,signal:controller.signal,onBand(){controller.abort();}}),e=>e.code==='CANCELLED');assert.equal(closes,1);assert.equal(frees,2);
});
test('LibRaw header inspection provides a separate conservative admission plan',async()=>{const h=await inspectCameraRaw(payload(),resource);assert.equal(h.previewUsed,false);assert.equal(h.width,128);assert.equal(h.height,96);assert.ok(h.memoryPlan.heapMaximumBytes>=64*1024**2);assert.match(h.sourceSha256,/^[0-9a-f]{64}$/);});
