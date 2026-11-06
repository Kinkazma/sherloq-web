import test from 'node:test';import assert from 'node:assert/strict';import {Worker as NodeWorker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';import {resolveRecompressionPlan} from '../src/recompression-plan.js';import {recompressSurface,recompressPixels} from '../src/recompression-surface.js';import {disposeRecompressionCodecs,recompressionCodecMemory,recompressionCodecWorkspace} from '../src/recompression-codec-client.js';import {jpegCodec} from '../src/jpeg.js';
import {runRecompressionCodec} from '../src/recompression-codec-client.js';
let createdWorkers=0;const activeWorkers=new Set();
class BrowserWorkerBridge {
 constructor(url){createdWorkers++;this.events=new Map();const code=`import {parentPort} from 'node:worker_threads';import fs from 'node:fs';const originalFetch=globalThis.fetch;globalThis.fetch=async(url,...args)=>String(url).startsWith('file:')?new Response(fs.readFileSync(new URL(url))):originalFetch(url,...args);const queue=[];globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};parentPort.on('message',data=>self.onmessage?self.onmessage({data}):queue.push(data));await import(${JSON.stringify(String(url))});for(const data of queue)self.onmessage({data});`;this.worker=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)),{type:'module'});activeWorkers.add(this.worker);this.worker.on('message',data=>{this.onmessage?.({data});for(const fn of this.events.get('message')??[])fn({data});});this.worker.on('error',error=>this.onerror?.({message:error.message}));this.worker.on('messageerror',error=>{for(const fn of this.events.get('messageerror')??[])fn(error);});}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
 removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
 postMessage(data,transfer){this.worker.postMessage(data,transfer);}
 terminate(){activeWorkers.delete(this.worker);return this.worker.terminate();}
}
globalThis.Worker=BrowserWorkerBridge;
const pixels={width:65,height:67,format:'rgb8',data:Uint8Array.from({length:65*67*3},(_,i)=>(i*31+i%13*11)%256)};
async function plan(codec,lossless=false){return resolveRecompressionPlan({quality:75,recompression:{codec,lossless}},{provenance:{format:'png'}});}
async function read(result){const lease=await result.surface.readWindow({x:0,y:0,width:pixels.width,height:pixels.height});try{return lease.pixels.data.slice();}finally{await lease.release();}}
test('real worker surface is full resolution and stays owned across further recompressions',async()=>{
 const budget=new Budget(512*1024**2),original=pixels.data.slice(),before=createdWorkers;let one,two,three;
 try{one=await recompressSurface({pixels},await plan('png',true),{budget});assert.deepEqual(await read(one),original);assert.equal(one.provenance.recompressionCount,1);assert(recompressionCodecMemory(budget)?.admittedBytes>0);two=await recompressSurface({pixels:{...pixels,data:new Uint8Array(pixels.data.length).fill(23)}},await plan('png',true),{budget});assert.equal(createdWorkers,before+1,'matching codec admission keeps a warm worker');assert((await read(two)).every(v=>v===23));assert.deepEqual(await read(one),original);three=await recompressSurface({pixels},await plan('webp',false),{budget});assert.notDeepEqual(await read(three),original);assert.deepEqual(pixels.data,original);}
 finally{await one?.dispose();await two?.dispose();await three?.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
test('native JPEG surface exactly preserves the registered historical recompressor',async()=>{
 const budget=new Budget(128*1024**2);let result;
 try{result=await recompressSurface({pixels},await plan('jpeg'),{budget});assert.deepEqual(await read(result),(await jpegCodec.recompress(pixels,75)).data);assert.equal(result.provenance.chroma,'420');}
 finally{await result?.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
test('cancellation acknowledges pending transport before retiring output and permits a clean retry',async()=>{
 const budget=new Budget(512*1024**2),controller=new AbortController();let result;
 await assert.rejects(recompressSurface({pixels},await plan('png',true),{budget,signal:controller.signal,onProgress:event=>{if(event.phase==='recompression-prepare')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),0);assert.equal(recompressionCodecMemory(budget),null);
 try{result=await recompressSurface({pixels},await plan('png',true),{budget});assert.deepEqual(await read(result),pixels.data);}finally{await result?.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
test('pixel wrapper returns owned data, original provenance, and an explicit release',async()=>{
 const budget=new Budget(512*1024**2);const result=await recompressPixels(pixels,await plan('png',true),{budget});try{assert.deepEqual(result.pixels.data,pixels.data);assert.equal(result.provenance.codec,'png');assert.equal(result.metrics.recompressions,1);}finally{await result.release();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
test('adaptive preview dimension changes reuse admitted codec capacity without reinitializing Wasm',async()=>{
 const budget=new Budget(512*1024**2),before=createdWorkers;let result;
 try{
  for(const [index,[width,height]]of [[33,31],[257,129],[128,96],[513,257]].entries()){
   const input={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*31+index*7)%256)};
   result=await recompressPixels(input,await plan('png',true),{budget});
   assert.deepEqual(result.pixels.data,input.data);assert.equal(result.provenance.cold,index===0);
   assert.equal(createdWorkers,before+1,'Changing a bounded proxy grid must not reload the codec');
   assert(result.metrics.workingReservationBytes<=budget.total());
   await result.release();result=null;
  }
 }finally{await result?.release();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
test('there is no4MP or encoded-file ceiling; only budget and technical codec admission',async()=>{
 const large=recompressionCodecWorkspace({width:4096,height:2048},{codec:'png',lossless:true});assert(large.workingBytes>0);assert(large.nativeBytes>4*1024**2);const budget=new Budget(1024);await assert.rejects(recompressSurface({pixels},await plan('png',true),{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);assert.equal(recompressionCodecMemory(budget),null);
});
test('a worker startup failure during async output admission rejects without hanging or retaining credit',async()=>{
 const previous=globalThis.Worker,budget=new Budget(512*1024**2);let terminated=false,posts=0,timer;
 globalThis.Worker=class{constructor(){queueMicrotask(()=>this.onerror?.({message:'startup refused'}));}addEventListener(){}removeEventListener(){}postMessage(){posts++;}terminate(){terminated=true;}};
 try{
  const request=runRecompressionCodec({width:33,height:31,stage:{codec:'webp',lossless:false,quality:75}},{budget,onAdmitted:()=>new Promise(resolve=>setImmediate(resolve))});
  await assert.rejects(Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Admission hung after worker startup failure')),1000);})]),{code:'WORKER_FAILED'});
  assert.equal(posts,0);assert.equal(terminated,true);assert.equal(budget.total(),0);assert.equal(recompressionCodecMemory(budget),null);
 }finally{clearTimeout(timer);globalThis.Worker=previous;disposeRecompressionCodecs(budget);}
});
test.after(async()=>{await Promise.allSettled([...activeWorkers].map(worker=>worker.terminate()));});

test('independent selected-codec lanes run true whole contexts and preserve sibling output owners',async()=>{
 const budget=new Budget(512*1024**2),before=createdWorkers,inputs=[pixels,{...pixels,data:new Uint8Array(pixels.data.length).fill(83)}];let results=[];
 try{results=await Promise.all(inputs.map(async(input,codecLane)=>recompressSurface({pixels:input},await plan('png',true),{budget,codecLane,exactCapacity:true})));assert.equal(createdWorkers,before+2);assert.equal(recompressionCodecMemory(budget).workers,2);for(let i=0;i<results.length;i++)assert.deepEqual(await read(results[i]),inputs[i].data);await results[0].dispose();results[0]=null;assert.deepEqual(await read(results[1]),inputs[1].data);}
 finally{for(const result of results)await result?.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});

test('cancelling one codec lane retires its requests without cancelling its sibling',async()=>{
 const budget=new Budget(512*1024**2),abort=new AbortController(),selected=await plan('png',true);const results=await Promise.allSettled([recompressSurface({pixels},selected,{budget,codecLane:0,exactCapacity:true,signal:abort.signal,onProgress:event=>{if(event.phase==='recompression-prepare')abort.abort();}}),recompressSurface({pixels},selected,{budget,codecLane:1,exactCapacity:true})]);
 try{assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'CANCELLED');assert.equal(results[1].status,'fulfilled');assert.deepEqual(await read(results[1].value),pixels.data);assert.equal(recompressionCodecMemory(budget).active,false);}
 finally{if(results[1].status==='fulfilled')await results[1].value.dispose();disposeRecompressionCodecs(budget);}assert.equal(budget.total(),0);
});
