import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../../engine-source/src/cache.js';
import {prepareEnergy} from '../../engine-source/src/energy-prepare.js';
import {createEnergyStatisticsRuntime} from '../../engine-source/src/energy-statistics-runtime.js';
import {ENERGY_STATISTICS_KERNEL as pin} from '../../engine-source/src/energy-statistics-kernel-pin.js';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';

const kernel=await readFile(new URL(pin.url)),params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:20,histogramHigh:990,shadow:50,highlight:50};
function fixture(one=false){
 const width=80,height=80,n=width*height,count=one?1:3,outer=new Budget(64*1024**2),leases=new Map(),runtimes=[],audit={factories:0,factoryMilliseconds:0,prepares:0,raw:0},native={...params,quality:one?0:75,histogramLow:10};let id=0,abortPrepare=null;
 const analysis={id:'native',imageId:'source',...(one?{synthesis:{key:'median'}}:{}),provenance:{originalSha256:'a'.repeat(64),params:native},data:{width,height,...(one?{energyPlaneCount:1}:{}),energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n),energy_high_score:new Float32Array(n),energy_planes:Array.from({length:count},(_,q)=>Float32Array.from({length:n},(_,i)=>(i%97+q)/17)),energy_summary:[{id:1,bbox:[0,0,width,height]}],metadata:{method:one?'ela_energy_synthesis':'ela_energy',quality:one?null:75,qualities:one?[]:[70,75,80],block:16,energy:{profile:'manual',quantiles:[.01,.99],thresholds:[5,5],...(one?{planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity:'prepared'}:{})}}}};
 const engine={capabilities:()=>({memory:{policyAvailableBytes:outer.limit-outer.total(),knownHeapCapacityBytes:0}}),async reserveExternalMemory({bytes}){const lease={id:++id,bytes};leases.set(lease.id,{lease,free:outer.reserve(bytes)});return lease;},async releaseExternalMemory(id){const entry=leases.get(id);assert(entry);entry.free();leases.delete(id);}};
 const owner=createEnergyParameterPreview({engine,adaptive:false,readOriginal:async(_a,tile)=>({width:Math.ceil(tile.w/tile.step),height:Math.ceil(tile.h/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(tile.w/tile.step)*Math.ceil(tile.h/tile.step)*3).fill(100)}),dependencies:{energyParams:p=>({...p}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,statisticsRuntimeFactory:async options=>{audit.factories++;const started=performance.now(),runtime=await createEnergyStatisticsRuntime({...options,fetcher:async()=>new Response(kernel)});audit.factoryMilliseconds+=performance.now()-started;runtimes.push(runtime);return runtime;},prepareEnergy:async(...args)=>{audit.prepares++;abortPrepare?.abort();return prepareEnergy(...args);},segmentEnergy:async base=>({labels:new Int32Array(base.width*base.height),regions:[]}),energyColor:()=>[0,0,0],renderEnergy:async(_d,original)=>({...original,format:'rgb8'})}});
 return{owner,analysis,engine,audit,runtimes,outer,leases,setAbort:controller=>{abortPrepare=controller;},render:(p={},options={})=>owner.render(analysis,{params:{...native,histogramLow:20,...p},presentation:{view:'overlay',opacity:70},backend:'cpu',preview:{adaptive:false,maxWidth:40,maxHeight:40,maxWorkingBytes:8*1024**2},...options})};
}

for(const one of [false,true])test((one?'one':'three')+' sampled planes use the real Wasm reducer, keep fields and count initialization as cold setup once',async()=>{
 const h=fixture(one),before=h.analysis.data.energy_planes.map(p=>p.slice());try{const first=await h.render();assert.equal(h.audit.factories,1);assert(h.runtimes[0].wasmExecutions>0);assert(Number.isFinite(first.metrics.preparationPhaseMilliseconds.energyStatisticsWasmMs));assert(first.metrics.setupMilliseconds>=h.audit.factoryMilliseconds);assert.equal(first.metrics.cold,true);const calls=h.runtimes[0].wasmExecutions,second=await h.render({histogramLow:30});assert.equal(h.audit.factories,1);assert(h.runtimes[0].wasmExecutions>calls);assert.equal(second.metrics.setupMilliseconds,0);assert.equal(second.metrics.cold,false);assert.equal(second.draft.nativeSampleCache.hit,true);assert.equal(second.draft.nativeSampleCache.sourceReads,0);assert.equal(second.draft.nativeSampleCache.numericFieldsRead,0);assert.deepEqual(h.analysis.data.energy_planes,before);assert.equal([...h.leases.values()].filter(e=>e.lease.bytes===65536).length,1);assert.equal([...h.leases.values()].filter(e=>e.lease.bytes===16384).length,0);}finally{await h.owner.dispose();assert.equal(h.outer.total(),0);assert.equal(h.leases.size,0);}
});

test('native full-grid preparation and sampled frames without reprepare do not initialize a separate runtime',async()=>{
 for(const full of [true,false]){const h=fixture();try{const result=full?await h.render({}, {preview:{adaptive:false,maxWidth:80,maxHeight:80,maxWorkingBytes:8*1024**2}}):await h.render({histogramLow:10});assert.equal(h.audit.factories,0);assert.equal(h.audit.prepares,full?1:0);assert.equal(result.draft.samplingStep,full?1:2);assert.equal(h.runtimes.length,0);}finally{await h.owner.dispose();assert.equal(h.outer.total(),0);}}
});

test('an existing native RawCTX retains priority and never asks the sampled owner for credit',async()=>{
 const h=fixture();h.engine.energyPreviewPreparationContext=async()=>({identity:'native-context',async prepare(){h.audit.raw++;return{energy_scope:h.analysis.data.energy_scope,energy_low_score:h.analysis.data.energy_low_score,energy_high_score:h.analysis.data.energy_high_score,energy_summary:h.analysis.data.energy_summary};}});
 try{const result=await h.render({}, {preview:{adaptive:false,maxWidth:80,maxHeight:80,maxWorkingBytes:8*1024**2}});assert.equal(result.metrics.preparationNativeContext.used,1);assert.equal(h.audit.raw,1);assert.equal(h.audit.prepares,0);assert.equal(h.audit.factories,0);}finally{await h.owner.dispose();assert.equal(h.outer.total(),0);}
});

test('cancellation during sampled preparation retains the pinned reducer for the next current gesture, without retaining its old signal',async()=>{
 const h=fixture(),stop=new AbortController();h.setAbort(stop);try{await assert.rejects(h.render({}, {signal:stop.signal}),{code:'CANCELLED'});assert.equal(h.audit.factories,1);h.setAbort(null);const next=await h.render({histogramLow:30},{signal:new AbortController().signal});assert.equal(h.audit.factories,1);assert.equal(next.metrics.cold,false);assert.equal(next.metrics.setupMilliseconds,0);assert(h.runtimes[0].wasmExecutions>0);}finally{await h.owner.dispose();assert.equal(h.outer.total(),0);}
});
