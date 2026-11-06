import test from 'node:test';
import assert from 'node:assert/strict';
import {readWholeChannelHistogram} from '../sherloq-browser/assets/whole-channel-histogram.js';
import {createChannelHistogramAggregate} from '../sherloq-browser/assets/local-channel-histogram-core.js';
import {histogram,histogramParams,histogramSummary} from '../sherloq-browser/assets/unified-engine/src/histogram.js';

const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(width,height){const data=new Uint8Array(width*height*3);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*3;data[at]=(x*37+y*19)%256;data[at+1]=(x*7+y*53)%256;data[at+2]=(x*79+y*11)%256;}return{width,height,format:'rgb8',data};}
function tile(image,rect){const data=new Uint8Array(rect.width*rect.height*3);for(let row=0;row<rect.height;row++)data.set(image.data.subarray(((rect.y+row)*image.width+rect.x)*3,((rect.y+row)*image.width+rect.x+rect.width)*3),row*rect.width*3);return{width:rect.width,height:rect.height,format:'rgb8',data};}
function sourceOf(image){let inFlight=0,maximum=0;const calls=[];return{width:image.width,height:image.height,calls,get maximumReads(){return maximum;},async readPixels(rect){inFlight++;maximum=Math.max(maximum,inFlight);try{assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=image.width&&rect.y+rect.height<=image.height);assert.ok(rect.width<=1024&&rect.height<=1024);calls.push({...rect});return tile(image,rect);}finally{inFlight--;}}};}

// The transport is simulated; the aggregate reducer and buffer transfers are
// the same real modules used by the browser worker, without a DOM dependency.
class AggregateWorker{
 constructor({manual=false,alterReply=null,throwPost=false}={}){this.manual=manual;this.alterReply=alterReply;this.throwPost=throwPost;this.messages=[];this.posts=[];this.terminated=false;this.terminateCalls=0;this.owner=null;this.workspace={};}
 postMessage(value,transfer=[]){if(this.throwPost)throw Error('simulated message failure');assert.equal(this.terminated,false);const request=structuredClone(value,{transfer});this.posts.push(request);this.messages.push(request);if(!this.manual)queueMicrotask(()=>this.complete());}
 complete(){if(this.terminated)return;const request=this.messages.shift();assert.ok(request);const spec=request.aggregate;if(spec.reset)this.owner={id:spec.id,value:createChannelHistogramAggregate(this.workspace)};assert.equal(this.owner.id,spec.id);const owner=this.owner,data=owner.value.append(request.pixels,request.params),reply={id:request.id,data,aggregate:{id:owner.id,pixels:owner.value.pixels,count:owner.value.count,complete:spec.final}};if(spec.final)this.owner=null;this.alterReply?.(reply);const received=structuredClone(reply,{transfer:[data.bins.buffer,data.cumulative.buffer]});this.onmessage({data:received});}
 terminate(){this.terminateCalls++;this.terminated=true;this.messages=[];this.owner=null;}
 fail(message='simulated worker failure'){this.onerror({message});}
}
function workers(options={}){const created=[];return{created,factory:url=>{assert.match(url.pathname,/local-channel-histogram-worker\.js$/);const worker=new AggregateWorker(options);created.push(worker);return worker;}};}
function compare(actual,expected,total){for(const key of ['channels','uniqueColors','uniqueRatio','summary'])assert.deepEqual(actual[key],expected[key],key);assert.deepEqual(actual.bins,expected.bins);assert.deepEqual(actual.cumulative,expected.cumulative);for(let channel=0;channel<4;channel++){assert.deepEqual(histogramSummary(actual.bins,channel,0,255,total),histogramSummary(expected.bins,channel,0,255,total));let weighted=0;for(let value=0;value<256;value++)weighted+=value*expected.bins[channel*256+value];assert.equal(actual.channelMeans[channel],weighted/total);}}

test('A 2255 by 1511 native image is covered by six bounded tiles with exact maintained histogram results',async()=>{
 const image=fixture(2255,1511),source=sourceOf(image),pool=workers(),progress=[];
 const actual=await readWholeChannelHistogram(source,{workerFactory:pool.factory,onProgress:value=>progress.push(value)}),reference=await histogram(image,histogramParams({}));compare(actual,reference.data,image.width*image.height);
 assert.equal(source.calls.length,6);assert.deepEqual(source.calls,[{x:0,y:0,width:1024,height:1024},{x:1024,y:0,width:1024,height:1024},{x:2048,y:0,width:207,height:1024},{x:0,y:1024,width:1024,height:487},{x:1024,y:1024,width:1024,height:487},{x:2048,y:1024,width:207,height:487}]);assert.equal(source.maximumReads,1);assert.equal(pool.created.length,1);assert.equal(pool.created[0].terminated,true);assert.equal(pool.created[0].posts[0].aggregate.reset,true);assert.equal(pool.created[0].posts.at(-1).aggregate.final,true);assert.deepEqual(progress,Array.from({length:6},(_,index)=>({completed:index+1,total:6})));
});
test('Narrow images use their real native tile shape and never pad borders or duplicate observations',async()=>{
 const image=fixture(2050,3),source=sourceOf(image),pool=workers();const actual=await readWholeChannelHistogram(source,{workerFactory:pool.factory});compare(actual,(await histogram(image,histogramParams({}))).data,image.width*image.height);assert.deepEqual(source.calls,[{x:0,y:0,width:1024,height:3},{x:1024,y:0,width:1024,height:3},{x:2048,y:0,width:2,height:3}]);assert.equal(actual.summary.count,6150);
});
test('Aborting while a native read is unresolved rejects and retires the worker immediately, without waiting for that read',async()=>{
 const controller=new AbortController(),pool=workers();let resolveRead,readStarted=false,settled=false;
 const source={width:100,height:100,readPixels(){readStarted=true;return new Promise(resolve=>resolveRead=resolve);}};
 const execution=readWholeChannelHistogram(source,{signal:controller.signal,workerFactory:pool.factory});const checked=assert.rejects(execution,{code:'CANCELLED'}).then(()=>settled=true);assert.equal(readStarted,true);controller.abort();await tick();assert.equal(settled,true);assert.equal(pool.created[0].terminated,true);assert.equal(pool.created[0].posts.length,0);await checked;
 resolveRead(fixture(100,100));await tick();assert.equal(pool.created[0].posts.length,0,'A late native reply cannot restart the retired worker');
});
test('Aborting a pending worker calculation rejects immediately and ignores a late reply',async()=>{
 const controller=new AbortController(),pool=workers({manual:true}),source=sourceOf(fixture(20,15));let settled=false;
 const execution=readWholeChannelHistogram(source,{signal:controller.signal,workerFactory:pool.factory}),checked=assert.rejects(execution,{code:'CANCELLED'}).then(()=>settled=true);await tick();const worker=pool.created[0],request=worker.posts[0];assert.ok(request);controller.abort();await tick();assert.equal(settled,true);assert.equal(worker.terminated,true);worker.onmessage({data:{id:request.id,data:{},aggregate:{}}});await checked;assert.equal(source.calls.length,1);
});
test('Pre-aborted and malformed sources cannot create workers or read source pixels',async()=>{
 const controller=new AbortController();controller.abort();let made=0;const workerFactory=()=>{made++;return new AggregateWorker();};
 await assert.rejects(readWholeChannelHistogram(sourceOf(fixture(3,3)),{signal:controller.signal,workerFactory}),{code:'CANCELLED'});
 for(const source of [null,{width:0,height:10,readPixels(){}},{width:10,height:1.5,readPixels(){}},{width:1,height:1}])await assert.rejects(readWholeChannelHistogram(source,{workerFactory}),{code:'INVALID_INPUT'});assert.equal(made,0);
});
test('An aggregate reply with the wrong identity, observation count or completion flag is rejected and cleaned up',async()=>{
 for(const alterReply of [reply=>reply.aggregate.id='wrong-source',reply=>reply.aggregate.pixels++,reply=>reply.aggregate.count++,reply=>reply.aggregate.complete=false]){const pool=workers({alterReply});await assert.rejects(readWholeChannelHistogram(sourceOf(fixture(3,3)),{workerFactory:pool.factory}),{code:'INVALID_INPUT'});assert.equal(pool.created[0].terminated,true);}
});
test('Worker errors and message-send failures retire the reader without accepting partial results',async()=>{
 const source=sourceOf(fixture(3,3)),pending=workers({manual:true});const execution=readWholeChannelHistogram(source,{workerFactory:pending.factory}),checked=assert.rejects(execution,/simulated worker failure/);await tick();pending.created[0].fail();await checked;assert.equal(pending.created[0].terminated,true);
 const broken=workers({throwPost:true});await assert.rejects(readWholeChannelHistogram(source,{workerFactory:broken.factory}),/simulated message failure/);assert.equal(broken.created[0].terminated,true);
});
test('A worker failure during a later native read interrupts that unresolved read immediately',async()=>{
 const pool=workers();let reads=0,resolveLater,secondStarted,settled=false;const started=new Promise(resolve=>secondStarted=resolve),source={width:1030,height:2,readPixels(rect){if(++reads===1)return Promise.resolve(fixture(rect.width,rect.height));secondStarted();return new Promise(resolve=>resolveLater=resolve);}};
 const execution=readWholeChannelHistogram(source,{workerFactory:pool.factory}),checked=assert.rejects(execution,/worker retired between chunks/).then(()=>settled=true);await started;pool.created[0].fail('worker retired between chunks');await tick();assert.equal(settled,true);assert.equal(pool.created[0].terminated,true);assert.equal(reads,2);await checked;
 resolveLater(fixture(6,2));await tick();assert.equal(pool.created[0].posts.length,1,'A late native reply cannot continue after a terminal worker error');
});
