import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfRetainedPageData} from '../sherloq-browser/assets/pdf-retained-page.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(condition){for(let n=0;n<200;n++){if(condition())return;await tick();}throw Error('Retained preparation did not reach the expected state.');}
function fixture({manual=false,failRender}={}){
 const calls=[],writes=[],errors=[],retained=new Map(),waiting=[];let aborted=0,releases=0,disposed=0,reads=0;
 const storage={memoryBudgetBytes:1024**2,create:async()=>({storage:'memory'}),write:async(id,index,pixels)=>{writes.push(index);retained.set(index,new Uint8Array(pixels.data));return{storage:'memory'};},sample:async(id,rect,width,height)=>({pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3).fill(73)}}),read:async(id,rect)=>{reads++;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(73)}};},dispose:async()=>{disposed++;retained.clear();}};
 const data=createPdfRetainedPageData({width:300,height:130,storage,onError:e=>errors.push(e),renderWindow:request=>{calls.push(request);if(failRender)throw failRender;const answer=()=>{request.signal.throwIfAborted();const width=Math.ceil(request.bounds[2]*request.scale),height=Math.ceil(request.bounds[3]*request.scale);return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3).fill(73)},release(){releases++;}};};if(!manual)return Promise.resolve(answer());return new Promise((resolve,reject)=>{const abort=()=>{aborted++;reject(request.signal.reason);};request.signal.addEventListener('abort',abort,{once:true});waiting.push(()=>{request.signal.removeEventListener('abort',abort);if(request.signal.aborted)return;resolve(answer());});});}});
 return{data,calls,writes,errors,retained,waiting,get aborted(){return aborted;},get releases(){return releases;},get disposed(){return disposed;},get reads(){return reads;},async finishOne(){await until(()=>waiting.length>0);waiting.shift()();await tick();}};
}
test('inactive retained page does no anticipatory rendering, but reads and cached reselection stay usable',async()=>{
 const f=fixture(),{data}=f;data.suspendPreparation();await tick();assert.equal(f.calls.length,0);assert.equal(data.metrics.preparation,'suspended');assert.equal(data.metrics.pendingBackground,6);
 const answer=await data.sample({bounds:[2,3,4,5],scale:1});assert.deepEqual(answer.pixels.data,new Uint8Array(60).fill(73));assert.equal(f.calls.length,1);assert.equal(data.metrics.preparedBlocks,1);assert.equal(data.metrics.pendingForeground,0);assert.equal(data.metrics.pendingBackground,5);
 await data.readNative({x:2,y:3,width:4,height:5});assert.equal(f.calls.length,1);assert.equal(f.reads,1);
 data.resumePreparation();await until(()=>data.metrics.preparation==='ready');assert.equal(f.calls.length,6);assert.equal(f.writes.length,6);assert.equal(new Set(f.writes).size,6);
 data.suspendPreparation();data.resumePreparation();await tick();await data.sample({bounds:[2,3,4,5],scale:1});assert.equal(f.calls.length,6);assert.equal(data.metrics.preparedBlocks,6);assert.equal(f.errors.length,0);
 await data.close();await data.disposal();assert.equal(f.disposed,1);assert.equal(f.retained.size,0);assert.equal(f.releases,6);
});
test('suspending a running background block keeps its request resumable and never poisons the page',async()=>{
 const f=fixture({manual:true}),{data}=f;await until(()=>f.calls.length===1);data.suspendPreparation();await until(()=>data.metrics.suspendedBlocks===1);assert.equal(f.aborted,1);assert.equal(data.metrics.preparedBlocks,0);assert.equal(data.metrics.pendingBackground,6);assert.equal(f.errors.length,0);
 const read=data.readNative({x:0,y:0,width:4,height:4});await until(()=>f.calls.length===2);await f.finishOne();await f.finishOne();await read;assert.equal(data.metrics.preparedBlocks,1);assert.equal(data.metrics.pendingBackground,5);
 data.resumePreparation();for(let n=0;n<5;n++)await f.finishOne();await until(()=>data.metrics.preparation==='ready');assert.equal(f.calls.length,7);assert.equal(f.writes.length,6);assert.equal(new Set(f.writes).size,6);assert.equal(f.errors.length,0);assert.equal(f.releases,6);
 await data.close();await data.disposal();assert.equal(f.retained.size,0);
});
test('foreground upgrade survives a selection change and explicit completion remains available while inactive',async()=>{
 const f=fixture({manual:true}),{data}=f;await until(()=>f.calls.length===1);const read=data.readNative({x:0,y:0,width:4,height:4});await tick();assert.equal(data.metrics.activePriority,0);data.suspendPreparation();assert.equal(f.aborted,0);await f.finishOne();await read;await tick();assert.equal(f.calls.length,1);assert.equal(data.metrics.preparation,'suspended');
 const complete=data.finished();for(let n=0;n<5;n++)await f.finishOne();await complete;assert.equal(f.calls.length,6);assert.equal(data.metrics.preparation,'ready');assert.equal(data.metrics.preparationSuspended,true);assert.equal(f.aborted,0);assert.equal(f.errors.length,0);await data.close();await data.disposal();assert.equal(f.retained.size,0);
});
test('closing a suspended page rejects pending foreground and disposes without resuming background',async()=>{
 const f=fixture({manual:true}),{data}=f;data.suspendPreparation();const read=data.readNative({x:128,y:0,width:4,height:4});const rejection=assert.rejects(read,{code:'CANCELLED'});await until(()=>f.calls.length===1);await data.close();await rejection;await data.disposal();assert.equal(f.calls.length,1);assert.equal(f.aborted,1);assert.equal(f.errors.length,0);assert.equal(f.disposed,1);assert.equal(f.retained.size,0);assert.equal(data.metrics.pendingForeground,0);assert.equal(data.metrics.pendingBackground,0);
});
test('an unrelated cancellation is a real render failure rather than an inactive-page retry',async()=>{
 const failure=Object.assign(Error('The source failed.'),{code:'CANCELLED'}),f=fixture({failRender:failure});await until(()=>f.data.metrics.preparation==='failed');assert.equal(f.errors.length,1);assert.equal(f.errors[0],failure);assert.equal(f.data.metrics.suspendedBlocks,0);assert.equal(f.calls.length,1);await assert.rejects(f.data.finished(),e=>e===failure);await f.data.close();await f.data.disposal();assert.equal(f.retained.size,0);
});
test('pausing a page cancels its visual sampling leases so queued presentations cannot keep it active',async()=>{
 const f=fixture({manual:true}),{data}=f;await until(()=>f.calls.length===1);const controller=new AbortController(),sample=data.sample({bounds:[0,0,4,4],scale:1,signal:controller.signal}),rejected=assert.rejects(sample,{code:'CANCELLED'});await tick();assert.equal(data.metrics.activePriority,0);data.suspendPreparation();await rejected;await until(()=>data.metrics.suspendedBlocks===1);assert.equal(f.aborted,1);assert.equal(data.metrics.pendingForeground,0);assert.equal(data.metrics.pendingBackground,6);assert.equal(data.metrics.preparedBlocks,0);assert.equal(f.errors.length,0);
 data.resumePreparation();await f.finishOne();for(let n=0;n<6;n++)await f.finishOne();await until(()=>data.metrics.preparation==='ready');assert.equal(f.writes.length,6);assert.equal(f.calls.length,7);await data.close();await data.disposal();assert.equal(f.retained.size,0);
});
test('an explicit reader continues after a cancelled visual reader leaves the same inactive block',async()=>{
 const f=fixture({manual:true}),{data}=f;await until(()=>f.calls.length===1);const controller=new AbortController(),visual=data.sample({bounds:[0,0,4,4],scale:1,signal:controller.signal}),rejected=assert.rejects(visual,{code:'CANCELLED'}),read=data.readNative({x:0,y:0,width:4,height:4});await tick();data.suspendPreparation();controller.abort();await rejected;assert.equal(f.aborted,0);assert.equal(data.metrics.activePriority,0);await f.finishOne();await read;await tick();assert.equal(f.calls.length,1);assert.equal(data.metrics.preparedBlocks,1);assert.equal(data.metrics.pendingBackground,5);assert.equal(f.errors.length,0);await data.close();await data.disposal();assert.equal(f.retained.size,0);
});

test('new visual windows cannot requeue foreground work while hidden, but explicit sampling still can',async()=>{
 const f=fixture(),{data}=f;data.suspendPreparation();await tick();const signal=new AbortController().signal;await assert.rejects(data.sample({bounds:[0,0,4,4],scale:1,signal}),{code:'CANCELLED'});await assert.rejects(data.sample({bounds:[128,0,4,4],scale:1,signal}),{code:'CANCELLED'});assert.equal(f.calls.length,0);assert.equal(data.metrics.pendingForeground,0);assert.equal(data.metrics.pendingBackground,6);
 const answer=await data.sample({bounds:[0,0,4,4],scale:1});assert.equal(answer.pixels.data.length,48);assert.equal(f.calls.length,1);assert.equal(data.metrics.preparedBlocks,1);assert.equal(data.metrics.preparationSuspended,true);await data.close();await data.disposal();assert.equal(f.retained.size,0);
});
test('suspension removes every visual subscriber and an external abort alone remains independently supported',async()=>{
 const f=fixture({manual:true}),{data}=f;await until(()=>f.calls.length===1);const a=new AbortController(),b=new AbortController(),first=data.sample({bounds:[0,0,4,4],scale:1,signal:a.signal}),second=data.sample({bounds:[0,0,4,4],scale:1,signal:b.signal}),firstRejected=assert.rejects(first,{name:'AbortError'}),secondRejected=assert.rejects(second,{code:'CANCELLED'});await tick();a.abort();await firstRejected;assert.equal(f.aborted,0);assert.equal(data.metrics.activePriority,0);data.suspendPreparation();await secondRejected;await until(()=>data.metrics.activePriority===null);assert.equal(f.aborted,1);assert.equal(data.metrics.pendingForeground,0);assert.equal(data.metrics.pendingBackground,6);assert.equal(f.errors.length,0);await data.close();await data.disposal();assert.equal(f.retained.size,0);
});
