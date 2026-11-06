import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createEngine} from '../src/index.js';
import {imageCodec} from '../src/codecs.js';
import {jpegHeader,readTiff,tiffImageHeader} from '../src/image-headers.js';
import {extendedImageFormat,sourceImageFormat,isoChroma,webpChroma} from '../src/media-format.js';
import {EngineError,requireValue,serializeEngineError,deserializeEngineError} from '../src/errors.js';

function tiff({photo=5,samples=4,depth=8,bits=new Array(samples).fill(depth),inkSet=1,inks=4,extra=false,sampleFormat=1,compression=1,orientation=1,planar=1,predictor=1,fill=1,duplicate=false}={}){
 const entries=[[256,4,[2]],[257,4,[2]],[258,3,bits],[259,3,[compression]],[262,3,[photo]],[266,3,[fill]],[273,4,[0]],[274,3,[orientation]],[277,3,[samples]],[278,4,[2]],[279,4,[4*samples*depth/8]],[284,3,[planar]],[317,3,[predictor]],[339,3,[sampleFormat]]];if(inkSet!==null)entries.push([332,3,[inkSet]]);if(inks!==null)entries.push([334,3,[inks]]);if(extra)entries.push([338,3,[1]]);if(duplicate)entries.push([277,3,[samples]]);entries.sort((a,b)=>a[0]-b[0]);let end=8+2+entries.length*12+4;const offsets=entries.map(([,type,values])=>{const bytes=values.length*(type===3?2:4);if(bytes<=4)return null;const at=end;end+=bytes;return at;});entries.find(e=>e[0]===273)[2][0]=end;const bytes=new Uint8Array(end+4*samples*depth/8),view=new DataView(bytes.buffer);bytes.set([73,73,42,0,8,0,0,0]);view.setUint16(8,entries.length,true);entries.forEach(([tag,type,values],i)=>{const at=10+i*12;view.setUint16(at,tag,true);view.setUint16(at+2,type,true);view.setUint32(at+4,values.length,true);const pos=offsets[i]??at+8;if(offsets[i]!==null)view.setUint32(at+8,pos,true);values.forEach((n,j)=>type===3?view.setUint16(pos+j*2,n,true):view.setUint32(pos+j*4,n,true));});return bytes;
}
async function withImportProbes(run){
 const old=Object.getOwnPropertyDescriptor(globalThis,'Worker'),decode=imageCodec.decode,workers=[];
 class ProbeWorker{constructor(url){this.url=String(url);this.closed=false;workers.push(this);}addEventListener(){}removeEventListener(){}postMessage(message){this.action=message.action;queueMicrotask(()=>this.onmessage?.({data:{error:{name:'EngineError',code:'TIFF_MANAGED_PROVIDER_PROBE',message:'Existing managed TIFF decode reached.'}}}));}terminate(){this.closed=true;}}
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:ProbeWorker});imageCodec.decode=async()=>{throw new EngineError('LEGACY_TIFF_PROVIDER_PROBE','Historical RGB/gray/palette decoder reached.');};
 try{await run(workers);}finally{imageCodec.decode=decode;if(old)Object.defineProperty(globalThis,'Worker',old);else delete globalThis.Worker;}
}
test('Standard CMYK TIFF8/16 imports route through the existing managed provider and failed imports retain nothing',async()=>{
 await withImportProbes(async workers=>{for(const options of [{depth:8},{depth:16},{depth:16,planar:2},{compression:5},{compression:8},{compression:32946},{compression:32773},{inkSet:null,inks:null}]){const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});try{const before=workers.length;await assert.rejects(engine.loadBlob({id:'cmyk',blob:new Blob([tiff(options)])}),{code:'TIFF_MANAGED_PROVIDER_PROBE'});assert.equal(workers.length,before+1);assert.ok(workers.at(-1).url.endsWith('/media-codec-worker.js'));assert.equal(workers.at(-1).action,'decode');assert.equal(workers.at(-1).closed,true);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);assert.throws(()=>engine.original('cmyk'),{code:'NOT_FOUND'});}finally{await engine.dispose();}}});
});
test('Custom inks, alpha, signed/float depth, unsupported TIFF compression and historical orientation restrictions remain refused',async()=>{
 await withImportProbes(async workers=>{for(const options of [{inkSet:2},{inks:3},{extra:true},{sampleFormat:2},{sampleFormat:3},{samples:3},{bits:[8,8,8,16]},{compression:2},{compression:4},{compression:7},{compression:999},{orientation:6},{predictor:3},{fill:2},{duplicate:true}]){const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});try{const before=workers.length;await assert.rejects(engine.loadBlob({id:'bad',blob:new Blob([tiff(options)])}),{code:'UNSUPPORTED_FORMAT'});assert.equal(workers.length,before,JSON.stringify(options));assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);}finally{await engine.dispose();}}});
});
test('Existing RGB, grayscale, palette and RGBA TIFF still use the historical decoder',async()=>{
 await withImportProbes(async workers=>{for(const options of [{photo:2,samples:3},{photo:1,samples:1},{photo:0,samples:1},{photo:3,samples:1},{photo:2,samples:4,extra:true}]){const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});try{const before=workers.length;await assert.rejects(engine.loadBlob({id:'old',blob:new Blob([tiff(options)])}),{code:'LEGACY_TIFF_PROVIDER_PROBE'});assert.equal(workers.length,before);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();}}});
});

async function runMediaWorker(bytes,{profile=false,sourceCode}={}){
 const source=sourceCode??await readFile(new URL('../src/media-codec-worker.js',import.meta.url),'utf8'),events=[],conversions=[],verified=[];
 const image={width:2,height:2,hasAlpha:false,colorSpace:'CMYK',autoOrient(){},getColorProfile:()=>profile?{}:null,getAttribute:()=>null,transformColorSpace(){conversions.push('profile');this.colorSpace='sRGB';},getPixels:callback=>callback({toByteArray:(x,y,w,h,map)=>{assert.equal(map,'RGB');conversions.push('RGB-band');return Uint8Array.from({length:w*h*3},(_,i)=>[11,22,33][i%3]);}})};
 let colour=image.colorSpace;Object.defineProperty(image,'colorSpace',{get:()=>colour,set:value=>{colour=value;conversions.push(value);}});
 const magick={ResourceLimits:{},MagickReadSettings:class{constructor(values){Object.assign(this,values);}},MagickFormat:{TIFF:'TIFF'},MagickImageInfo:{create:()=>({width:2,height:2,orientation:1})},ColorSpace:{sRGB:'sRGB'},ColorProfile:class{},ImageMagick:{read:async(_bytes,_settings,fn)=>fn(image)}};
 const self={postMessage(message){events.push(message);if(message.request){const value=message.request==='decode-header'?{nativeBytes:128*1024**2,retainOriginal:false}:{};queueMicrotask(()=>self.onmessage({data:{reply:message.sequence,value}}));}}};
 const context=vm.createContext({self,mockMagick:magick,Uint8Array,Uint16Array,ArrayBuffer,Blob,BigInt,Map,Error,TextDecoder,TextEncoder,URL,queueMicrotask,jpegHeader,readTiff,tiffImageHeader,extendedImageFormat,sourceImageFormat,isoChroma,webpChroma,EngineError,requireValue,serializeEngineError,deserializeEngineError,createSHA256:()=>{throw Error('Unused identity branch');},captureOwnedSourcePrefixIntegrity:async value=>({manifest:{byteLength:value.length,sha256:'a'.repeat(64)}}),readVerifiedMediaResource:async id=>{verified.push(id);return new Uint8Array(4);}});
 const withoutImports=source.replace(/^import .*;\n/gm,''),start=withoutImports.indexOf('async function magick(){'),end=withoutImports.indexOf('async function decode(',start),code=withoutImports.slice(0,start)+'async function magick(){return mockMagick;}\n'+withoutImports.slice(end);vm.runInContext(code,context);
 await self.onmessage({data:{action:'decode',payload:{blob:new Blob([bytes]),name:'original.tif'}}});const error=events.find(event=>event.error);assert.equal(error,undefined,error?.error?.message);return{events,conversions,verified,result:events.find(event=>event.done)?.value,header:events.find(event=>event.request==='decode-header')?.value};
}
test('Managed TIFF records original CMYK depth and converts only its display bands to RGB8',async()=>{
 for(const depth of [8,16]){const output=await runMediaWorker(tiff({depth}));assert.equal(output.header.sourceColorSpace,'CMYK');assert.equal(output.header.depth,depth);assert.equal(output.result.provenance.sourceColorSpace,'CMYK');assert.equal(output.result.provenance.sourceChannels,4);assert.equal(output.result.provenance.sourceDepth,depth);assert.equal(output.result.provenance.analysisDepth,8);assert.deepEqual(output.conversions,['sRGB','RGB-band']);assert.deepEqual(output.verified,[]);assert.deepEqual(Array.from(output.events.find(e=>e.request==='decoded-band').value.bytes),[11,22,33,11,22,33,11,22,33,11,22,33]);}
});
test('Managed TIFF with a profile uses the existing verified sRGB resource and colour transform once',async()=>{
 const output=await runMediaWorker(tiff(),{profile:true});assert.deepEqual(output.verified,['srgb']);assert.deepEqual(output.conversions,['profile','sRGB','RGB-band']);assert.equal(output.result.provenance.icc,'converted to sRGB');assert.equal(output.result.provenance.colorConversion,'embedded CMYK ICC to sRGB');
});
test('Ordinary managed formats retain the same worker messages and conversions as before this TIFF-only change',async()=>{
 const baseline=process.env.SHERLOQ_TIFF_WORKER_BASELINE?await readFile(process.env.SHERLOQ_TIFF_WORKER_BASELINE,'utf8'):null;
 // The private pre-change source is used only when available; the invariant
 // below always checks that non-CMYK TIFF receives no new colour metadata.
 const output=await runMediaWorker(tiff({photo:2,samples:3}));assert.equal(output.result.provenance.sourceColorSpace,undefined);assert.equal(output.result.provenance.sourceChannels,undefined);assert.deepEqual(output.conversions,['RGB-band']);
 if(baseline){const before=await runMediaWorker(tiff({photo:2,samples:3}),{sourceCode:baseline});assert.deepEqual(structuredClone(output.result.provenance),structuredClone(before.result.provenance));assert.deepEqual(structuredClone(output.header),structuredClone(before.header));assert.deepEqual(output.conversions,before.conversions);}
});
