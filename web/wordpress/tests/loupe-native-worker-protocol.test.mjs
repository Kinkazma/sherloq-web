import test from 'node:test';
import assert from 'node:assert/strict';
import {installNativeTileWorker} from '../sherloq-browser/assets/pdf-native-tile-worker.js';
import {validError} from '../sherloq-browser/assets/loupe-native-protocol.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.fail('Native protocol acknowledgement did not arrive');}
const rect={x:0,y:0,width:1,height:1};
async function closed(h){await until(()=>h.counters.closed===1);return h.runtime.closedTask;}
function fixture({auto=true,sendFailure,disposeFailure,surfaceFailure,storeFailure,readFailure,loadGate,disposeGate}={}){
 const messages=[],sources=[],reported=[],counters={created:0,disposed:0,storesDisposed:0,sessionDisposed:0,reserved:0,reclaimers:0,sendAttempts:0,closed:0};let failOnce=false;
 const scope={reportError:error=>reported.push(error),close(){counters.closed++;},postMessage(message,transfer){
  counters.sendAttempts++;if(sendFailure==='always'||!failOnce&&sendFailure?.(message)){failOnce=true;throw Object.assign(Error('Injected postMessage failure'),{name:'DataCloneError'});}
  messages.push({message,transfer});if(message.action==='source'){sources.push(message);if(auto)queueMicrotask(()=>send({action:'source',read:message.read,pixels:rgb(message.rect)}));}
 }};
 const rgb=({width,height})=>({width,height,format:'rgb8',data:new Uint8Array(width*height*3)});
 class Budget{constructor(limit){this.limit=limit;}reserve(bytes){counters.reserved+=bytes;let released=false;return()=>{if(released)return;released=true;counters.reserved-=bytes;};}registerReclaimer(){counters.reclaimers++;let removed=false;return()=>{if(removed)return;removed=true;counters.reclaimers--;};}snapshot(){return{activeReservationBytes:counters.reserved,retainedBytes:0};}}
 const runtime=installNativeTileWorker(scope,{loadModule:async url=>{
  if(loadGate)await loadGate;
  if(url.endsWith('/pdf-native-regional-image.js'))return{createRegionalLoupeImage(source){counters.created++;return{metrics:{},readWindow:(r,options)=>{if(readFailure)throw readFailure;return source.readWindow(r,options);},async dispose(){counters.disposed++;if(disposeGate)await disposeGate;if(surfaceFailure)throw surfaceFailure;}};}};
  if(url.endsWith('/temporary-storage.js'))return{createTemporarySession:async()=>({backend:'mock',dispose(){counters.sessionDisposed++;if(disposeFailure)throw disposeFailure;}})};
  if(url.endsWith('/segmented-bytes.js'))return{createSegmentedBytes:async(_bytes,{getTemporarySession})=>{await getTemporarySession();return{storage:'temporary',write(){},readInto(target){return target;},dispose(){counters.storesDisposed++;if(storeFailure)throw storeFailure;}};}};
  if(url.endsWith('/cache.js'))return{Budget};throw Error('Unexpected test module '+url);
 }});
 function send(message){scope.onmessage({data:message});}
 const reply=ticket=>messages.map(v=>v.message).find(m=>m.ticket===ticket);
 async function build(ticket=1){send({action:'build',ticket,width:1,height:1,effects:{},memoryBudgetBytes:1024*1024});await until(()=>reply(ticket)||runtime.disposed);return reply(ticket);}
 async function read(ticket=2,id=1){send({action:'read',ticket,resultId:id,rect,explicit:true});await until(()=>reply(ticket)||runtime.disposed);return reply(ticket);}
 async function close(){send({action:'dispose'});await until(()=>counters.closed===1);return runtime.closedTask;}
 return{scope,runtime,messages,sources,reported,counters,send,reply,build,read,close,rgb};
}

test('native protocol validates request shapes and identities before processing',async()=>{
 for(const message of [null,[],{}, {action:'build',ticket:0,width:1,height:1,effects:{}},{action:'build',ticket:1,width:0,height:1,effects:{}},{action:'build',ticket:1,width:1,height:1,effects:{},allowedTiles:['-1:0']},{action:'source',read:1,pixels:{}},{action:'unknown',ticket:1}]){
  const h=fixture();assert.doesNotThrow(()=>h.send(message));await closed(h);const fatal=h.messages.find(v=>v.message.fatal)?.message;assert.equal(fatal.error.code,'WORKER_MESSAGE_FAILED');assert.equal(h.counters.created,0);assert.equal(h.runtime.pending,0);assert.equal(h.counters.closed,1);
 }
});

test('native protocol rejects malformed priorities and out-of-bounds reads without uncaught errors',async()=>{
 for(const request of [{action:'priority',resultId:1},{action:'priority',resultId:1,regions:[{...rect,x:1}]},{action:'read',ticket:2,resultId:1,rect:{...rect,x:-1}},{action:'read',ticket:2,resultId:1,rect:{...rect,width:2}},{action:'read',ticket:2,resultId:1,rect,explicit:'yes'},{action:'read',ticket:2,resultId:77,rect}]){
  const h=fixture();await h.build();assert.doesNotThrow(()=>h.send(request));await closed(h);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);assert.equal(h.sources.length,0);assert.equal(h.counters.disposed,1);
 }
});

test('native protocol rejects duplicate build identities instead of replacing a retained record',async()=>{
 const h=fixture();await h.build();h.send({action:'build',ticket:1,width:1,height:1,effects:{}});await closed(h);assert.equal(h.counters.created,1);assert.equal(h.counters.disposed,1);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);
});

test('a cancelled queued build settles immediately while another source read remains pending',async()=>{
 const h=fixture({auto:false});await h.build();h.send({action:'read',ticket:2,resultId:1,rect});await until(()=>h.sources.length===1);h.send({action:'build',ticket:3,width:1,height:1,effects:{}});h.send({action:'cancel',ticket:3});assert.equal(h.reply(3).error.code,'CANCELLED');assert.equal(h.reply(2),undefined);assert.equal(h.counters.created,1);
 const source=h.sources[0];h.send({action:'source',read:source.read,pixels:h.rgb(rect)});await until(()=>h.reply(2));await h.close();assert.equal(h.messages.filter(v=>v.message.ticket===3).length,1);assert.equal(h.counters.reserved,0);
});

test('late source responses after cancellation are ignored and release the admission once',async()=>{
 const h=fixture({auto:false});await h.build();h.send({action:'read',ticket:2,resultId:1,rect});await until(()=>h.sources.length===1);const source=h.sources[0];h.send({action:'suspend',resultId:1});await until(()=>h.reply(2));assert.equal(h.reply(2).error.code,'CANCELLED');assert.equal(h.counters.reserved,0);h.send({action:'source',read:source.read,pixels:h.rgb(rect)});assert.equal(h.counters.reserved,0);await h.close();assert.equal(h.messages.filter(v=>v.message.fatal).length,0);
});

test('native RGB source validation rejects wrong format, dimensions, array type and length',async()=>{
 for(const change of [v=>({...v,format:'rgba8'}),v=>({...v,width:2}),v=>({...v,data:new Uint8ClampedArray(3)}),v=>({...v,data:new Uint8Array(2)})]){
  const h=fixture({auto:false});await h.build();h.send({action:'read',ticket:2,resultId:1,rect});await until(()=>h.sources.length===1);h.send({action:'source',read:h.sources[0].read,pixels:change(h.rgb(rect))});await until(()=>h.reply(2));assert.equal(h.reply(2).error.code,'INVALID_INPUT');assert.equal(h.counters.reserved,0);await h.close();
 }
});

test('cyclic source errors are rejected safely and internal cyclic errors are encoded finitely',async()=>{
 const cycle={message:'cycle',code:'TEST'};cycle.cause=cycle;const h=fixture({auto:false});await h.build();h.send({action:'read',ticket:2,resultId:1,rect});await until(()=>h.sources.length===1);assert.doesNotThrow(()=>h.send({action:'source',read:h.sources[0].read,error:structuredClone(cycle)}));await closed(h);assert.equal(h.counters.reserved,0);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);
 const j=fixture({readFailure:cycle});await j.build();const result=await j.read();assert.equal(validError(result.error),true);assert.match(JSON.stringify(result.error),/Circular error cause/);await j.close();
});

test('dispose is one observed task and cleans all resources independently when cleanup fails',async()=>{
 const error=Object.assign(Error('session cleanup'),{code:'STORAGE_CLOSE_FAILED'}),h=fixture({disposeFailure:error,surfaceFailure:Error('surface cleanup'),storeFailure:Error('store cleanup')});await h.build();await h.read();h.send({action:'dispose'});const first=h.runtime.closedTask;h.send({action:'dispose'});assert.equal(h.runtime.closedTask,first);await until(()=>h.counters.closed===1);const result=await first;assert.equal(result.error.code,'CLEANUP_FAILED');assert.match(JSON.stringify(result.error),/STORAGE_CLOSE_FAILED/);assert.equal(h.counters.disposed,1);assert.equal(h.counters.storesDisposed,1);assert.equal(h.counters.sessionDisposed,1);assert.equal(h.counters.reclaimers,0);assert.equal(h.counters.reserved,0);assert.equal(h.counters.closed,1);assert.equal(h.messages.filter(v=>v.message.action==='disposed').length,1);
});

test('work arriving after disposal is rejected and cannot remain queued',async()=>{
 const h=fixture();await h.close();h.send({action:'build',ticket:73,width:1,height:1,effects:{}});assert.equal(h.reply(73).error.code,'CANCELLED');assert.equal(h.runtime.pending,0);assert.equal(h.counters.created,0);await h.close();assert.equal(h.counters.closed,1);
});

test('release racing with global disposal joins the same native cleanup before acknowledging close',async()=>{
 let finish;const gate=new Promise(resolve=>{finish=resolve;}),h=fixture({disposeGate:gate});await h.build();await h.read();h.send({action:'release',ticket:3,resultId:1});await until(()=>h.counters.disposed===1);h.send({action:'dispose'});const close=h.runtime.closedTask;let completed=false;close.then(()=>completed=true);await tick();assert.equal(completed,false);assert.equal(h.counters.sessionDisposed,0);finish();await closed(h);assert.equal(h.reply(3).released,true);assert.equal(h.counters.disposed,1);assert.equal(h.counters.sessionDisposed,1);assert.equal(h.counters.storesDisposed,1);
});

test('dispose settles a pending source request and ignores its later cloned response',async()=>{
 const h=fixture({auto:false});await h.build();h.send({action:'read',ticket:2,resultId:1,rect});await until(()=>h.sources.length===1);const request=h.sources[0];await h.close();assert.equal(h.reply(2).error.code,'CANCELLED');assert.equal(h.counters.reserved,0);const count=h.messages.length;h.send({action:'source',read:request.read,pixels:h.rgb(rect)});assert.equal(h.messages.length,count);assert.equal(h.counters.reserved,0);assert.equal(h.counters.closed,1);
});

test('build acknowledgement send failure rolls back the unpublished native record',async()=>{
 const h=fixture({sendFailure:m=>m.resultId===1&&m.ticket===1});await h.build();await closed(h);assert.equal(h.counters.created,1);assert.equal(h.counters.disposed,1);assert.equal(h.counters.reclaimers,0);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);assert.equal(h.counters.closed,1);
});

test('a permanently broken outgoing channel reports once, does not resend recursively and still closes',async()=>{
 const h=fixture({sendFailure:'always'});await h.build();await closed(h);assert.equal(h.counters.sendAttempts,2);assert.equal(h.reported.length,1);assert.equal(h.reported[0].code,'WORKER_MESSAGE_FAILED');assert.equal(h.counters.disposed,1);assert.equal(h.counters.closed,1);assert.equal(h.counters.reserved,0);
});

test('source transfer send failure cancels the read and closes every native resource',async()=>{
 const h=fixture({sendFailure:m=>m.action==='source'});await h.build();await h.read();await closed(h);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);assert.equal(h.counters.reserved,0);assert.equal(h.counters.reclaimers,0);assert.equal(h.counters.disposed,1);assert.equal(h.counters.sessionDisposed,1);
});

test('messageerror reaches one fatal response and observed closure without lazy module loading',async()=>{
 const h=fixture();h.scope.onmessageerror({error:Error('decode failure')});await closed(h);assert.equal(h.messages.filter(v=>v.message.fatal).length,1);assert.equal(h.messages.find(v=>v.message.fatal).message.error.code,'WORKER_MESSAGE_FAILED');assert.equal(h.counters.created,0);assert.equal(h.counters.closed,1);
});
