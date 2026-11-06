import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';
import {Budget} from '../src/cache.js';
import {EngineError,requireValue,checkAbort} from '../src/errors.js';
import {allocateTypedArray} from '../src/allocation.js';
import {retireCompositeOwners} from '../src/composite-owner-release.js';
import {numericPlaneSamplePlan,sampleStoredNumericPlane,unsupportedNumericSampling,markNumericSamplingAdmission} from '../src/numeric-plane-sampling.js';

const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const ownerCode=source.slice(source.indexOf('function externalWorkspaceOwner('),source.indexOf('export function createEngine('));
const methodStart=source.indexOf('  async samplePlane('),methodCode=source.slice(methodStart,source.indexOf('  async readDisplay(',methodStart));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

function harness({credit,gateCleanup=false,readFailure,throwRead=false}={}){
 const budget=new Budget(1024**2),descriptor={id:'numeric',revision:1,width:7,height:5,format:'float32'},request={surfaceId:'numeric',revision:1,sourceWidth:7,sourceHeight:5,width:6,height:4,centers:true,workspaceReservationId:'workspace'},plan=numericPlaneSamplePlan(descriptor,request),words=Uint32Array.from({length:35},(_,i)=>[0,0x80000000,0x7fc00001,0xffc12345,0x3f800000,0xffffffff][i%6]),native=bytes(words),reads=[],entered=deferred(),cleanup=deferred();
 const store={readInto(target,offset){reads.push({offset,bytes:target.byteLength});if(throwRead)throw readFailure;target.set(native.subarray(offset,offset+target.byteLength));return target;}};
 const surface={descriptor,async samplePlane(r,options){const frame=await sampleStoredNumericPlane(store,descriptor,r,{budget,...options});if(gateCleanup){const release=frame.release;frame.release=async()=>{entered.resolve();await cleanup.promise;release();};}return frame;}};
 const externalMemory=new Map(),surfaces=new Map([['numeric',{imageId:'original',record:{surface}}]]);
 const context=vm.createContext({EngineError,requireValue,checkAbort,allocateTypedArray,numericPlaneSamplePlan,unsupportedNumericSampling,markNumericSamplingAdmission,retireCompositeOwners,budget,externalMemory,surfaces,busy:false,knownHeapBytes:()=>0,idle(){if(context.busy)throw new EngineError('BUSY','Busy');}});
 const owner=new vm.Script(ownerCode+';externalWorkspaceOwner').runInContext(context)(budget.reserve(credit??(plan.requiredBytes+plan.outputBytes)));
 externalMemory.set('workspace',owner);
 const api=new vm.Script('({'+methodCode+'})').runInContext(context);
 return{api,budget,owner,request,plan,words,reads,entered,cleanup,context};
}

test('one real external reservation funds independent exact numeric destinations without another output reservation',async()=>{
 const h=harness(),reserved=h.budget.total();
 const a=await h.api.samplePlane(h.request),b=await h.api.samplePlane(h.request);
 assert.equal(a.metrics.funding,'external-workspace');assert.equal(a.metrics.workspaceBytes,h.plan.requiredBytes);assert.equal(a.metrics.retainedDestinationBytes,h.plan.outputBytes);
 assert.equal(a.metrics.memory.activeReservationBytes,reserved);assert.equal(h.budget.total(),reserved);
 assert.notEqual(a.plane.data.buffer,b.plane.data.buffer);
 const expected=new Uint32Array(24);for(let y=0;y<4;y++)for(let x=0;x<6;x++)expected[y*6+x]=h.words[Math.floor((y+.5)*5/4)*7+Math.floor((x+.5)*7/6)];
 assert.deepEqual(bytes(a.plane.data),bytes(expected));a.plane.data.fill(7);assert.deepEqual(bytes(b.plane.data),bytes(expected));
 const priorReads=h.reads.length;
 await assert.rejects(h.api.samplePlane(h.request),e=>e.code==='MEMORY_LIMIT'&&e.details.samplePlane.phase==='admission'&&e.details.samplePlane.fallbackSafe===true);
 assert.equal(h.reads.length,priorReads);assert.equal(h.budget.total(),reserved);
 await h.owner.release();assert.equal(h.budget.total(),0);
});

test('unknown, expired and closing reservations refuse borrowing before I/O',async()=>{
 const h=harness();
 for(const id of ['unknown',42,null])await assert.rejects(h.api.samplePlane({...h.request,workspaceReservationId:id}),e=>e.code==='INVALID_INPUT'&&!e.details?.samplePlane);
 assert.equal(h.reads.length,0);await h.owner.release();
 await assert.rejects(h.api.samplePlane(h.request),e=>e.code==='INVALID_INPUT'&&!e.details?.samplePlane);assert.equal(h.reads.length,0);assert.equal(h.budget.total(),0);
});

test('a fully reserved budget still admits prepaid sampling and refuses duplicate output admission',async()=>{
 const h=harness();h.budget.setLimit(h.budget.total());const{workspaceReservationId,...ordinary}=h.request;
 await assert.rejects(h.api.samplePlane(ordinary),e=>e.code==='MEMORY_LIMIT'&&e.details.samplePlane.fallbackSafe===true);assert.equal(h.reads.length,0);
 const answer=await h.api.samplePlane(h.request);assert.equal(answer.plane.data.byteLength,h.plan.outputBytes);assert.equal(h.budget.total(),h.budget.limit);
 await h.owner.release();assert.equal(h.budget.total(),0);
});

test('closing the parent during cleanup keeps its credit until ACK and cancels publication',async()=>{
 const h=harness({gateCleanup:true}),reserved=h.budget.total(),pending=h.api.samplePlane(h.request);
 await h.entered.promise;let closed=false;const release=h.owner.release();release.then(()=>closed=true);
 assert.equal(h.owner.live,false);assert.equal(closed,false);assert.equal(h.budget.total(),reserved);
 h.cleanup.resolve();await assert.rejects(pending,{code:'CANCELLED'});await release;
 assert.equal(closed,true);assert.equal(h.budget.total(),0);assert.equal(h.context.busy,false);
});

test('abort during cleanup does not publish or consume destination capacity',async()=>{
 const h=harness({credit:1024,gateCleanup:true}),controller=new AbortController(),reserved=h.budget.total(),pending=h.api.samplePlane(h.request,{signal:controller.signal});
 await h.entered.promise;controller.abort();assert.equal(h.budget.total(),reserved);h.cleanup.resolve();
 await assert.rejects(pending,{code:'CANCELLED'});assert.equal(h.budget.total(),reserved);assert.equal(h.context.busy,false);
 const proof=h.owner.claim(1024);proof.finish();await h.owner.release();assert.equal(h.budget.total(),0);
});

test('frozen and falsy read failures remain primary and return all claim capacity after cleanup',async()=>{
 for(const primary of [Object.freeze(new EngineError('STORAGE_IO','frozen read')),0,false,null,undefined]){
  const h=harness({credit:1024,throwRead:true,readFailure:primary});
  await assert.rejects(h.api.samplePlane(h.request),e=>e===primary);assert.equal(h.context.busy,false);assert.equal(h.budget.total(),1024);
  const proof=h.owner.claim(1024);proof.finish();await h.owner.release();assert.equal(h.budget.total(),0);
 }
});

const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:100,histogramHigh:900,shadow:20,highlight:20};
test('actual Core API uses prepaid workspace under real pressure, preserves native samples and retires partial owners on dispose',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2,cpuKernel:'single'}),width=96,height=96,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*37+(i%17)*91)%256)};
 let disposed=false;
 try{
  await engine.load({id:'original',bytes:Uint8Array.of(1),pixels});const analysis=await engine.run({id:'native',imageId:'original',operation:'ela.energy',params,backend:'cpu',resultLayout:'surface'}),s=analysis.planeSurfaces.energy_high_score,request={surfaceId:s.id,revision:s.revision,sourceWidth:width,sourceHeight:height,width:23,height:17,centers:true},plan=numericPlaneSamplePlan(s,request),reference=await engine.samplePlane(request);
  assert.equal(engine.capabilities().sourceAccess.numericSamplingExternalWorkspace,true);
  const workspace=engine.reserveExternalMemory({bytes:plan.requiredBytes*2}),memory=engine.capabilities().memory;
  const fillers=[engine.reserveExternalMemory({bytes:memory.policyAvailableBytes+memory.cacheBytes-memory.knownHeapCapacityBytes-64})];
  // Cache reclamation can retire an idle codec heap too. Admit the remaining
  // headroom against its current, real size rather than the pre-reclaim size.
  const settled=engine.capabilities().memory,spare=settled.policyAvailableBytes-settled.knownHeapCapacityBytes-64;if(spare>0)fillers.push(engine.reserveExternalMemory({bytes:spare}));
  assert.equal(engine.capabilities().memory.cacheBytes,0);
  assert.ok(engine.capabilities().memory.policyAvailableBytes-engine.capabilities().memory.knownHeapCapacityBytes<plan.requiredBytes,'The ordinary output requires more than the currently admitted free headroom; Core may still reclaim other native caches.');
  const before=engine.capabilities().memory.activeReservationBytes,answer=await engine.samplePlane({...request,workspaceReservationId:workspace.id});
  assert.deepEqual(bytes(answer.plane.data),bytes(reference.plane.data));assert.equal(answer.metrics.funding,'external-workspace');assert.equal(engine.capabilities().memory.activeReservationBytes,before);
  for(const filler of fillers)engine.releaseExternalMemory(filler.id);answer.plane.data.fill(123);assert.deepEqual(bytes((await engine.samplePlane(request)).plane.data),bytes(reference.plane.data));
  const other=engine.reserveExternalMemory({bytes:4096}),pending=engine.samplePlane({...request,workspaceReservationId:workspace.id}),held=engine.capabilities().memory.activeReservationBytes;
  let closed=false;const closing=engine.releaseExternalMemory(workspace.id);closing.then(()=>closed=true);
  assert.equal(closed,false);assert.equal(engine.capabilities().memory.activeReservationBytes,held);assert.throws(()=>engine.releaseExternalMemory(other.id),{code:'BUSY'});
  await assert.rejects(pending,{code:'CANCELLED'});await closing;assert.equal(closed,true);await assert.rejects(engine.samplePlane({...request,workspaceReservationId:workspace.id}),e=>e.code==='INVALID_INPUT'&&!e.details?.samplePlane);
  engine.releaseExternalMemory(other.id);
  const partial=engine.reserveExternalMemory({bytes:plan.requiredBytes*2});await engine.samplePlane({...request,workspaceReservationId:partial.id});
  // Leave the partly consumed frame owner live: dispose must retire it too.
  await engine.dispose();disposed=true;assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{if(!disposed)await engine.dispose();}
});
