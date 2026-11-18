import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgb16Bank} from '../src/rgb16-surface.js';
import {runNative16Transform} from '../src/native16-transforms.js';
import {runNative16Operation} from '../src/native16-operations.js';

async function fixture({sourceDepth=12,sourceNack}={}){
 const width=83,height=79,budget=new Budget(128*1024**2),data=Uint16Array.from({length:width*height*3},(_,i)=>33000+(i*73+Math.floor(i/7)*19)%251),bank=await createRgb16Bank({width,height,budget,storage:'memory',sourceDepth,color:{primaries:'srgb',transfer:'srgb'}});await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),originalDispose=surface.dispose.bind(surface),originalRead=surface.readWindow.bind(surface),state={backingAttempts:0,reads:0};
 surface.dispose=()=>{state.backingAttempts++;if(state.backingAttempts===1&&sourceNack!==undefined)return sourceNack;return originalDispose();};surface.readWindow=(...args)=>{state.reads++;return originalRead(...args);};return{width,height,budget,data,bank,surface,state};
}
const run=(f,params={},options={})=>runNative16Transform('detail.wavelets',f.surface,{wavelet:'db2',threshold:31,...params},{budget:f.budget,backend:'cpu',maxWorkers:1,...options});
async function pixels(surface){const part=await surface.readWindow();try{return part.pixels.data.slice();}finally{part.release();}}
async function refused(task,reason){try{await task;assert.fail('Retirement must reject');}catch(error){if(error?.code==='ERR_ASSERTION')throw error;assert.ok(error===reason||error?.thrownValue===reason||error?.cause===reason||error?.cleanupOwner,'NACK remains represented');return error;}}

for(const nack of [false,0])test(`native16 result disposal retains a ${String(nack)} NACK owner and retries every unreleased output`,async()=>{
 const f=await fixture();let result;try{result=await run(f);const before=f.budget.total(),original=result.surface.dispose.bind(result.surface);let attempts=0;result.surface.dispose=()=>++attempts===1?nack:original();const failure=await refused(result.dispose(),nack);assert.equal(f.budget.total(),before);assert.equal(f.state.backingAttempts,0);assert.equal(typeof failure.cleanupOwner?.dispose,'function');await result.dispose();assert.equal(attempts,2);assert.ok(f.budget.total()<before);assert.deepEqual(await pixels(f.surface),f.data);}finally{await result?.dispose();await f.bank.dispose();}assert.equal(f.budget.total(),0);
});

for(const nack of [false,0])test(`source backing is protected until a cached transform ${String(nack)} NACK is acknowledged`,async()=>{
 const f=await fixture();let result;try{result=await run(f);await result.dispose();const cache=result.waveletCache,dispose=cache.dispose.bind(cache),before=f.budget.total();let attempts=0;cache.dispose=()=>++attempts===1?nack:dispose();await refused(f.surface.dispose(),nack);assert.equal(f.state.backingAttempts,0);assert.equal(f.budget.total(),before);assert.deepEqual(await pixels(f.surface),f.data);assert.throws(()=>run(f),{code:'DISPOSED'});await f.surface.dispose();assert.equal(attempts,2);assert.equal(f.state.backingAttempts,1);assert.equal(f.budget.total(),0);}finally{await result?.dispose();await f.bank.dispose();}
});

for(const nack of [false,0])test(`native source ${String(nack)} NACK is retried without forgetting its backing`,async()=>{
 const f=await fixture({sourceNack:nack});let result;try{result=await run(f);await result.dispose();await refused(f.surface.dispose(),nack);assert.equal(f.state.backingAttempts,1);assert.ok(f.budget.total()>0);assert.deepEqual(await pixels(f.surface),f.data);await f.surface.dispose();assert.equal(f.state.backingAttempts,2);assert.equal(f.budget.total(),0);}finally{await result?.dispose();await f.bank.dispose();}
});

test('a partially retired coefficient cache is acknowledged before reusing its former family',async()=>{
 const f=await fixture();let first,next;try{first=await run(f);await first.dispose();const cache=first.waveletCache,dispose=cache.dispose.bind(cache);let attempts=0;cache.dispose=async()=>{if(++attempts===1){await cache.a.dispose();return false;}return dispose();};await refused(run(f,{wavelet:'sym4'}),false);next=await run(f,{wavelet:'db2'});assert.equal(attempts,2);assert.equal(next.metrics.coefficientsCached,false);assert.notEqual(next.waveletCache,cache);assert.deepEqual(await pixels(f.surface),f.data);}finally{await first?.dispose();await next?.dispose();await f.bank.dispose();}assert.equal(f.budget.total(),0);
});

test('caller cancellation preserves native source and previous output without latching the first request signal',async()=>{
 const f=await fixture(),controller=new AbortController(),base=f.budget.total();let recovered,previous;try{await assert.rejects(run(f,{}, {signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(f.budget.total(),base);assert.deepEqual(await pixels(f.surface),f.data);recovered=await run(f);const stable=await pixels(recovered.surface);previous=recovered;recovered=null;const retained=f.budget.total(),stop=new AbortController();await assert.rejects(run(f,{threshold:67},{signal:stop.signal,onProgress:()=>stop.abort()}),{code:'CANCELLED'});assert.equal(f.budget.total(),retained);assert.deepEqual(await pixels(previous.surface),stable);}finally{await recovered?.dispose();await previous?.dispose();await f.bank.dispose();}assert.equal(f.budget.total(),0);
});

test('source disposal cancels its active transform and waits for all transaction owners before releasing source backing',async()=>{
 const f=await fixture();let closing;try{await assert.rejects(run(f,{}, {onProgress:()=>{closing??=f.surface.dispose();assert.equal(f.state.backingAttempts,0);}}),{code:'CANCELLED'});await closing;assert.equal(f.state.backingAttempts,1);assert.equal(f.budget.total(),0);assert.throws(()=>run(f),{code:'DISPOSED'});}finally{await closing?.catch(()=>{});await f.bank.dispose();}
});

for(const sourceDepth of [10,12,14])test(`${sourceDepth}-bit native transform parameters reuse coefficients without rereading or changing native samples`,async()=>{
 const f=await fixture({sourceDepth}),results=[];try{const first=await runNative16Operation('detail.wavelets',{wavelet:'db2',threshold:25},{surface:f.surface,budget:f.budget,backend:'cpu'});results.push(first);const reads=f.state.reads,reference=await pixels(first.surface);for(const threshold of [35,25]){const next=await runNative16Operation('detail.wavelets',{wavelet:'db2',threshold},{surface:f.surface,budget:f.budget,backend:'cpu'});results.push(next);assert.equal(next.metrics.coefficientsCached,true);assert.equal(next.metrics.sourceDepth,sourceDepth);assert.equal(next.provenance.sourceDepth,sourceDepth);assert.equal(next.provenance.numericalInputDepth,16);assert.equal(f.state.reads,reads);if(threshold===25)assert.deepEqual(await pixels(next.surface),reference);}assert.deepEqual(await pixels(f.surface),f.data);}finally{for(const result of results)await result.dispose();await f.bank.dispose();}assert.equal(f.budget.total(),0);
});

test('native frequency result disposal acknowledges each secondary RGB view and retains its base cache',async()=>{
 const f=await fixture();let record;try{record=await runNative16Transform('detail.frequency',f.surface,{}, {budget:f.budget,backend:'cpu',maxWorkers:1});const entries=Object.values(record.rgbRecords??{});assert.ok(entries.length>=3);const target=entries[0].surface,dispose=target.dispose.bind(target);let attempts=0;target.dispose=()=>++attempts===1?0:dispose();const before=f.budget.total();await refused(record.dispose(),0);assert.ok(f.budget.total()>0&&f.budget.total()<=before);await record.dispose();assert.equal(attempts,2);assert.equal(f.budget.total(),before,'analysis cache still owns the leased result backing');assert.deepEqual(await pixels(f.surface),f.data);}finally{await record?.dispose();await f.bank.dispose();}assert.equal(f.budget.total(),0);
});
