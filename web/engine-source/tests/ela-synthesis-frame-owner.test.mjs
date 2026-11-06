import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createElaSynthesisFrameOwner} from '../src/ela-synthesis-frame-owner.js';
import {createEngine} from '../src/index.js';

const MiB=1024**2,tick=()=>new Promise(setImmediate),gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
test('the actual native RGB handoff adopts only an uncached synthesis result and isolates every cached or normal buffer',async()=>{
 const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8'),line=source.split('\n').find(value=>value.includes('const pixels={width:im.pixels.width,height:im.pixels.height,format:'));
 assert(line);const handoff=Function('result','metrics','im','frameOwner',line+'\nreturn pixels;'),input=Uint8Array.of(1,2,3,4,5,6),im={pixels:{width:2,height:1}},retained=[],owner={retain:data=>retained.push(data)};
 const fresh=handoff(input,{cache:{result:false}},im,owner);assert.equal(fresh.data,input);assert.equal(retained[0],input);assert.deepEqual(fresh,{width:2,height:1,format:'rgb8',data:input});
 const cached=handoff(input,{cache:{result:true}},im,owner);assert.notEqual(cached.data,input);assert.equal(retained[1],cached.data);assert.deepEqual(cached.data,input);cached.data.fill(0);assert.deepEqual(input,Uint8Array.of(1,2,3,4,5,6));
 const normal=handoff(input,{cache:{result:false}},im,null);assert.notEqual(normal.data,input);assert.deepEqual(normal.data,input);normal.data.fill(255);assert.deepEqual(input,Uint8Array.of(1,2,3,4,5,6));
});
test('one-use frame RGB keeps its reservation until the actual backing retirement ACK',async()=>{
 const budget=new Budget(1024),ack=gate();let retirementStarted=false;budget.registerBacking=()=>async()=>{retirementStarted=true;await ack.promise;return 6;};
 const owner=createElaSynthesisFrameOwner({budget,original:{},index:0,resultId:'frame'}),data=new Uint8Array(6);owner.retain(data);owner.retain(data);assert.equal(owner.retainedBytes,6);assert.equal(budget.active,6);const closed=owner.dispose();await tick();assert.equal(retirementStarted,true);assert.equal(budget.active,6);assert.equal(owner.active,true);ack.resolve();await closed;assert.equal(budget.total(),0);assert.equal(owner.active,false);assert.equal(owner.retainedBytes,0);await owner.dispose();
});
test('a refused retirement keeps only its still-owned frame credit and permits cleanup retry',async()=>{
 const budget=new Budget(1024);let calls=0;budget.registerBacking=()=>()=>{if(++calls===1)throw Error('Injected ACK refusal');return 3;};
 const owner=createElaSynthesisFrameOwner({budget,original:{},index:0,resultId:'frame'});owner.retain(new Uint8Array(3));await assert.rejects(owner.dispose(),/ACK refusal/);assert.equal(budget.active,3);assert.equal(owner.active,true);await owner.dispose();assert.equal(budget.total(),0);assert.equal(owner.active,false);
});

// Metadata and six controlled RGB bytes only. No native codec, browser or GPU.
function fixture(){
 const calls=[],codec={id:'one-use-frame-fixture',memoryBytes:()=>0,async recompress(pixels,quality){calls.push(quality);return{...pixels,data:Uint8Array.from(pixels.data,(v,i)=>(v+quality+i)%256)};}},engine=createEngine({codec,memoryBudgetBytes:128*MiB,cpuKernel:'single'}),pixels={width:2,height:1,format:'rgb8',data:Uint8Array.of(10,31,82,103,204,255)};
 return{engine,calls,async load(){return engine.load({id:'original',bytes:Uint8Array.of(1),pixels,provenance:{format:'jpeg',decoder:'six-byte-fixture'}});},async rgb(result){return(await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect:{x:0,y:0,width:2,height:1}})).pixels.data;}};
}
test('owned synthesis frames read preexisting normal caches, add no quality caches and keep native recipe/Original',async()=>{
 const h=fixture();let normal,first,second;try{
  const original=await h.load(),job=await h.engine.beginElaSynthesis({imageId:original.id}),params=job.axis.states[0].params;
  normal=await h.engine.run({id:'normal-q1',imageId:original.id,operation:'ela.classic',params,backend:'cpu'});const expected=await h.rgb(normal),cache=h.engine.capabilities().memory.cacheBytes,calls=h.calls.length,activeBeforeFrame=h.engine.capabilities().memory.activeReservationBytes;
  first=await h.engine.runElaSynthesisFrame({id:job.id,index:0,resultId:'owned-q1',backend:'cpu'});assert.deepEqual(await h.rgb(first),expected);assert.equal(h.calls.length,calls);assert.equal(first.metrics.cache.result,true);assert.equal(first.metrics.synthesisFrame.cacheWrites,false);assert.equal(first.metrics.synthesisFrame.proxyCapture,false);assert.equal(first.provenance.originalSha256,original.sha256);assert.deepEqual(first.provenance.params,params);assert.equal(h.engine.capabilities().memory.cacheBytes,cache);assert.equal(h.engine.capabilities().memory.activeReservationBytes,activeBeforeFrame+6);
  await assert.rejects(h.engine.runElaSynthesisFrame({id:job.id,index:1}),{code:'INVALID_INPUT'});await h.engine.appendElaSynthesis({id:job.id,result:first});assert.equal(h.engine.capabilities().memory.activeReservationBytes,activeBeforeFrame);await h.engine.releaseSurface(first.surface.id);first=null;
  second=await h.engine.runElaSynthesisFrame({id:job.id,index:1,resultId:'owned-q2',backend:'cpu'});assert.equal(h.calls.at(-1),2);assert.equal(h.engine.capabilities().memory.cacheBytes,cache);await h.engine.appendElaSynthesis({id:job.id,result:second});assert.equal(h.engine.capabilities().memory.activeReservationBytes,activeBeforeFrame);await h.engine.releaseSurface(second.surface.id);second=null;await h.engine.disposeElaSynthesis({id:job.id});
  const reused=await h.engine.run({id:'normal-q1-again',imageId:original.id,operation:'ela.classic',params,backend:'cpu'});assert.equal(reused.metrics.cache.result,true);assert.deepEqual(await h.rgb(reused),expected);await h.engine.releaseSurface(reused.surface.id);
 }finally{for(const r of [normal,first,second])if(r)await h.engine.releaseSurface(r.surface.id);await h.engine.dispose();}const m=h.engine.capabilities().memory;assert.equal(m.retainedBytes+m.activeReservationBytes+m.cacheBytes,0);
});
test('disposing an unappended synthesis frame retires its owned RGB without touching normal cache entries',async()=>{
 const h=fixture();let frame;try{const original=await h.load(),job=await h.engine.beginElaSynthesis({imageId:original.id}),activeBeforeFrame=h.engine.capabilities().memory.activeReservationBytes;frame=await h.engine.runElaSynthesisFrame({id:job.id,index:0,resultId:'unappended',backend:'cpu'});assert.equal(h.engine.capabilities().memory.activeReservationBytes,activeBeforeFrame+6);await h.engine.disposeElaSynthesis({id:job.id});assert.equal(h.engine.capabilities().memory.activeReservationBytes,0);assert(frame.surface);await h.engine.releaseSurface(frame.surface.id);frame=null;await assert.rejects(h.engine.runElaSynthesisFrame({id:job.id,index:0}),{code:'NOT_FOUND'});}finally{if(frame)await h.engine.releaseSurface(frame.surface.id);await h.engine.dispose();}
});
test('a public lookalike flag cannot suppress ordinary ELA cache writes',async()=>{
 const h=fixture();try{const original=await h.load(),task={id:'ordinary',imageId:original.id,operation:'ela.classic',backend:'cpu',params:{quality:17},synthesisFrame:{active:true,original,index:0}},first=await h.engine.run(task),calls=h.calls.length,second=await h.engine.run({...task,id:'ordinary-repeat'});assert.equal(second.metrics.cache.result,true);assert.equal(h.calls.length,calls);assert.equal(first.metrics.synthesisFrame,undefined);assert.deepEqual(first.pixels.data,second.pixels.data);}finally{await h.engine.dispose();}
});
