import test from 'node:test';import assert from 'node:assert/strict';import {Worker as NodeWorker} from 'node:worker_threads';
import {loadExtendedImage} from '../src/media-image-source.js';import {disposeSegmentedImage} from '../src/image-sources.js';import {Budget} from '../src/cache.js';
let fault,workerCalls,workerResources,header;const exits=new Set();
class ActualMediaWorker{
 constructor(module){this.worker=new NodeWorker(new URL('./helpers/media-source-samples-worker.mjs',import.meta.url),{workerData:{module:String(module),fault},type:'module',execArgv:[]});this.worker.on('message',data=>{if(data.testCalls)workerCalls=data.testCalls;if(data.testResources)workerResources=data.testResources;if(data.request==='decode-header')header=data.value;this.onmessage?.({data});});this.worker.on('error',error=>this.onerror?.({message:error.message}));}
 addEventListener(){}removeEventListener(){}postMessage(value,transfer){this.worker.postMessage(value,transfer);}
 terminate(){const p=this.worker.terminate();exits.add(p);void p.finally(()=>exits.delete(p));return p;}
}
function bmp(){const b=new Uint8Array(78),v=new DataView(b.buffer);b.set([66,77]);v.setUint32(2,b.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,3,true);v.setInt32(22,2,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,24,true);b.set([30,20,10,60,50,40,90,80,70],54);b.set([120,110,100,150,140,130,180,170,160],66);return new File([b],'sample.bmp');}
const expected=Uint8Array.from([100,110,120,130,140,150,160,170,180,10,20,30,40,50,60,70,80,90]);
for(const optionalFault of [null,'missing','json','oversize','schema','getter'])test('real parent CodecClient: '+(optionalFault??'source facts')+' keeps the historical RGB8 pixels and retires all resources',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=ActualMediaWorker;fault=optionalFault;workerCalls=null;workerResources=null;header=null;const budget=new Budget(256*1024**2);let image;
 try{
  image=await loadExtendedImage(bmp(),{budget,layout:'segmented'});assert.equal(image.segmented,true);assert.equal(image.nativeSurface,undefined);assert.equal(image.workingDepth,8);assert.equal(header.width,3);assert.equal(header.height,2);assert.deepEqual(workerCalls,{ping:1,read:1},'One useful Ping followed by the existing Q8 Read.');
  assert.deepEqual(workerResources,['magick/x86/magick.wasm'],'No high precision codec is loaded for this source8.');
  const p=await image.surface.readWindow({x:0,y:0,width:3,height:2});try{assert.deepEqual(p.pixels.data,expected);}finally{p.release();}
  if(optionalFault){assert.equal(header.sourceSamples,null);assert.equal(header.sourceSamplesLimitation,optionalFault==='missing'?'decoder-source-metadata-unavailable':'decoder-source-metadata-invalid');}
  else{assert.equal(header.sourceSamples.schema,'sherloq.coder-source-samples/1');assert.equal(header.sourceSamples.selection.preferredQuantumDepth,8);assert.equal(header.sourceSamples.selection.preservationQualified,false);assert.equal(header.sourceSamplesLimitation,null);}
  assert.deepEqual(image.provenance.sourceSamples,header.sourceSamples);assert.equal(image.provenance.sourceSamplesLimitation,header.sourceSamplesLimitation);
 }finally{if(image)await disposeSegmentedImage(image);while(exits.size)await Promise.all([...exits]);globalThis.Worker=previous;assert.equal(budget.total(),0);}
});
