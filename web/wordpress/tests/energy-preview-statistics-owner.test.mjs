import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../../engine-source/src/cache.js';
import {EngineError} from '../../engine-source/src/errors.js';
import {createEnergyStatisticsRuntime,ENERGY_STATISTICS_RUNTIME_BYTES as PAGE,ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES as INIT} from '../../engine-source/src/energy-statistics-runtime.js';
import {ENERGY_STATISTICS_KERNEL as pin} from '../../engine-source/src/energy-statistics-kernel-pin.js';
import {createEnergyPreviewStatisticsOwner} from '../sherloq-browser/assets/energy-preview-statistics-owner.js';

const kernel=await readFile(new URL(pin.url)),fetcher=async()=>new Response(kernel),turn=()=>new Promise(setImmediate),gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture({factory,available,heap=0}={}){
 const outer=new Budget(1024**2),leases=new Map(),budgets=[],requests=[],releases=[];let id=0,releaseHook=null,reserveHook=null,capabilities=0,factories=0;
 const engine={capabilities(){capabilities++;return{memory:{policyAvailableBytes:available??outer.limit-outer.total(),knownHeapCapacityBytes:heap}};},async reserveExternalMemory({bytes}){requests.push(bytes);reserveHook?.(bytes,requests.length);const release=outer.reserve(bytes),lease={id:++id,bytes};leases.set(lease.id,{lease,release});return lease;},async releaseExternalMemory(id){const entry=leases.get(id);assert(entry);const ack=await releaseHook?.(entry.lease);if(ack===false||ack===0)return ack;entry.release();leases.delete(id);releases.push(entry.lease.bytes);}};
 const owner=createEnergyPreviewStatisticsOwner({engine,runtimeFactory:async options=>{factories++;assert(options.budget instanceof Budget);assert.equal(options.budget.limit,PAGE+INIT);assert.equal(outer.total(),PAGE+INIT);budgets.push(options.budget);return factory?factory(options):createEnergyStatisticsRuntime({...options,fetcher});}});
 return{owner,outer,leases,budgets,requests,releases,engine,get capabilities(){return capabilities;},get factories(){return factories;},setRelease:hook=>{releaseHook=hook;},setReserve:hook=>{reserveHook=hook;}};
}

test('one real pinned Wasm page is financed once, initialization credit retires and current gesture signals remain independent',async()=>{
 const h=fixture(),firstSignal=new AbortController();try{const first=await h.owner.get({signal:firstSignal.signal});assert(first.runtime);assert(first.setupMilliseconds>0);assert.deepEqual(h.requests,[PAGE,INIT]);assert.deepEqual(h.releases,[INIT]);assert.equal(h.outer.total(),PAGE);assert.equal(h.budgets[0].total(),PAGE);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.pinnedBytes,PAGE);
  firstSignal.abort();const next=await h.owner.get({signal:new AbortController().signal});assert.equal(next.runtime,first.runtime);assert.equal(next.setupMilliseconds,0);assert.equal(h.factories,1);assert.equal(h.capabilities,1);assert.equal(next.runtime.reduce(Float32Array.of(2,3),0,2),5);
 }finally{await h.owner.dispose();assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,0);}
});

test('no-evict preflight includes the known heap and optional unavailability remains JS without a reservation',async()=>{
 const h=fixture({available:PAGE+INIT+4096-1,heap:4096});const answer=await h.owner.get();assert.equal(answer.runtime,null);assert.equal(h.requests.length,0);assert.equal(h.factories,0);assert.equal(h.outer.total(),0);assert.equal((await h.owner.get()).setupMilliseconds,0);await h.owner.dispose();
});

test('transient low headroom stays JS for that call and a later explicit get admits one runtime without polling',async()=>{
 const h=fixture();let available=PAGE+INIT-1,checks=0;h.engine.capabilities=()=>{checks++;return{memory:{policyAvailableBytes:available,knownHeapCapacityBytes:0}};};
 const missed=await h.owner.get();assert.equal(missed.runtime,null);assert.equal(missed.setupMilliseconds,0);assert.equal(h.requests.length,0);assert.equal(h.factories,0);await turn();await turn();assert.equal(checks,1);assert.equal(h.requests.length,0);
 available=PAGE+INIT;const admitted=await h.owner.get();assert(admitted.runtime);assert.equal(h.factories,1);assert.deepEqual(h.requests,[PAGE,INIT]);assert.equal(checks,2);assert.equal((await h.owner.get()).runtime,admitted.runtime);assert.equal(h.factories,1);assert.equal(checks,2);await h.owner.dispose();assert.equal(h.outer.total(),0);
});

test('an own HTTP miss retires both real budgets before JS fallback and is not fetched for every frame',async()=>{
 const h=fixture({factory:options=>createEnergyStatisticsRuntime({...options,fetcher:async()=>new Response('missing',{status:404})})});const answer=await h.owner.get();assert.equal(answer.runtime,null);assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,0);await h.owner.get();assert.equal(h.factories,1);await h.owner.dispose();
});

test('a late admission refusal waits for credit ACK before optional JS fallback',async()=>{
 const h=fixture(),ack=gate(),entered=gate();h.setReserve((_bytes,index)=>{if(index===2)throw new EngineError('MEMORY_LIMIT','Controlled late admission refusal');});h.setRelease(async()=>{entered.resolve();await ack.promise;});let settled=false;const task=h.owner.get().then(result=>{settled=true;return result;});await entered.promise;assert.equal(settled,false);assert.equal(h.outer.total(),PAGE);assert.equal(h.factories,0);ack.resolve();assert.equal((await task).runtime,null);assert.equal(h.outer.total(),0);await h.owner.dispose();
});

for(const primary of [0,false,null,undefined,Object.freeze(Object.assign(Error('caller network'),{code:'DEPENDENCY_HTTP'}))])test('arbitrary factory rejection remains exact, including '+String(primary),async()=>{
 const h=fixture({factory:async()=>{throw primary;}});await assert.rejects(h.owner.get(),error=>error===primary);assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);await h.owner.dispose();
});

test('a frozen admission primary is not reclassified as an optional miss',async()=>{
 const primary=Object.freeze(Object.assign(Error('frozen caller'),{code:'MEMORY_LIMIT'})),h=fixture();h.setReserve(()=>{throw primary;});await assert.rejects(h.owner.get(),error=>error===primary);assert.equal(h.outer.total(),0);await h.owner.dispose();
});

test('runtime retirement keeps engine credit and real backing ownership until its delayed ACK',async()=>{
 const entered=gate(),ack=gate(),h=fixture({factory:async options=>{const register=options.budget.registerBacking.bind(options.budget);options.budget.registerBacking=(...args)=>{const free=register(...args),held=async()=>{entered.resolve();await ack.promise;return free();};held.pin=free.pin;return held;};return createEnergyStatisticsRuntime({...options,fetcher});}});await h.owner.get();let settled=false;const retirement=h.owner.dispose().then(()=>settled=true);await entered.promise;assert.equal(settled,false);assert.equal(h.outer.total(),PAGE);assert.equal(h.budgets[0].total(),PAGE);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,PAGE);ack.resolve();await retirement;assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);
});

for(const bytes of [PAGE,INIT])test('external '+bytes+' credit refuses false/zero ACK without losing its retry handle',async()=>{
 const h=fixture();let refuse=true;h.setRelease(lease=>lease.bytes===bytes&&refuse?bytes===PAGE?false:0:undefined);
 if(bytes===INIT)await assert.rejects(h.owner.get(),{code:'BUSY'});else{await h.owner.get();await assert.rejects(h.owner.dispose(),{code:'BUSY'});}
 assert.equal(h.outer.total(),bytes);assert.equal(h.budgets[0].total(),0);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,0);refuse=false;await h.owner.dispose();assert.equal(h.outer.total(),0);
});

for(const primary of [Object.freeze(Error('constructor primary')),0,undefined])test('failed construction debt drains its actual Budget before either external credit is refunded: '+String(primary),async()=>{
 const compile=WebAssembly.compile,retirement=Object.freeze(Error('backing ACK refused'));let refuse=true;WebAssembly.compile=async()=>{throw primary;};const h=fixture({factory:async options=>{const register=options.budget.registerBacking.bind(options.budget);options.budget.registerBacking=(...args)=>{const free=register(...args);return()=>{if(refuse)throw retirement;return free();};};return createEnergyStatisticsRuntime({...options,fetcher});}});
 try{await assert.rejects(h.owner.get(),error=>error===primary);assert.equal(h.outer.total(),PAGE+INIT);assert.equal(h.budgets[0].total(),PAGE);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,PAGE);refuse=false;await h.owner.dispose();assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);assert.equal(h.budgets[0].resourceSnapshot().domains.wasm.materializedBytes,0);}finally{WebAssembly.compile=compile;refuse=false;await h.owner.dispose();}
});

test('a constructor reservation debt uses Budget reclaimers instead of erasing accounting',async()=>{
 const primary=Object.freeze(Error('reservation constructor primary'));let refuse=true;const h=fixture({factory:async({budget})=>{const free=budget.reserve(PAGE);budget.registerAsyncReclaimer(async()=>{if(refuse)throw Error('ACK pending');free();return PAGE;});throw primary;}});await assert.rejects(h.owner.get(),error=>error===primary);assert.equal(h.outer.total(),PAGE+INIT);assert.equal(h.budgets[0].total(),PAGE);refuse=false;await h.owner.dispose();assert.equal(h.outer.total(),0);assert.equal(h.budgets[0].total(),0);
});

test('an aborted initialization retires before a fresh gesture may build and reuse a runtime',async()=>{
 const h=fixture(),before=h.engine.capabilities;let stop=new AbortController();h.engine.capabilities=()=>{stop.abort();return before();};await assert.rejects(h.owner.get({signal:stop.signal}),{code:'CANCELLED'});assert.equal(h.outer.total(),0);assert.equal(h.factories,0);h.engine.capabilities=before;const runtime=(await h.owner.get({signal:new AbortController().signal})).runtime;assert(runtime);await h.owner.dispose();assert.equal(h.outer.total(),0);await turn();
});
