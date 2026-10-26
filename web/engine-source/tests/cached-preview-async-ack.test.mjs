import test from 'node:test';
import assert from 'node:assert/strict';
import * as sampling from '../src/cached-parameter-preview.js';
import {Budget} from '../src/cache.js';
import {retainResult} from '../src/retained-result.js';

const MiB=1024**2,tile={x:0,y:0,w:2,h:2,step:1},turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const fault=code=>Object.freeze(Object.assign(new Error(code),{code}));
function source(budget,releaseFrame){
 let reads=0,releases=0,disposed=0;const bytes=Uint8Array.from({length:12},(_,i)=>i+1);
 const surface={descriptor:{width:2,height:2,format:'rgb8'},async readSampledWindow(){reads++;const free=budget.reserve(bytes.length);let done=false;return{pixels:{width:2,height:2,format:'rgb8',data:bytes},async release(){releases++;if(done)return;await releaseFrame?.(releases);done=true;free();}};},dispose(){disposed++;}};
 return{surface,get reads(){return reads;},get releases(){return releases;},get disposed(){return disposed;},bytes};
}
const stereo=(image,master,budget,signal)=>sampling.previewCachedStereo(image,{offset:0,views:new Map([[1,master]])},{mode:1},{maxSide:2,maxPixels:4,maxWorkingBytes:48*MiB},{budget,signal});

test('source copy waits for its real asynchronous frame ACK',async()=>{
 const budget=new Budget(64*MiB),ack=deferred(),image=source(budget,()=>ack.promise);let settled=false;
 const request=sampling.sampleCachedSource(image,tile).then(value=>(settled=true,value));
 await turn();assert.equal(settled,false);assert.equal(budget.active,12);assert.equal(image.releases,1);
 ack.resolve();const answer=await request;assert.deepEqual(answer.data,image.bytes);assert.notEqual(answer.data,image.bytes);assert.equal(budget.active,0);
});
test('a rejected source ACK is visible and explicitly retryable without another read',async()=>{
 const budget=new Budget(64*MiB),error=fault('STORAGE_IO'),image=source(budget,n=>{if(n===1)throw error;});
 await assert.rejects(sampling.sampleCachedSource(image,tile),value=>value===error);assert.equal(budget.active,12);assert.equal(image.reads,1);
 await sampling.retireCachedPreviewSamples(image);assert.equal(image.reads,1);assert.equal(image.releases,2);assert.equal(budget.active,0);
 await sampling.retireCachedPreviewSamples(image);assert.equal(image.releases,2);
});
test('a new sample first retries older pending ACKs; cancellation is rechecked after ACK',async()=>{
 const budget=new Budget(64*MiB),error=fault('STORAGE_IO'),ack=deferred(),controller=new AbortController();
 const image=source(budget,n=>{if(n===1)throw error;if(n===2)return ack.promise;});
 await assert.rejects(sampling.sampleCachedSource(image,tile),value=>value===error);
 const request=sampling.sampleCachedSource(image,tile,{signal:controller.signal});await turn();assert.equal(image.reads,1);controller.abort();ack.resolve();
 await assert.rejects(request,{code:'CANCELLED'});assert.equal(image.reads,1);assert.equal(budget.active,0);
});
test('abort during the final ACK cannot publish a successful source copy',async()=>{
 const budget=new Budget(64*MiB),ack=deferred(),controller=new AbortController(),image=source(budget,()=>ack.promise);
 const request=sampling.sampleCachedSource(image,tile,{signal:controller.signal});await turn();controller.abort();ack.resolve();
 await assert.rejects(request,{code:'CANCELLED'});assert.equal(budget.active,0);
});
test('a frozen primary survives failed frame cleanup and the frame remains retryable',async()=>{
 const budget=new Budget(64*MiB),primary=fault('FROZEN_COPY_FAILURE'),cleanup=fault('STORAGE_IO'),image=source(budget,n=>{if(n===1)throw cleanup;});
 const read=image.surface.readSampledWindow;image.surface.readSampledWindow=async(...args)=>{const frame=await read(...args);frame.pixels={...frame.pixels,data:{slice(){throw primary;}}};return frame;};
 await assert.rejects(sampling.sampleCachedSource(image,tile),value=>value===primary);assert.equal(budget.active,12);
 await sampling.retireCachedPreviewSamples(image);assert.equal(budget.active,0);assert.equal(image.releases,2);
});
test('surface identity keeps old pending owners separate from replacement records',async()=>{
 const budget=new Budget(64*MiB),error=fault('STORAGE_IO'),old=source(budget,n=>{if(n===1)throw error;}),fresh=source(budget);
 const owners=new Set([old]);await assert.rejects(sampling.sampleCachedSource(old,tile),value=>value===error);
 owners.add(fresh);await sampling.sampleCachedSource(fresh,tile);assert.equal(budget.active,12);assert.equal(old.releases,1);
 for(const image of owners){await sampling.retireCachedPreviewSamples(image);owners.delete(image);}assert.equal(budget.active,0);assert.equal(old.releases,2);
});
test('stereo cached-view parent stays alive until its sampled-frame ACK succeeds',async()=>{
 const budget=new Budget(64*MiB),error=fault('STORAGE_IO'),image=source(budget,n=>{if(n===1)throw error;}),master=retainResult(image.surface);
 await assert.rejects(stereo(image,master,budget),value=>value===error);assert.equal(budget.active,12);await master.dispose();assert.equal(image.disposed,0);
 await sampling.retireCachedPreviewSamples(master);assert.equal(image.releases,2);assert.equal(image.disposed,1);assert.equal(budget.active,0);
});
test('concurrent explicit retirements share one pending source ACK and never reread',async()=>{
 const budget=new Budget(64*MiB),error=fault('STORAGE_IO'),ack=deferred(),image=source(budget,n=>{if(n===1)throw error;return ack.promise;});
 await assert.rejects(sampling.sampleCachedSource(image,tile),value=>value===error);
 const a=sampling.retireCachedPreviewSamples(image),b=sampling.retireCachedPreviewSamples(image);await turn();assert.equal(image.releases,2);assert.equal(budget.active,12);ack.resolve();await Promise.all([a,b]);assert.equal(image.releases,2);assert.equal(image.reads,1);assert.equal(budget.active,0);
});
test('disposing a retained stereo owner waits for an active sampled read before closing its parent',async()=>{
 const budget=new Budget(64*MiB),entered=deferred(),readReady=deferred(),image=source(budget),master=retainResult(image.surface),read=image.surface.readSampledWindow;
 image.surface.readSampledWindow=async(...args)=>{entered.resolve();await readReady.promise;return read(...args);};
 const request=stereo(image,master,budget);await entered.promise;let finished=false;const cleanup=sampling.retireCachedPreviewSamples(master).then(()=>{finished=true;});await turn();await master.dispose();assert.equal(finished,false);assert.equal(image.disposed,0);readReady.resolve();await request;await cleanup;assert.equal(image.disposed,1);assert.equal(budget.active,0);
});
test('a rejected final stereo parent ACK is retryable through the real retained owner',async()=>{
 const budget=new Budget(64*MiB),ack=deferred(),entered=deferred(),error=fault('PARENT_STORAGE_IO'),free=budget.reserve(31),image=source(budget,()=>{entered.resolve();return ack.promise;});let calls=0;
 image.surface.dispose=async()=>{if(++calls===1)throw error;free();};const master=retainResult(image.surface),request=stereo(image,master,budget);
 await entered.promise;await master.dispose();ack.resolve();await assert.rejects(request,value=>value===error);assert.equal(budget.active,31);assert.equal(calls,1);
 await sampling.retireCachedPreviewSamples(master);assert.equal(calls,2);assert.equal(budget.active,0);assert.equal(image.reads,1);await sampling.retireCachedPreviewSamples(master);assert.equal(calls,2);
});
