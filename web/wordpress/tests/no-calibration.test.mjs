import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Budget} from '../sherloq-browser/assets/engine/src/cache.js';
import {EngineError,checkAbort} from '../sherloq-browser/assets/engine/src/errors.js';
import {fusedCpu,toneTable} from '../sherloq-browser/assets/engine/src/ela-lut.js';
const source=(await readFile(new URL('../sherloq-browser/assets/engine/src/lut-pool.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export class LutPool','globalThis.LutPool=class LutPool').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
const params={quality:75,scale:51,contrast:20,linear:false,grayscale:true};
const table=await toneTable(params);
function harness({cores=8,budget=128*1024**2,failOnce=false,failSetup=false,slow=false,pressure=false,noWorker=false}={}){
 let tick=0,created=0,executed=0,main=0,failed=false,tableCalls=0;const live=new Set();
 const memory={usedJSHeapSize:0,jsHeapSizeLimit:100};
 class Worker{
  constructor(){created++;if(failSetup)throw new Error('Allocation failed');live.add(this);}
  terminate(){this.dead=true;live.delete(this);}
  postMessage(message,transfer=[]){const data=structuredClone(message,{transfer});queueMicrotask(async()=>{
   if(this.dead)return;
   if(data.table){this.table=data.table;tableCalls++;this.onmessage({data:{ready:true}});return;}
   executed+=data.a.length/3;
   if(failOnce&&!failed){failed=true;this.onmessage({data:{error:'MEMORY_LIMIT'}});return;}
   const result=await fusedCpu(data.a,data.b,data.params,this.table);
   tick+=slow&&executed>1048576?1000:1;if(pressure)memory.usedJSHeapSize=90;
   if(!this.dead)this.onmessage({data:{result}});
  });}
 }
 const context=vm.createContext({URL,Uint8Array,EngineError,checkAbort,performance:{now:()=>tick,memory},navigator:{hardwareConcurrency:cores},fusedCpu:async(...args)=>{main+=args[0].length/3;return fusedCpu(...args);},...(noWorker?{}:{Worker})});
 new vm.Script(source).runInContext(context);
 const memoryBudget=new Budget(budget),pool=new context.LutPool(memoryBudget,{maxWorkers:cores});
 return{pool,memoryBudget,get executed(){return executed;},get main(){return main;},get created(){return created;},get live(){return live.size;},get tableCalls(){return tableCalls;}};
}
const pixels=n=>Uint8Array.from({length:n*3},(_,i)=>(i*13+(i>>>7))&255);
const a=pixels(1048583),b=a.map(x=>255-x);
test('cold and fresh sessions start at hardware concurrency; every input pixel computed once, no baseline/warm-up',async()=>{
 const expected=await fusedCpu(a,b,params,table);
 for(let visit=0;visit<2;visit++){
  const h=harness();assert.equal(h.executed,0);assert.equal(h.created,0);
  const r=await h.pool.run(a,b,params,table);
  assert.deepEqual(r.data,expected);assert.equal(r.scheduling.initialWorkers,8);assert.equal(r.calibration,null);assert.equal(r.scheduling.calibrationMs,0);
  assert.equal(h.executed,a.length/3);assert.equal(h.main,0);assert.equal(r.scheduling.retriedPixels,0);assert.equal(r.scheduling.processedPixels,a.length/3);
  h.pool.dispose();assert.equal(h.memoryBudget.retained,0);assert.equal(h.live,0);
 }
});
test('shared budget bounds first concurrency, API absence uses exact serial kernel',async()=>{
 for(const options of [{budget:12*1024**2},{noWorker:true}]){
  const h=harness(options),r=await h.pool.run(a,b,params,table);
  assert.equal(r.scheduling.initialWorkers,options.noWorker?1:3);assert.ok(h.memoryBudget.peak<=h.memoryBudget.limit);assert.deepEqual(r.data,await fusedCpu(a,b,params,table));h.pool.dispose();
 }
});
test('failed useful chunk is retried; successful chunks are kept; concurrency halves',async()=>{
 const h=harness({failOnce:true}),r=await h.pool.run(a,b,params,table);
 assert.equal(r.scheduling.reductions[0].from,8);assert.equal(r.scheduling.reductions[0].to,4);assert.equal(r.scheduling.processedPixels,a.length/3);
 assert.equal(h.executed,a.length/3+r.scheduling.retriedPixels);assert.deepEqual(r.data,await fusedCpu(a,b,params,table));h.pool.dispose();
});
test('worker allocation failure falls back without any synthetic work or lost budget',async()=>{
 const h=harness({failSetup:true}),r=await h.pool.run(a,b,params,table);
 assert.equal(r.workers,1);assert.equal(h.main,a.length/3);assert.equal(h.executed,0);assert.equal(h.memoryBudget.retained,0);assert.deepEqual(r.data,await fusedCpu(a,b,params,table));
});
test('useful batch slowdown and observed heap pressure reduce concurrency',async()=>{
 const large=pixels(4*1048576);
 for(const options of [{cores:4,slow:true},{cores:4,pressure:true}]){
  const h=harness(options),r=await h.pool.run(large,large,params,table);
  assert.ok(r.scheduling.reductions.some(x=>x.reason===(options.slow?'useful-batch-slowdown':'heap-pressure')));assert.equal(h.executed+h.main,large.length/3);h.pool.dispose();
 }
});
test('active cancellation rejects the whole result and releases workers; retry on same pool succeeds',async()=>{
 const h=harness(),controller=new AbortController(),promise=h.pool.run(a,b,params,table,{signal:controller.signal});
 queueMicrotask(()=>controller.abort());await assert.rejects(promise,{code:'CANCELLED'});assert.equal(h.live,0);assert.equal(h.memoryBudget.retained,0);
 assert.deepEqual((await h.pool.run(a,b,params,table)).data,await fusedCpu(a,b,params,table));h.pool.dispose();
});
