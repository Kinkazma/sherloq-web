// Provider ownership only: six RGB bytes, no codec compute, GPU API or shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
import {EnergyScoreGpu} from '../src/energy-score-gpu.js';
import {EngineError} from '../src/errors.js';
const MiB=1024**2,pixels={width:2,height:1,format:'rgb8',data:Uint8Array.of(10,31,82,103,204,255)};
const create=(memoryBudgetBytes=128*MiB,knownHeapBytes=0)=>createEngine({memoryBudgetBytes,cpuKernel:'single',codec:{memoryBytes:()=>knownHeapBytes}});
const load=(engine,id='original')=>engine.load({id,bytes:Uint8Array.of(1),pixels,provenance:{format:'png',decoder:'ownership-fixture'}});
function ownerOf(facade){let owner;const select=EnergyScoreGpu.prototype.selectBackend;EnergyScoreGpu.prototype.selectBackend=function(...args){owner=this;return select.apply(this,args);};try{assert.equal(facade.selectBackend(1,'cpu'),'cpu');return owner;}finally{EnergyScoreGpu.prototype.selectBackend=select;}}

test('one admitted in-engine workspace borrows the image provider and existing Budget without GPU allocation',async()=>{
 const engine=create();try{await load(engine);const lease=engine.reserveExternalMemory({bytes:4096}),before=engine.capabilities().memory;
  const a=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),b=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(a);assert(owner instanceof EnergyScoreGpu);assert.equal(a,b);assert.equal(a.run,undefined);assert.equal(a.dispose,undefined);assert.equal(owner.device,null);assert.equal(owner.program,null);assert.equal(owner.singleProgram,null);assert.equal(owner.budget.limit,engine.capabilities().memory.budgetBytes);assert.equal(engine.capabilities().memory.activeReservationBytes,before.activeReservationBytes,'Borrowing does not reserve a second preview workspace');
  await load(engine,'other-image');const other=engine.energyPreviewScoreProvider({imageId:'other-image',workspaceId:lease.id});assert.notEqual(other,a);assert.equal(ownerOf(other).budget,owner.budget,'Different image owners still share the engine Budget');engine.releaseExternalMemory(lease.id);assert.equal(owner.closed,false,'Ending a preview does not dispose the borrowed native provider');
 }finally{await engine.dispose();}assert.equal(engine.capabilities().memory.activeReservationBytes,0);
});

test('missing, foreign and retired workspace IDs cannot create or borrow a provider',async()=>{
 const engine=create(),foreign=create();try{await load(engine);await load(foreign);const alien=foreign.reserveExternalMemory({bytes:1024});for(const workspaceId of[undefined,null,'',alien.id])assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId}),{code:'INVALID_INPUT'});const lease=engine.reserveExternalMemory({bytes:1024});engine.releaseExternalMemory(lease.id);assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),{code:'INVALID_INPUT'});foreign.releaseExternalMemory(alien.id);
 }finally{await engine.dispose();await foreign.dispose();}
});

test('unloaded sources cannot borrow, and a reloaded ID owns a fresh provider while the old one is closed',async()=>{
 const engine=create();try{await load(engine);const lease=engine.reserveExternalMemory({bytes:4096});assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'missing',workspaceId:lease.id}),{code:'NOT_FOUND'});const first=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(first);await engine.unload('original');assert.equal(owner.closed,true);assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),{code:'NOT_FOUND'});assert.throws(()=>first.selectBackend(1,'cpu'),{code:'NOT_FOUND'});await load(engine);const second=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id});assert.notEqual(second,first);assert.equal(ownerOf(second).closed,false);engine.releaseExternalMemory(lease.id);
 }finally{await engine.dispose();}
});

test('an active engine operation refuses borrowing, then admits it after idle without a replacement owner',async()=>{
 const engine=create();try{await load(engine);const lease=engine.reserveExternalMemory({bytes:1024}),provider=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),pending=load(engine,'pending-source');assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),{code:'BUSY'});await pending;assert.equal(engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),provider);engine.releaseExternalMemory(lease.id);
 }finally{await engine.dispose();}
});

test('a closed provider is not replaced before source retirement; disposed engine access stays refused',async()=>{
 const engine=create();await load(engine);const lease=engine.reserveExternalMemory({bytes:1024}),provider=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(provider);await owner.dispose();assert.equal(owner.closed,true);assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),{code:'DISPOSED'});engine.releaseExternalMemory(lease.id);await engine.dispose();assert.throws(()=>engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),{code:'DISPOSED'});
});

test('auto chooses CPU when the native resident margin is not admitted, explicit GPU refuses without losing its frame lease',async()=>{
 const engine=create(64*MiB),select=EnergyScoreGpu.prototype.selectBackend;try{await load(engine);const lease=engine.reserveExternalMemory({bytes:40*MiB}),facade=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(facade),before=engine.capabilities().memory.activeReservationBytes;EnergyScoreGpu.prototype.selectBackend=function(_count,requested){assert.equal(this,owner);return requested==='cpu'?'cpu':'webgpu';};assert.equal(facade.selectBackend(2,'auto'),'cpu');assert.equal(facade.selectBackend(2,'webgpu'),'webgpu');await assert.rejects(facade.runScores(null,null,null,{backend:'webgpu'}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,before);engine.releaseExternalMemory(lease.id);
 }finally{EnergyScoreGpu.prototype.selectBackend=select;await engine.dispose();}
});

for(const knownHeap of[0,48*MiB])test('borrowed GPU body owns '+(knownHeap||32*MiB)+' resident bytes and excludes engine work until completion',async()=>{
 const engine=create(128*MiB,knownHeap),run=EnergyScoreGpu.prototype.runScores;let entered,ack;const gate=new Promise(resolve=>ack=resolve),begun=new Promise(resolve=>entered=resolve);try{await load(engine);const lease=engine.reserveExternalMemory({bytes:4096}),facade=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(facade),before=engine.capabilities().memory.activeReservationBytes;EnergyScoreGpu.prototype.runScores=async function(_p,_s,_r,options){assert.equal(this,owner);assert.equal(options.backend,'auto');assert.equal(engine.capabilities().memory.activeReservationBytes,before+Math.max(32*MiB,knownHeap));entered();await gate;return{backend:'webgpu-controlled'};};const result=facade.runScores(null,null,null,{backend:'auto'});await Promise.race([begun,result.then(()=>{throw Error('Body must wait for the controlled ACK');})]);assert.throws(()=>engine.reserveExternalMemory({bytes:1}),{code:'BUSY'});assert.throws(()=>engine.unload('original'),{code:'BUSY'});ack();assert.equal((await result).backend,'webgpu-controlled');assert.equal(engine.capabilities().memory.activeReservationBytes,before);engine.releaseExternalMemory(lease.id);
 }finally{ack();EnergyScoreGpu.prototype.runScores=run;await engine.dispose();}
});

test('underlying auto recovery waits for its own ACK under the resident margin; explicit errors stay primary',async()=>{
 const engine=create();try{await load(engine);const lease=engine.reserveExternalMemory({bytes:4096}),facade=engine.energyPreviewScoreProvider({imageId:'original',workspaceId:lease.id}),owner=ownerOf(facade),before=engine.capabilities().memory.activeReservationBytes,failure=Object.freeze(new EngineError('MEMORY_LIMIT','Controlled GPU resource refusal'));let enter,ack;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>ack=resolve),oldRun=owner.run,oldRetire=owner.retire;owner.run=async()=>{throw owner.failure(failure);};owner.retire=async()=>{enter();await gate;};const low=new Float32Array(2),high=new Float32Array(2),task=facade.runScores(Float32Array.of(1,2),Int32Array.of(1,1),[{id:1,probes:[{central_mean:1}]}],{low,high,log:Math.log,planeCount:1,backend:'auto'});await entered;assert.equal(engine.capabilities().memory.activeReservationBytes,before+32*MiB);ack();assert.equal((await task).backend,'cpu-native-energy-score-recovery');assert.equal(engine.capabilities().memory.activeReservationBytes,before);await assert.rejects(facade.runScores(null,null,null,{backend:'webgpu'}),e=>e===failure);assert.equal(engine.capabilities().memory.activeReservationBytes,before);owner.run=oldRun;owner.retire=oldRetire;engine.releaseExternalMemory(lease.id);
 }finally{await engine.dispose();}
});
