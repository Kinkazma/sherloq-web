import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeColorClient} from '../sherloq-browser/assets/native-color-client.js';

const MiB=1024**2,tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function environment({tiff=false,depth=tiff?16:8,width=100,height=90,loadError=false,holdLoad=false,holdRead=false,holdDispose=false,releaseRefusals=0,cleanupRefusals=0,temporary=false}={}){
 const blob=new Blob([tiff?Uint8Array.of(73,73,42,0):Uint8Array.of(255,216,255,217)]),sourceSha256='a'.repeat(64),events=[],workers=[],requests=[],cleanups=[];let current=true,releases=0,activeReads=0,maxReads=0;
 const capability={width,height,sourceSha256,space:'CMYK',channels:['C','M','Y','K'],depth,range:[0,2**depth-1],iccApplied:false};
 const parent={file:blob,hash:sourceSha256,source:{width,height},imageId:'original-probe',isCurrent:()=>current,getClient:async()=>({reserveNativeWorkspace:async request=>{requests.push(request);events.push('reserve');const choice=request.choices[0];return{...choice,bytes:choice.totalBytes,id:'native-credit',async release(){releases++;events.push('credit-release');if(releases<=releaseRefusals)return false;return true;}};}})};
 class FakeWorker{
  constructor(){this.messages=[];this.terminated=false;this.reads=[];this.disposals=[];workers.push(this);}
  emit(value){this.onmessage({data:value});}
  load(message){if(temporary)this.emit({temporarySession:{id:message.payload.temporarySessionId,backend:'indexeddb'}});this.emit(loadError?{id:message.id,error:{name:'EngineError',code:'INVALID_INPUT',message:'native decode probe failed'}}:{id:message.id,result:{capability,metrics:{storage:'probe'}}});}
  read(message){const {rect}=message.payload,data=depth===16?new Uint16Array(rect.width*rect.height*4):new Uint8Array(rect.width*rect.height*4);data.fill(7);activeReads--;this.emit({id:message.id,result:{pixels:{width:rect.width,height:rect.height,space:'CMYK',channels:4,depth,format:'cmyk'+depth,data}}});}
  postMessage(message){this.messages.push(message);events.push('post-'+message.action);if(message.action==='load'){this.loading=message;if(!holdLoad)queueMicrotask(()=>this.load(message));}else if(message.action==='read'){activeReads++;maxReads=Math.max(maxReads,activeReads);this.reads.push(message);if(!holdRead)queueMicrotask(()=>this.read(message));}else if(message.action==='dispose'){this.disposals.push(message);if(!holdDispose)queueMicrotask(()=>this.emit({id:message.id,result:{disposed:true}}));}}
  terminate(){this.terminated=true;events.push('terminate');}
 }
 return{blob,sourceSha256,width,height,parent,capability,events,workers,requests,cleanups,get releases(){return releases;},get maxReads(){return maxReads;},setCurrent:value=>current=value,options(extra={}){return{blob,sourceSha256,width,height,parentBudgetSource:parent,workerFactory:()=>new FakeWorker(),removeTemporarySession:async(id,backend)=>{cleanups.push({id,backend});events.push('storage-remove');if(cleanups.length<=cleanupRefusals)throw Error('Storage still held');},...extra};}};
}
test('Native readers get real Original grants including 48 MiB of consumer owners, then return them after close ACK',async()=>{
 const h=environment(),client=await createNativeColorClient(h.options());assert.equal(h.requests.length,1);assert.equal(h.requests[0].imageId,'original-probe');assert.equal(h.requests[0].sourceSha256,h.sourceSha256);assert.equal(h.requests[0].choices[0].engineBytes,128*MiB);assert.equal(h.requests[0].choices[0].totalBytes,176*MiB);assert.equal(h.workers[0].loading.payload.memoryBudgetBytes,128*MiB);const pixels=await client.readPixels({x:0,y:0,width:4,height:4});assert.equal(pixels.format,'cmyk8');assert.ok(pixels.data instanceof Uint8Array);await client.dispose();assert.equal(h.releases,1);assert.ok(h.events.indexOf('terminate')<h.events.indexOf('credit-release'));
 const j=environment({tiff:true}),second=await createNativeColorClient(j.options());assert.equal(j.requests[0].choices[0].engineBytes,32*MiB);assert.equal(j.requests[0].choices[0].totalBytes,80*MiB);assert.ok((await second.readPixels({x:0,y:0,width:4,height:4})).data instanceof Uint16Array);await second.dispose();assert.equal(j.releases,1);
});
test('Large JPEG grants prefer RAM and retain financed smaller choices for temporary storage',async()=>{
 const h=environment({width:10000,height:10000}),client=await createNativeColorClient(h.options());assert.deepEqual(h.requests[0].choices.map(c=>c.engineBytes),[400000000+96*MiB,256*MiB,192*MiB,128*MiB]);assert.ok(h.requests[0].choices.every(c=>c.totalBytes===c.engineBytes+48*MiB));await client.dispose();
});
test('Parallel local/global callers serialize native reads instead of retaining two windows in flight',async()=>{
 const h=environment({holdRead:true}),client=await createNativeColorClient(h.options()),first=client.readPixels({x:0,y:0,width:4,height:4}),second=client.readPixels({x:8,y:8,width:4,height:4});await tick();assert.equal(h.workers[0].reads.length,1);h.workers[0].read(h.workers[0].reads[0]);await first;await tick();assert.equal(h.workers[0].reads.length,2);h.workers[0].read(h.workers[0].reads[1]);await second;assert.equal(h.maxReads,1);await client.dispose();
});
test('Wrong Original identity or unsupported bytes do not open a worker or borrow memory',async()=>{
 const h=environment();await assert.rejects(createNativeColorClient(h.options({sourceSha256:'b'.repeat(64)})),{code:'CANCELLED'});assert.equal(h.requests.length,0);assert.equal(h.workers.length,0);
 const j=environment(),other=new Blob([Uint8Array.of(0,1,2,3)]);j.parent.file=other;await assert.rejects(createNativeColorClient(j.options({blob:other})),{code:'NATIVE_COLOR_UNSUPPORTED'});assert.equal(j.requests.length,0);assert.equal(j.workers.length,0);
});
test('A failed load retires the native worker before returning its Original debt',async()=>{
 const h=environment({loadError:true});await assert.rejects(createNativeColorClient(h.options()),{code:'INVALID_INPUT'});assert.equal(h.workers[0].terminated,true);assert.equal(h.releases,1);assert.ok(h.events.indexOf('post-dispose')<h.events.indexOf('credit-release'));
});
test('Disposal waits for the explicit worker ACK and retries a refused credit return',async()=>{
 const h=environment({holdDispose:true,releaseRefusals:1}),client=await createNativeColorClient(h.options()),closing=client.dispose();await tick();assert.equal(h.releases,0);assert.equal(h.workers[0].terminated,false);const message=h.workers[0].disposals[0];h.workers[0].emit({id:message.id,result:{disposed:true}});await assert.rejects(closing,{code:'BUSY'});assert.equal(h.workers[0].terminated,true);assert.equal(h.releases,1);await client.dispose();assert.equal(h.releases,2);assert.equal(h.workers[0].disposals.length,1);
});
test('A fatal worker error retains the credit until owned temporary storage can be removed',async()=>{
 const h=environment({temporary:true,holdRead:true,cleanupRefusals:1}),client=await createNativeColorClient(h.options()),read=client.readPixels({x:0,y:0,width:4,height:4});await tick();h.workers[0].onerror({message:'native crash'});await assert.rejects(read,{code:'WORKER_FAILED'});await tick();assert.equal(h.workers[0].terminated,true);assert.equal(h.releases,0);assert.equal(h.cleanups.length,1);await client.dispose();assert.equal(h.cleanups.length,2);assert.equal(h.releases,1);assert.ok(h.events.lastIndexOf('storage-remove')<h.events.indexOf('credit-release'));
});
test('Aborting during loading sends cancellation and retires the funded child without a deadline',async()=>{
 const h=environment({holdLoad:true}),controller=new AbortController(),opening=createNativeColorClient(h.options({signal:controller.signal}));await tick();assert.ok(h.workers[0]);controller.abort();const loading=h.workers[0].loading;h.workers[0].emit({id:loading.id,error:{name:'EngineError',code:'CANCELLED',message:'cancelled'}});await assert.rejects(opening,{code:'CANCELLED'});assert.equal(h.workers[0].terminated,true);assert.equal(h.releases,1);
});
test('A changed Original cannot supply another native read and remains safely disposable',async()=>{
 const h=environment(),client=await createNativeColorClient(h.options());h.setCurrent(false);await assert.rejects(client.readPixels({x:0,y:0,width:4,height:4}),{code:'CANCELLED'});assert.equal(h.workers[0].reads.length,0);await client.dispose();assert.equal(h.releases,1);
});
