import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NativeWorker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {createRgb16Bank} from '../src/rgb16-surface.js';
import {segmentedFrequency} from '../src/segmented-frequency.js';
const active=new Set();
class BrowserWorkerBridge{
 constructor(url){this.events=new Map();const code=`import {parentPort} from 'node:worker_threads';const queue=[];globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};parentPort.on('message',data=>self.onmessage?self.onmessage({data}):queue.push(data));await import(${JSON.stringify(String(url))});for(const data of queue)self.onmessage({data});`;this.worker=new NativeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)),{type:'module'});active.add(this.worker);this.worker.on('message',data=>{this.onmessage?.({data});for(const callback of this.events.get('message')??[])callback({data});});this.worker.on('error',error=>this.onerror?.({message:error.message}));}
 addEventListener(type,callback){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(callback);}
 removeEventListener(type,callback){this.events.get(type)?.delete(callback);}
 postMessage(value,transfer){this.worker.postMessage(value,transfer);}
 terminate(){const termination=this.worker.terminate();active.delete(this.worker);return termination;}
}
const frames=r=>[r.surface,...Object.values(r.rgbRecords).map(v=>v.surface)];
const release=r=>Promise.all([...frames(r),r.tableRecords.mask.surface].map(v=>v.dispose()));
const parallelProfile={maxWorkers:3,workerFactory:()=>new BrowserWorkerBridge(new URL('../src/frequency-strip-worker.js',import.meta.url))};
test('real worker reconstruction preserves global stripe rounding and retires native16 endpoints',async()=>{
 const width=337,height=331,budget=new Budget(256*1024**2),bank=await createRgb16Bank({width,height,budget,sourceDepth:12}),data=Uint16Array.from({length:width*height*3},(_,i)=>(i*1511+Math.floor(i/31)*137)%65536);await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),image={surface},params={split:15,smooth:3,threshold:20,filter:2};let local,parallel;
 try{local=await segmentedFrequency(image,params,{budget,blockPixels:4096});parallel=await segmentedFrequency(image,params,{budget,blockPixels:4096,profile:parallelProfile});assert.ok(parallel.metrics.workers>1);assert.ok(parallel.metrics.completedStripJobs>100);assert.ok(parallel.metrics.basePolarStripJobs>1);assert.equal(parallel.metrics.baseNormalizeStripJobs,parallel.metrics.basePolarStripJobs);assert.equal(parallel.metrics.fusedInverseMagnitude,true);assert.equal(parallel.metrics.reconstructionPolarStripJobs,2*Math.ceil(parallel.data.frequencyDimensions[0]/Math.floor(parallel.metrics.blockPixels/parallel.data.frequencyDimensions[1])));assert.equal(parallel.data.zeroPercent,local.data.zeroPercent);assert.ok(parallel.data.frequencyDimensions[0]*parallel.data.frequencyDimensions[1]>98304,'multiple native64K magnitude stripes');
  for(let i=0;i<4;i++){const a=await frames(local)[i].readWindow(),b=await frames(parallel)[i].readWindow();try{assert.deepEqual(b.pixels.data,a.pixels.data,'parallel frame'+i);}finally{a.release();b.release();}}
  await release(local);await local.frequencyCache.dispose();local=null;await release(parallel);await parallel.frequencyCache.dispose();parallel=null;assert.equal(active.size,0);assert.equal(budget.total(),data.byteLength);
 }finally{for(const r of[local,parallel])if(r){await release(r);await r.frequencyCache.dispose();}await bank.dispose();await Promise.all([...active].map(worker=>worker.terminate()));active.clear();}assert.equal(budget.total(),0);
});
test('native16 reconstruction cancellation drains real worker jobs before returning',async()=>{
 const width=137,height=131,budget=new Budget(128*1024**2),bank=await createRgb16Bank({width,height,budget,sourceDepth:10}),data=Uint16Array.from({length:width*height*3},(_,i)=>(i*511)%65536);await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),baseline=budget.total(),controller=new AbortController();
 try{await assert.rejects(segmentedFrequency({surface},{smooth:0},{budget,blockPixels:1024,profile:parallelProfile,signal:controller.signal,onProgress:event=>{if(event.phase==='frequency-reconstruction')controller.abort();}}),{code:'CANCELLED'});assert.equal(active.size,0);assert.equal(budget.total(),baseline);const part=await surface.readWindow();try{assert.deepEqual(part.pixels.data,data);}finally{part.release();}}finally{await bank.dispose();await Promise.all([...active].map(worker=>worker.terminate()));active.clear();}assert.equal(budget.total(),0);
});

for(const stopPhase of ['frequency-polar-analysis','frequency-polar'])test(`native16 ${stopPhase} cancellation drains worker extrema/normalization`,async()=>{
 const width=137,height=131,budget=new Budget(128*1024**2),bank=await createRgb16Bank({width,height,budget,sourceDepth:14}),data=Uint16Array.from({length:width*height*3},(_,i)=>(i*353)%65536);await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),baseline=budget.total(),controller=new AbortController();
 try{await assert.rejects(segmentedFrequency({surface},{smooth:0},{budget,blockPixels:1024,profile:parallelProfile,signal:controller.signal,onProgress:event=>{if(event.phase===stopPhase)controller.abort();}}),{code:'CANCELLED'});assert.equal(active.size,0);assert.equal(budget.total(),baseline);const part=await surface.readWindow();try{assert.deepEqual(part.pixels.data,data);}finally{part.release();}}finally{await bank.dispose();await Promise.all([...active].map(worker=>worker.terminate()));active.clear();}assert.equal(budget.total(),0);
});
