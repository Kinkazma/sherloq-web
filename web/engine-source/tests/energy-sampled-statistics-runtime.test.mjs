import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareEnergy} from '../src/energy-prepare.js';
import {energyArrayPairwise} from '../src/energy-statistics.js';
import {createEnergyStatisticsRuntime} from '../src/energy-statistics-runtime.js';
import {createEnergyPreparationContextOwner} from '../src/energy-preparation-context.js';
import {Budget} from '../src/cache.js';

const PAGE=65536,bytes=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const kernel=await readFile(new URL('../vendor/energy-statistics/statistics.wasm',import.meta.url));
const factory=options=>createEnergyStatisticsRuntime({...options,fetcher:async()=>new Response(kernel)});
function fixture(n=129,planeCount=3,{scoped=true}={}){
 const width=n,height=1,data=new Uint8Array(n*3).fill(100),backing=new Float32Array(planeCount*n+5),planes=backing.subarray(3,3+planeCount*n),words=new Uint32Array(planes.buffer,planes.byteOffset,planes.length),special=[0,0x80000000,1,0x007fffff,0x00800000,0x3f000001,0x437effff,0x437f0000];
 for(let i=0;i<planes.length;i++){if(i%17<special.length)words[i]=special[i%17];else planes[i]=Math.fround((i*37%997)/13);}
 for(let i=1;i<n;i++)if(i%23===0)data.fill(0,i*3,i*3+3);else if(i%29===0)data.fill(255,i*3,i*3+3);
 const polygon=[[0,0],[width-1,0],[width-1,0],[0,0]],scope=Int32Array.from({length:n},(_,i)=>i%13===0?0:i%2?23:7);
 return{image:{width,height,format:'rgb8',data},planes,options:{planeCount,minimumPanelSamples:1,panelDetector:async()=>scoped?[polygon,polygon]:[polygon],...(scoped?{draftSourceScope:scope,panelIds:[7,23]}:{})}};
}
function exact(actual,expected){for(const name of['energy_scope','energy_low_score','energy_high_score'])assert.deepEqual(bytes(actual[name]),bytes(expected[name]),name);assert.deepEqual(actual.energy_summary,expected.energy_summary);}
function checkedRuntime(extra={}){return{wasmExecutions:0,reduce:energyArrayPairwise,...extra};}
async function withRuntime(run){const budget=new Budget(4*1024**2),runtime=await factory({budget});assert(runtime,'The pinned Wasm kernel must instantiate in this qualification');const unpin=runtime.pin();try{return await run(runtime,budget);}finally{unpin();await runtime.dispose();assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,0);}}

test('sampled one/three-plane preparations use the pinned Wasm kernel with exact arrays, probes, scopes and account requests',async()=>{
 await withRuntime(async(runtime,budget)=>{
  for(const planeCount of[1,3])for(const n of[1,7,8,127,128,129,8192,8193])for(const quantiles of[[0,1],[.1,.9],[.5,.5]]){
   const f=fixture(n,planeCount),original=bytes(f.planes).slice(),source=f.image.data.slice(),accounts=[[],[]],phases={},before=runtime.wasmExecutions;
   const expected=await prepareEnergy(f.image,f.planes,quantiles,Math.log,{...f.options,account:n=>accounts[0].push(n)}),actual=await prepareEnergy(f.image,f.planes,quantiles,Math.log,{...f.options,account:n=>accounts[1].push(n),statisticsRuntime:runtime,onTiming:(name,ms)=>phases[name]=ms});
   exact(actual,expected);assert.deepEqual(accounts[1],accounts[0]);assert.deepEqual(bytes(f.planes),original);assert.deepEqual(f.image.data,source);assert.equal(budget.total(),PAGE);
   if(actual.energy_summary.length){assert(runtime.wasmExecutions>before);assert(Number.isFinite(phases.energyStatisticsWasmMs));}
  }
 });
});

test('the borrowed runtime also preserves the radix-rank and score-memoization preparation routes',async()=>{
 await withRuntime(async runtime=>{const f=fixture(513,3);for(const scoreMemoization of[false,true]){const options={...f.options,rankSelection:false,scoreMemoization},expected=await prepareEnergy(f.image,f.planes,[.04,.83],Math.log,options),actual=await prepareEnergy(f.image,f.planes,[.04,.83],Math.log,{...options,statisticsRuntime:runtime});exact(actual,expected);}});
});

test('arrayStatistics false ignores an optional runtime entirely and keeps the reference reduction',async()=>{
 const f=fixture(),runtime=new Proxy({},{get(){assert.fail('The explicit reference path must not inspect a runtime');}}),expected=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,arrayStatistics:false}),actual=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,arrayStatistics:false,statisticsRuntime:runtime});exact(actual,expected);
});

test('selected optional runtime shape is checked without inventing Wasm execution evidence',async()=>{
 const f=fixture();for(const statisticsRuntime of[0,false,{},checkedRuntime({reduce:0}),checkedRuntime({filterInto:1}),checkedRuntime({wasmExecutions:-1}),checkedRuntime({wasmExecutions:.5}),checkedRuntime({wasmExecutions:NaN})])await assert.rejects(prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,statisticsRuntime}),{code:'INVALID_INPUT'});
 const phases={},expected=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,f.options),actual=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,statisticsRuntime:{reduce:energyArrayPairwise},onTiming:name=>phases[name]=true});exact(actual,expected);assert.equal(phases.energyStatisticsWasmMs,undefined);
});

test('capture and existing RawCTX reducers take precedence over an unrelated optional runtime',async()=>{
 const f=fixture(129,1,{scoped:false}),budget=new Budget(64*1024**2),owner=createEnergyPreparationContextOwner(budget,{statisticsRuntimeFactory:factory}),options={...f.options,minimumPanelSamples:64,draftSourceScope:undefined,panelIds:undefined},poison=checkedRuntime({reduce(){assert.fail('The NativeCTX reducer has priority');},filterInto(){assert.fail('The NativeCTX filter has priority');}});
 try{const expected=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,options),captured=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...options,statisticsRuntime:poison,capturePreparationContext:{owner,key:'native'}});exact(captured,expected);const context=owner.lookup('native');assert(context);const actual=await prepareEnergy({width:f.image.width,height:f.image.height,format:'rgb8'},null,[.1,.9],Math.log,{planeCount:1,preparationContext:context,statisticsRuntime:poison});exact(actual,expected);}finally{await owner.dispose();}assert.equal(budget.total(),0);
});

test('an already selected numerical runtime preserves frozen and falsy failures without retry or disposal',async()=>{
 const f=fixture();for(const primary of[0,false,null,undefined,Object.freeze(Error('frozen reducer failure'))])for(const method of['reduce','filterInto']){let calls=0;const runtime=checkedRuntime({[method](){calls++;throw primary;},dispose(){assert.fail('The preparation does not own this runtime');}});await assert.rejects(prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,statisticsRuntime:runtime}),error=>error===primary);assert.equal(calls,1);}
});

test('a current abort between filter chunks preserves inputs and ownership, and a fresh signal reuses the same runtime',async()=>{
 await withRuntime(async(runtime,budget)=>{const f=fixture(8193,1,{scoped:false}),original=bytes(f.planes).slice(),controller=new AbortController(),filter=runtime.filterInto.bind(runtime);let calls=0;const borrowed={get wasmExecutions(){return runtime.wasmExecutions;},reduce:runtime.reduce.bind(runtime),filterInto(...args){const result=filter(...args);if(++calls===1)controller.abort();return result;},dispose(){assert.fail('No ownership is transferred');}};await assert.rejects(prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,statisticsRuntime:borrowed,signal:controller.signal}),{code:'CANCELLED'});assert.equal(calls,1);assert.equal(budget.total(),PAGE);assert.deepEqual(bytes(f.planes),original);const expected=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,f.options),actual=await prepareEnergy(f.image,f.planes,[.1,.9],Math.log,{...f.options,statisticsRuntime:runtime,signal:new AbortController().signal});exact(actual,expected);});
});

test('the optional statistics runtime leaves the requested GPU score path and its input plane identity intact',async()=>{
 await withRuntime(async runtime=>{const f=fixture(),runs=[];const provider={selectBackend:()=> 'webgpu',async runScores(planes,scope,summaries,{low,high,planeCount}){assert.equal(planes,f.planes);assert.equal(planeCount,3);runs.push(summaries);low.fill(2);high.fill(3);return{backend:'webgpu-controlled',totalMs:1};}},expected=await prepareEnergy(f.image,f.planes,[.1,.9],()=>assert.fail('No CPU scores'),{...f.options,scoreGpu:provider,scoreBackend:'webgpu'}),actual=await prepareEnergy(f.image,f.planes,[.1,.9],()=>assert.fail('No CPU scores'),{...f.options,scoreGpu:provider,scoreBackend:'webgpu',statisticsRuntime:runtime});exact(actual,expected);assert.equal(runs.length,2);assert.equal(actual.scoreRuntime.backend,'webgpu-controlled');assert(runtime.wasmExecutions>0);});
});
