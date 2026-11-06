import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {segmentEnergy} from '../src/energy-segment.js';
import {segmentSegmentedEnergy,energySegmentationRamPlan} from '../src/energy-segment-stream.js';
const MiB=1024**2;
function fixture(width=23,height=17,{allowed=true,wide=false}={}){
 const n=width*height,scope=new Int32Array(n),low=new Float32Array(n),high=new Float32Array(n),mask=allowed?new Uint8Array(n):undefined,values=Float32Array.of(-0,0,.49999997,.5,.50000006,.99999994,1,1.0000001,3,7);
 for(let i=0;i<n;i++){const y=Math.floor(i/width),x=i%width;scope[i]=y<Math.floor(height*.6)?1:2;low[i]=values[(i*7+x)%values.length];high[i]=values[(i*11+y)%values.length];if(mask)mask[i]=x%7!==2&&y%5!==3?1:0;}
 if(wide)scope.fill(1);
 return{width,height,metadata:{block:wide?1:2},energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_allowed:mask,energy_summary:wide?[{id:1,bbox:[0,0,width,height]}]:[{id:1,bbox:[0,0,width,Math.ceil(height*.8)]},{id:2,bbox:[Math.floor(width*.1),Math.floor(height*.3),width,height]}]};
}
function streams(base,observe=()=>{}){const out={...base};for(const key of ['energy_scope','energy_low_score','energy_high_score','energy_allowed'])if(base[key]){const bytes=new Uint8Array(base[key].buffer);out[key]={byteLength:bytes.length,readInto(target,offset=0){observe(key,target,offset);target.set(bytes.subarray(offset,offset+target.length));}};}return out;}
async function labels(result){const bytes=new Uint8Array(result.labels.byteLength);await result.labels.readInto(bytes);return bytes;}
async function pair(base,params){const expected=await segmentEnergy(base,params),reference=new Uint8Array(expected.labels.buffer),saved={};for(const key of ['energy_scope','energy_low_score','energy_high_score','energy_allowed'])if(base[key])saved[key]=new Uint8Array(base[key].buffer).slice();
 for(const backend of ['stream','contiguous']){const budget=new Budget(128*MiB);let actual;try{actual=await segmentSegmentedEnergy(streams(base,(key,target)=>assert(target.length<=MiB)),params,{budget,segmentationBackend:backend});assert.equal(actual.metrics.segmentationBackend,backend==='stream'?'segmented-stream':'contiguous-ram');assert.deepEqual(await labels(actual),reference,backend+' labels');assert.deepEqual(actual.regions,expected.regions,backend+' regions');for(const key of Object.keys(saved))assert.deepEqual(new Uint8Array(base[key].buffer),saved[key]);}finally{await actual?.dispose();assert.equal(budget.total(),0);}}
}
for(const thresholds of [[0,0],[1,2],[Number.MIN_VALUE,1.0000001]])test('RAM/stream/reference preserve labels, allowed membership, overlap, offset and Float32 boundaries: '+thresholds,async()=>{await pair(fixture(),{thresholds,minimum:0,offset:7});});
test('wide rows crossing page boundaries retain disconnected support and ordered labels',async()=>{await pair(fixture(17003,2,{allowed:false,wide:true}),{thresholds:[1,2],minimum:1,offset:3});});
test('even native score median keeps Float32 overflow to Infinity without accepting non-finite input',async()=>{
 const base=fixture(16,16,{allowed:false,wide:true});base.energy_low_score.fill(Math.fround(3e38));base.energy_high_score.fill(0);await pair(base,{thresholds:[0,0],minimum:1});assert.equal((await segmentEnergy(base,{minimum:1})).regions[0].score,Infinity);
 for(const invalid of [Infinity,NaN,-1])for(const backend of ['stream','contiguous']){const budget=new Budget(16*MiB);base.energy_low_score[0]=invalid;await assert.rejects(segmentSegmentedEnergy(streams(base),{minimum:0},{budget,segmentationBackend:backend}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);}
});
test('pressure uses the existing stream path, and forced RAM refuses before reads or eviction',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),expected=await segmentEnergy(base,{minimum:0});let reads=0,evictions=0;budget.isBackingUnderPressure=()=>true;budget.registerReclaimer(()=>evictions++);
 const actual=await segmentSegmentedEnergy(streams(base),{minimum:0},{budget});try{assert.equal(actual.metrics.segmentationBackend,'segmented-stream');assert.deepEqual(await labels(actual),new Uint8Array(expected.labels.buffer));assert.deepEqual(actual.regions,expected.regions);}finally{await actual.dispose();}
 await assert.rejects(segmentSegmentedEnergy(streams(base,()=>reads++),{minimum:0},{budget,segmentationBackend:'contiguous'}),{code:'MEMORY_LIMIT'});assert.equal(reads,0);assert.equal(evictions,0);assert.equal(budget.total(),0);
 const low=new Budget(1);await assert.rejects(segmentSegmentedEnergy(streams(base,()=>reads++),{}, {budget:low,segmentationBackend:'contiguous'}),{code:'MEMORY_LIMIT'});assert.equal(reads,0);assert.equal(low.total(),0);
});
for(const phase of ['read','segment'])test('cancel '+phase+' leaves inputs unchanged, publishes no labels and returns all credit',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),controller=new AbortController(),snapshot=base.energy_low_score.slice();const read=streams(base,()=>{if(phase==='read')controller.abort();});
 await assert.rejects(segmentSegmentedEnergy(read,{minimum:0},{budget,signal:controller.signal,segmentationBackend:'contiguous',onProgress:()=>{if(phase==='segment')controller.abort();}}),{code:'CANCELLED'});assert.deepEqual(base.energy_low_score,snapshot);assert.equal(budget.total(),0);
});
test('consumer primary frozen failure survives refused scratch ACK, retained credit and retry',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),register=budget.registerBacking.bind(budget),primary=Object.freeze(Object.assign(Error('frozen consumer'),{code:'CONSUMER'})),cleanup=Object.freeze(Object.assign(Error('scratch retirement refused'),{code:'ACK_REFUSED'}));let refuse=true;
 budget.registerBacking=(kind,bytes,options)=>{const release=register(kind,bytes,options);return options.label==='energy_scope'?()=>{if(refuse)throw cleanup;return release();}:release;};
 await assert.rejects(segmentSegmentedEnergy(streams(base),{minimum:0},{budget,segmentationBackend:'contiguous',onProgress:()=>{throw primary;}}),error=>error===primary);assert(budget.total()>=energySegmentationRamPlan(base.width,base.height,2,{allowed:true}).workingBytes);refuse=false;await budget.reclaim(budget.limit);assert.equal(budget.total(),0);
});
test('RAM estimate includes copies, native scratch, overlapping output labels, allowed and migration without a resolution cap',()=>{
 const p=energySegmentationRamPlan(2255,1511,3,{allowed:true,migrationBytes:2*MiB}),n=2255*1511;assert.equal(p.inputBytes,13*n);assert.equal(p.outputBytes,4*n);assert(p.requiredBytes>=35*n+2*MiB);assert(p.requiredBytes<128*MiB);assert(energySegmentationRamPlan(6000,6000,3).requiredBytes>1024*MiB);assert.throws(()=>energySegmentationRamPlan(0,1,0),{code:'INVALID_INPUT'});
});

for(const [name,TypeName]of [['input','Float32Array'],['reference scratch','Uint32Array']])test('auto retries the segmented path only after a qualified '+name+' allocation failure retires',async()=>{
 const base=fixture(),expected=await segmentEnergy(base,{minimum:0}),budget=new Budget(32*MiB),Native=globalThis[TypeName],n=base.width*base.height;let failed=false,actual;
 globalThis[TypeName]=class extends Native{constructor(length,...rest){if(!failed&&length===n){failed=true;throw new RangeError('Controlled array buffer allocation failure');}super(length,...rest);}};
 try{actual=await segmentSegmentedEnergy(streams(base),{minimum:0},{budget});assert(failed);assert.equal(actual.metrics.segmentationBackend,'segmented-stream');assert.deepEqual(await labels(actual),new Uint8Array(expected.labels.buffer));assert.deepEqual(actual.regions,expected.regions);}finally{globalThis[TypeName]=Native;await actual?.dispose();assert.equal(budget.total(),0);}
});
test('an allocator failure with a refused ACK cannot start fallback before retirement succeeds',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),register=budget.registerBacking.bind(budget),Native=globalThis.Uint32Array,n=base.width*base.height,ackError=Object.freeze(Object.assign(Error('retire before fallback'),{code:'ACK_REFUSED'}));let failed=false,refuse=true,reads=0;
 budget.registerBacking=(kind,bytes,options)=>{const free=register(kind,bytes,options);return options.label==='energy_scope'?()=>{if(refuse)throw ackError;return free();}:free;};
 globalThis.Uint32Array=class extends Native{constructor(length,...rest){if(!failed&&length===n){failed=true;throw new RangeError('Controlled native scratch allocation failure');}super(length,...rest);}};
 try{await assert.rejects(segmentSegmentedEnergy(streams(base,()=>reads++),{minimum:0},{budget}),{code:'MEMORY_ALLOCATION'});assert.equal(reads,4,'only contiguous scope/low/high/allowed read before failure; no stream retry');assert(budget.total()>0);refuse=false;await budget.reclaim(budget.limit);assert.equal(budget.total(),0);}finally{globalThis.Uint32Array=Native;refuse=false;await budget.reclaim(budget.limit);}
});
for(const phase of ['read','consumer'])test('auto never mistakes a '+phase+' RangeError or resource error for its own allocator failure',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),primary=Object.freeze(Object.assign(new RangeError('Array buffer allocation failed in caller'),{code:'MEMORY_ALLOCATION'}));let reads=0;
 await assert.rejects(segmentSegmentedEnergy(streams(base,()=>{reads++;if(phase==='read')throw primary;}),{minimum:0},{budget,onProgress:()=>{if(phase==='consumer')throw primary;}}),error=>error===primary);assert.equal(reads,phase==='read'?1:4);assert.equal(budget.total(),0);
});

test('scratch retirement ACK completes before RAM result publication and cancellation still retires the output',async()=>{
 const base=fixture(),budget=new Budget(32*MiB),register=budget.registerBacking.bind(budget),controller=new AbortController();let enter,ack,published=false;
 const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>ack=resolve);
 budget.registerBacking=(kind,bytes,options)=>{const free=register(kind,bytes,options);return options.label==='energy_scope'?async()=>{enter();await gate;return free();}:free;};
 const running=segmentSegmentedEnergy(streams(base),{minimum:0},{budget,signal:controller.signal,segmentationBackend:'contiguous'}).then(result=>{published=true;return result;});
 const rejection=assert.rejects(running,{code:'CANCELLED'});await entered;assert.equal(published,false);assert(budget.total()>=energySegmentationRamPlan(base.width,base.height,2,{allowed:true}).workingBytes);controller.abort();ack();await rejection;assert.equal(published,false);assert.equal(budget.total(),0);
});


test('a source rejecting null is preserved and never mistaken for an unrecorded allocation failure',async()=>{
 const base=fixture(),budget=new Budget(32*MiB);let reads=0;
 await assert.rejects(segmentSegmentedEnergy(streams(base,()=>{reads++;throw null;}),{minimum:0},{budget}),error=>error===null);assert.equal(reads,1);assert.equal(budget.total(),0);
});

test('a qualified new output-bank allocation failure retires RAM scratch before auto stream retry',async()=>{
 const base=fixture(),expected=await segmentEnergy(base,{minimum:0}),budget=new Budget(32*MiB),Native=globalThis.Uint8Array,n=base.width*base.height;let failed=false,actual;
 globalThis.Uint8Array=class extends Native{constructor(length,...rest){if(!failed&&length===n*4){failed=true;throw new RangeError('Controlled new output bank allocation failure');}super(length,...rest);}};
 try{actual=await segmentSegmentedEnergy(streams(base),{minimum:0},{budget});assert(failed);assert.equal(actual.metrics.segmentationBackend,'segmented-stream');assert.deepEqual(new Native(await labels(actual)),new Native(expected.labels.buffer));assert.deepEqual(actual.regions,expected.regions);}finally{globalThis.Uint8Array=Native;await actual?.dispose();assert.equal(budget.total(),0);}
});
