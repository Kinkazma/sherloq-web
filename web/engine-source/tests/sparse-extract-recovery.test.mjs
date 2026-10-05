// Fault-injected transport checks. No native image extraction or browser run.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {SparseFeatureEngine} from '../src/sparse-extract.js';import {Budget} from '../src/cache.js';
import {sparseExtractionFailure} from '../src/sparse-extract-errors.js';import {serializeEngineError,deserializeEngineError,resourceAllocationKind} from '../src/errors.js';
const MiB=1024**2,wasm=new Uint8Array(await readFile(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url)));
const feature=(zone=0)=>({points:Float64Array.of(1,1,1,0,1,0,0),descriptors:new Float32Array(128),members:Uint8Array.of(+(zone===0),+(zone===1)),descriptorSize:128,totalFeatures:1,heapBytes:16*MiB});
test('Native -4 retains WASM allocation identity, extent and status across transport',()=>{
 const original=sparseExtractionFailure(-4,{HEAPU8:{buffer:{byteLength:64*MiB}}},{family:0,width:20,height:30,limit:6000,maximumHeapBytes:64*MiB}),copy=deserializeEngineError(serializeEngineError(original,'FEATURE_EXTRACTION_FAILED'));
 assert.equal(copy.code,'MEMORY_ALLOCATION');assert.equal(resourceAllocationKind(copy),'wasm');assert.equal(copy.details.currentBytes,64*MiB);assert.equal(copy.details.width,20);assert.equal(copy.details.nativeStatus,-4);assert.match(copy.stack,/sparseExtractionFailure/);
 assert.equal(sparseExtractionFailure(-2,{},{}).code,'FEATURE_EXTRACTION_FAILED');assert.equal(sparseExtractionFailure(-3,{},{}).code,'INVALID_INPUT');
});
async function scenario({repeat=false,numeric=false,family='SIFT-G2NN'}={}){
 const previous={Worker:globalThis.Worker,fetch:globalThis.fetch},messages=[],events=[],budget=new Budget(1024*MiB),engine=new SparseFeatureEngine(budget,{maxWorkers:2});let fallbacks=0,freed=0;
 globalThis.fetch=async()=>new Response(wasm);
 globalThis.Worker=class{terminate(){this.dead=true;}postMessage(m){messages.push(m);if(m.kind==='init'){this.heap=m.maximumHeapBytes;queueMicrotask(()=>this.onmessage?.({data:{ready:true}}));return;}setImmediate(()=>{if(this.dead)return;const fail=(family!=='SIFT-G2NN'||m.independentZone===1)&&(repeat||this.heap<128*MiB);const error=sparseExtractionFailure(numeric?-2:-4,{HEAPU8:{buffer:{byteLength:this.heap}}},{maximumHeapBytes:this.heap});this.onmessage({data:fail?{error:serializeEngineError(error)}:feature(m.independentZone)});});}};
 engine.paged.extractPlan=async(_image,plan,zoneCount)=>{fallbacks++;assert.equal(engine.workers.size,0);assert.equal(plan.jobs.length,1);assert.equal(plan.jobs[0].zone,1);assert.equal(zoneCount,2);return {...feature(1),points:Float64Array.of(7,1,1,0,1,0,0),metadata:{workers:2,executions:1},release(){freed++;}};};
 const regions=[[[0,0],[4,0],[4,4],[0,4]],[[6,0],[10,0],[10,4],[6,4]]],image={width:12,height:6,format:'rgb8',data:new Uint8Array(12*6*3)};
 try{const run=()=>engine.extract(image,{family,limit:100,regions,onProgress:e=>events.push(e)});
  if(numeric){await assert.rejects(run,{code:'FEATURE_EXTRACTION_FAILED'});assert.equal(events.filter(e=>e.phase==='resource-recovery').length,0);}
  else{const result=await run();assert.equal(result.points.length,14);assert.equal(result.totalFeatures,2);assert.deepEqual([...result.members],[1,0,0,1]);assert.equal(messages.filter(m=>m.kind==='extract'&&m.independentZone===0).length,1);assert.equal(result.metadata.recovery[0].action,'grow-native-heap');assert.equal(result.metadata.retries,repeat?2:1);assert.equal(fallbacks,repeat?1:0);assert.equal(freed,repeat?1:0);result.release();}
 }finally{await engine.dispose();globalThis.Worker=previous.Worker;globalThis.fetch=previous.fetch;}
 assert.equal(budget.total(),0);assert.equal(engine.pending.size,0);assert.equal(engine.workers.size,0);
}
test('Refused native heap grows while successful independent regions are kept',()=>scenario());
test('Repeated native refusal switches only unfinished SIFT regions to bounded extraction',()=>scenario({repeat:true}));
test('Native numerical failures retain their cause and are not retried as memory failures',()=>scenario({numeric:true}));
