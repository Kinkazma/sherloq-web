import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsegWindowCorrelation} from '../experiments/segmentation/cmseg-window-bank-pool.js';
import {createCmsegWindowGpuOwner} from '../experiments/segmentation/cmseg-window-gpu-owner.js';
const budget=(limit=512*1024**2)=>{let bytes=0,peak=0;return{limit,total:()=>bytes,get peak(){return peak;},reserve(n){if(bytes+n>limit)throw Object.assign(Error('budget'),{code:'MEMORY_LIMIT'});bytes+=n;peak=Math.max(peak,bytes);let done=false;return()=>{if(!done){done=true;bytes-=n;}};}};};
const plan=()=>({channels:96,count:1024,side:32,k:96,contexts:[{index:0,offset:0,count:1024}],mask:new Uint8Array(1024).fill(1),positions:new Float32Array(2048),assertCurrent(){}});
function controlled({failure,terminateRefusal=false}={}){
 const rows=[],workers=[];let refuse=terminateRefusal;
 const factory=()=>{const worker={postMessage(data){rows.push(data);queueMicrotask(()=>{if(failure){worker.onmessage({data:{id:data.id,ok:false,error:{code:'CONTROLLED_FAIL',message:'Controlled failure before numeric work'}}});return;}
  const out={id:data.id,ok:true,heapBytes:64*1024**2};if(data.type==='statistics'){out.maxima=new Float32Array(data.count);out.inverse=new Float32Array(data.count).fill(1/1024);out.columnSum=new Float32Array(data.count).fill(1024);}if(data.type==='topk')out.output=new Float32Array(96*data.count).fill(1/1024**2);worker.onmessage({data:out});});},terminate(){if(refuse){refuse=false;throw false;}worker.dead=true;}};workers.push(worker);return worker;};return{factory,rows,workers};
}
test('CPU pool retains all native rows, complete TopK and requested cores with bounded owned output',async()=>{
 const b=budget(),f=controlled(),pool=createCmsegWindowCorrelation({budget:b,maxWorkers:3,rowsPerJob:64,workerFactory:f.factory});
 const r=await pool.run({plan:plan(),input:new Float32Array(96*1024),alpha:2,nativeFma:true});
 assert.equal(r.requestedMaxWorkers,3);assert.equal(r.workers,3);assert.equal(r.comparisonPopulation,1024);assert.equal(r.comparisonsPerPass,1024**2);assert.deepEqual(r.data,new Float32Array(96*1024).fill(1/1024**2));
 for(const phase of ['statistics','topk']){const calls=f.rows.filter(v=>v.type===phase).sort((a,b)=>a.first-b.first);assert.equal(calls.length,16);assert.deepEqual(calls.map(v=>v.first),Array.from({length:16},(_,i)=>i*64));assert.ok(calls.every(v=>v.count===64));}
 assert.ok(f.workers.every(v=>v.dead));assert.equal(b.total(),r.data.byteLength);await pool.release();assert.equal(b.total(),r.data.byteLength);r.release();assert.equal(b.total(),0);
});
test('Worker ACK refusal retains admissions until actual retry, including falsy rejection',async()=>{
 const b=budget(),f=controlled({failure:true,terminateRefusal:true}),pool=createCmsegWindowCorrelation({budget:b,maxWorkers:1,workerFactory:f.factory});
 await assert.rejects(pool.run({plan:plan(),input:new Float32Array(96*1024),alpha:2,nativeFma:false}),{code:'CONTROLLED_FAIL'});
 assert.equal(pool.pendingACKs,1);assert.ok(b.total()>64*1024**2);assert.equal(f.workers[0].dead,undefined);await pool.release();assert.equal(pool.pendingACKs,0);assert.equal(b.total(),0);assert.equal(f.workers[0].dead,true);
});
test('One-byte insufficient admission refuses before Worker or output is constructed',async()=>{
 const b=budget(12*1024+4*96*1024-1),f=controlled(),pool=createCmsegWindowCorrelation({budget:b,maxWorkers:1,workerFactory:f.factory});
 await assert.rejects(pool.run({plan:plan(),input:new Float32Array(96*1024),alpha:2,nativeFma:false}),{code:'MEMORY_LIMIT'});assert.equal(f.workers.length,0);await pool.release();assert.equal(b.total(),0);
});
test('GPU owner publishes synchronously and retries queue, buffer, destroy and lost without returning credit early',async()=>{
 const steps=[],token=Object.freeze({code:'REFUSAL'});let credit=1,queueFail=true,bufferFail=true,destroyFail=true,lostFail=true,published;
 const owner=createCmsegWindowGpuOwner({onOwner:v=>published=v});assert.equal(published,owner);owner.credit(()=>credit--);
 owner.buffer({destroy(){steps.push('buffer');if(bufferFail){bufferFail=false;throw 0;}}});
 const device={queue:{onSubmittedWorkDone(){steps.push('queue');if(queueFail){queueFail=false;return Promise.reject(false);}}},destroy(){steps.push('destroy');if(destroyFail){destroyFail=false;throw token;}},get lost(){steps.push('lost');if(lostFail){lostFail=false;return Promise.reject(null);}return Promise.resolve({reason:'destroyed'});}};owner.device(device);
 for(const expected of [false,0,token,null]){let caught=false;try{await owner.dispose();}catch(error){caught=true;assert.equal(error,expected);}assert.ok(caught);assert.equal(credit,1);assert.equal(owner.closed,false);}
 await owner.dispose();assert.equal(credit,0);assert.equal(owner.pendingACKs,0);assert.equal(owner.closed,true);assert.deepEqual(steps,['queue','queue','buffer','buffer','destroy','destroy','lost','lost']);
});
