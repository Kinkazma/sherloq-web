import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {segmentedStereogram} from '../src/segmented-stereogram.js';
import {retainResult} from '../src/retained-result.js';
import {previewCachedStereo,hasCachedPreviewSamples} from '../src/cached-parameter-preview.js';
const MiB=1024**2,fault=()=>Object.freeze(Object.assign(new Error('ACK refused'),{code:'STORAGE_IO'})),turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function nativeCache(budget){const image={surface:{descriptor:{width:42,height:2,format:'rgb8'},async readWindow({width,height}){return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)},release(){}};}}};const result=await segmentedStereogram(image,{mode:0},{budget});assert.equal(result.surface,null);assert.equal(result.data.offset,null);return{image,cache:result.stereoCache};}
function view(budget,releaseFrame,disposeMaster){let releases=0,disposals=0;const data=new Uint8Array(42*2*3);const master=retainResult({descriptor:{width:42,height:2,format:'rgb8'},async readSampledWindow(){const free=budget.reserve(data.length);let done=false;return{pixels:{width:42,height:2,format:'rgb8',data},async release(){if(done)return;await releaseFrame?.(++releases);done=true;free();}};},async dispose(){disposals++;await disposeMaster?.(disposals);}});return{master,get releases(){return releases;},get disposals(){return disposals;}};}
function preview(image,cache,budget){return previewCachedStereo(image,cache,{mode:1},{maxSide:42,maxPixels:84,maxWorkingBytes:48*MiB},{budget});}

test('native stereo cache retains failed sampled-frame owners and metadata until a successful retry',async()=>{
 const budget=new Budget(64*MiB),{image,cache}=await nativeCache(budget),metadata=cache.differences.byteLength,error=fault(),sample=view(budget,n=>{if(n<3)throw error;});cache.offset=0;cache.views.set(1,sample.master);
 await assert.rejects(preview(image,cache,budget),value=>value===error);assert.equal(hasCachedPreviewSamples(sample.master),true);
 await assert.rejects(cache.dispose(),value=>value===error);assert.equal(cache.views.get(1),sample.master);assert.equal(budget.retained,metadata);assert.equal(budget.active,252);assert.equal(sample.disposals,0);
 await cache.dispose();assert.equal(cache.views.size,0);assert.equal(budget.total(),0);assert.equal(sample.disposals,1);await cache.dispose();assert.equal(sample.disposals,1);
});
test('independent masters are retired even when another parent ACK fails; failed owners stay retryable',async()=>{
 const budget=new Budget(64*MiB),{cache}=await nativeCache(budget),metadata=cache.differences.byteLength,error=fault(),a=view(budget,undefined,n=>{if(n===1)throw error;}),b=view(budget);cache.views.set(0,a.master);cache.views.set(1,b.master);
 await assert.rejects(cache.dispose(),value=>value===error);assert.equal(a.disposals,1);assert.equal(b.disposals,1);assert.equal(cache.views.size,1);assert.equal(cache.views.get(0),a.master);assert.equal(budget.retained,metadata);
 await cache.dispose();assert.equal(a.disposals,2);assert.equal(b.disposals,1);assert.equal(cache.views.size,0);assert.equal(budget.total(),0);
});
test('cache disposal coalesces a pending sample ACK and preserves a published UI lease',async()=>{
 const budget=new Budget(64*MiB),{image,cache}=await nativeCache(budget),entered=deferred(),ack=deferred(),sample=view(budget,()=>{entered.resolve();return ack.promise;});cache.offset=0;cache.views.set(1,sample.master);const ui=sample.master.lease(),request=preview(image,cache,budget);await entered.promise;
 const a=cache.dispose(),b=cache.dispose();assert.equal(a,b);let settled=false;a.then(()=>settled=true);await turn();assert.equal(settled,false);assert.equal(sample.disposals,0);ack.resolve();await request;await a;assert.equal(sample.disposals,0);assert.equal(budget.total(),0);await ui.dispose();assert.equal(sample.disposals,1);
});
test('flow owner ACK failure retains the flow record and cache metadata for retry',async()=>{
 const budget=new Budget(64*MiB),{cache}=await nativeCache(budget),metadata=cache.differences.byteLength,error=fault();let calls=0;const flow={owner:{async dispose(){if(++calls===1)throw error;}}};cache.flow=flow;
 await assert.rejects(cache.dispose(),value=>value===error);assert.equal(cache.flow,flow);assert.equal(budget.retained,metadata);await cache.dispose();assert.equal(cache.flow,null);assert.equal(calls,2);assert.equal(budget.total(),0);
});
test('a cache already closing cannot be reused for a new native stereo analysis',async()=>{
 const budget=new Budget(64*MiB),{image,cache}=await nativeCache(budget),ack=deferred(),sample=view(budget,undefined,()=>ack.promise);cache.views.set(1,sample.master);const closing=cache.dispose();
 await assert.rejects(segmentedStereogram(image,{mode:0},{budget,cache}),/closing or closed/);ack.resolve();await closing;assert.equal(budget.total(),0);
});
