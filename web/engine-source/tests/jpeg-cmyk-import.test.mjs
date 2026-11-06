import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jpegHeader,jpegNeedsManagedColor} from '../src/image-headers.js';
import {inspectJpeg,inspectJpegBlob} from '../src/jpeg.js';

const segment=(marker,payload)=>[255,marker,(payload.length+2)>>8,(payload.length+2)&255,...payload];
const adobe=value=>segment(0xee,[65,100,111,98,101,0,100,0,0,0,0,value]);
function header({channels=4,transform=2,precision=8,marker=0xc0,duplicate}={}){
 const frame=[precision,0,13,0,17,channels,...Array.from({length:channels},(_,i)=>[i+1,17,0]).flat()];
 return Uint8Array.from([255,216,...(transform===null?[]:adobe(transform)),...(duplicate===undefined?[]:adobe(duplicate)),...segment(marker,frame),255,218,0,2,0,255,217]);
}
const source=bytes=>({byteLength:bytes.length,reads:[],releases:0,async read(offset,length){this.reads.push([offset,length]);assert.ok(offset>=0&&offset+length<=bytes.length);return{bytes:bytes.slice(offset,offset+length),release:()=>this.releases++};}});

test('CMYK and YCCK are import-only headers, never silently native YCbCr',()=>{
 for(const transform of [null,0,2]){
  const bytes=header({transform});assert.throws(()=>jpegHeader(bytes),{code:'UNSUPPORTED_FORMAT'});assert.throws(()=>inspectJpeg(bytes),{code:'UNSUPPORTED_FORMAT'});
  const h=jpegHeader(bytes,{allowCmyk:true});assert.equal(h.channels,4);assert.equal(h.depth,8);assert.equal(h.width,17);assert.equal(h.height,13);assert.equal(h.sourceColorSpace,transform===2?'YCCK':'CMYK');assert.equal(h.nativeJpegVerified,false);assert.equal(h.chroma,null);assert.equal(jpegNeedsManagedColor(bytes),true);
 }
});
test('import support retains the original verified process and precision boundary',()=>{
 for(const input of [{precision:12},{marker:0xc3},{marker:0xc1},{channels:2},{channels:5},{transform:1},{transform:3},{duplicate:0}])assert.throws(()=>jpegHeader(header(input),{allowCmyk:true}),{code:'UNSUPPORTED_FORMAT'});
 assert.equal(jpegHeader(header({marker:0xc2}),{allowCmyk:true}).progressive,true);
});
test('normal JPEG headers have exactly the same shape with either import option',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('./data/recompression-segmented.jpg',import.meta.url)));
 assert.deepEqual(jpegHeader(bytes,{allowCmyk:true}),jpegHeader(bytes));assert.equal(jpegNeedsManagedColor(bytes),false);
 const gray=header({channels:1,transform:null});assert.deepEqual(jpegHeader(gray,{allowCmyk:true}),jpegHeader(gray));assert.equal(jpegNeedsManagedColor(gray),false);
 // Keep historical RGB metadata parsing independent of an irrelevant APP14 conflict.
 assert.equal(jpegHeader(header({channels:3,duplicate:0})).channels,3);
});
test('managed decode classification follows bytes and never a filename',()=>{
 assert.equal(jpegNeedsManagedColor(Uint8Array.of(137,80,78,71,13,10,26,10)),false);assert.equal(jpegNeedsManagedColor(new Uint8Array()),false);
 assert.throws(()=>jpegNeedsManagedColor(Uint8Array.of(255,216,255,217)),{code:'INVALID_INPUT'});
});
test('Blob prefix inspection opts into CMYK only for an explicit importer',async()=>{
 const bytes=header(),strict=source(bytes);await assert.rejects(inspectJpegBlob(strict),{code:'UNSUPPORTED_FORMAT'});assert.equal(strict.reads.length,strict.releases);
 const allowed=source(bytes),h=await inspectJpegBlob(allowed,{allowCmyk:true});assert.equal(h.sourceColorSpace,'YCCK');assert.equal(allowed.reads.length,allowed.releases);assert.ok(allowed.reads.every(([at,n])=>at+n<bytes.length));
});
test('JPEG import header cancellation releases all leased ranges',async()=>{
 const bytes=header(),input=source(bytes),abort=new AbortController();abort.abort();await assert.rejects(inspectJpegBlob(input,{allowCmyk:true,signal:abort.signal}),{code:'CANCELLED'});assert.equal(input.reads.length,input.releases);
});

test('the shared segmented and M2 import dispatch CMYK through the managed provider and retain no failed source',async()=>{
 const {Budget}=await import('../src/cache.js');const {loadSegmentedJpeg,loadM2SegmentedOriginal}=await import('../src/image-sources.js');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker'),seen=[];
 class ManagedProbeWorker{
  constructor(url){this.url=String(url);this.closed=false;}
  addEventListener(){}removeEventListener(){}
  postMessage(message){seen.push({url:this.url,action:message.action,blob:message.payload?.blob});queueMicrotask(()=>this.onmessage?.({data:{error:{name:'EngineError',code:'IMPORT_PROVIDER_PROBE',message:'Managed decode reached without native color reinterpretation.'}}}));}
  terminate(){this.closed=true;}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:ManagedProbeWorker});
 try{for(const load of[loadSegmentedJpeg,loadM2SegmentedOriginal]){const budget=new Budget(128*1024**2),blob=new Blob([header()]);await assert.rejects(load(blob,{budget}),{code:'IMPORT_PROVIDER_PROBE'});assert.equal(budget.total(),0,'Failed managed decode must return every source/header reservation');}}
 finally{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;}
 assert.equal(seen.length,2);assert.ok(seen.every(x=>x.url.endsWith('/media-codec-worker.js')&&x.action==='decode'&&x.blob instanceof Blob));
});
