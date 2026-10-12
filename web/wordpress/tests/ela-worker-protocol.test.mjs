import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../sherloq-browser/assets/unified-engine/src/worker-message-protocol.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve)),appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url),workerURL=new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url);
const appSource=await readFile(appURL,'utf8'),clientCode=appSource.slice(appSource.indexOf('function getWorker(){'),appSource.indexOf('let displayFramePending=',appSource.indexOf('function getWorker(){'))).replaceAll('import.meta.url',JSON.stringify(appURL.href));
function client(){
 const workers=[],events=[],sessions=new Map();let cleaned=0;
 class Worker{constructor(url){this.url=String(url);this.messages=[];workers.push(this);}terminate(){this.dead=true;}postMessage(data){this.messages.push(data);}emit(data){this.onmessage?.({data});}}
 const context=vm.createContext({worker:null,loaded:false,pending:new Map(),seq:0,energyMode:false,uiRGBBudget:1024,tileCache:{limit:1024},devicePixelRatio:1,navigator:{hardwareConcurrency:8},performance:{},activeAnalysis:'ela.classic',temporarySessions:sessions,cleanupTemporarySessions(){cleaned++;sessions.clear();},diagnostic:event=>events.push(event),status(){},t:key=>key,$:id=>({value:id==='compute-profile'?'aggressive':0}),individualMode:()=>false,automaticMode:()=>false,Worker,URL,Uint8Array,EngineError,serializeEngineError,deserializeEngineError,installWorkerMessageProtocol,workerMessageFailure});
 new vm.Script(clientCode).runInContext(context);
 return {workers,events,context,sessions,get cleaned(){return cleaned;},request(action='capabilities',onChunk){context.callback=onChunk;context.action=action;return vm.runInContext('request(action,{},callback)',context);}};
}
for(const fault of ['null','messageerror','invalid-id','missing-result'])test('classic ELA '+fault+' rejects all calls and permits a fresh explicit worker',{timeout:2000},async()=>{
 const h=client(),requests=[h.request(),h.request()],rejected=requests.map(p=>assert.rejects(p,{code:'WORKER_MESSAGE_FAILED'})),worker=h.workers[0];h.sessions.set('owned',{id:'owned',backend:'opfs'});h.context.loaded=true;
 if(fault==='messageerror')worker.onmessageerror({});else worker.emit(fault==='null'?null:fault==='invalid-id'?{id:0,result:true}:{id:worker.messages[0].id});await Promise.all(rejected);assert.equal(worker.dead,true);assert.equal(h.context.pending.size,0);assert.equal(h.context.loaded,false);assert.equal(h.sessions.size,0);assert.equal(h.cleaned,1);assert.equal(worker.onmessage,null);assert.equal(worker.onmessageerror,null);
 const next=h.request();assert.equal(h.workers.length,2);h.workers[1].emit({id:h.workers[1].messages[0].id,result:{ready:true}});assert.deepEqual(await next,{ready:true});
});
test('classic ELA startup ErrorEvent retains source details and its original cause',{timeout:2000},async()=>{
 const h=client(),pending=h.request(),cause=Error('Dependency refused'),rejected=assert.rejects(pending,error=>error.code==='WORKER_FAILED'&&error.cause===cause&&error.details.phase==='worker-startup'&&error.details.workerEvent.filename==='https://example.invalid/part.js'&&error.details.workerEvent.line===21);
 h.workers[0].onerror({type:'error',message:'Module was unavailable',filename:'https://example.invalid/part.js',lineno:21,colno:7,error:cause});await rejected;assert.equal(h.events[0].error.cause.message,cause.message);
});
test('classic ELA module refusal preserves the complete cause and retires only the failed realm without automatic replay',{timeout:2000},async()=>{
 const h=client(),calls=[h.request(),h.request()],failure={code:'WORKER_LOAD_FAILED',message:'Module download refused',details:{phase:'module-load',moduleURL:'https://example.invalid/index.js'},cause:{code:'NETWORK_TRANSIENT',name:'TypeError',message:'original fetch failure',details:{status:503}}},rejected=calls.map(p=>assert.rejects(p,e=>e.code===failure.code&&e.details.moduleURL===failure.details.moduleURL&&e.cause.details.status===503));
 h.workers[0].emit({id:h.workers[0].messages[0].id,error:failure});await Promise.all(rejected);assert.equal(h.workers.length,1);assert.equal(h.workers[0].messages.every(x=>x.action==='capabilities'),true);assert.equal(h.events[0].error.cause.details.status,503);const next=h.request();h.workers[1].emit({id:h.workers[1].messages[0].id,result:true});assert.equal(await next,true);
});
test('ordinary classic ELA errors preserve their cause and keep the loaded source usable',{timeout:2000},async()=>{
 const h=client(),pending=h.request('run'),cause={code:'MEMORY_ALLOCATION',message:'allocation failed',details:{allocationKind:'array-buffer'}},rejected=assert.rejects(pending,e=>e.code==='COMPUTE_FAILED'&&e.cause.code===cause.code);h.context.loaded=true;
 h.workers[0].emit({id:h.workers[0].messages[0].id,error:{code:'COMPUTE_FAILED',message:'useful task failed',cause}});await rejected;assert.equal(h.workers[0].dead,undefined);assert.equal(h.context.loaded,true);assert.equal(h.context.pending.size,0);
});
test('classic export chunk acknowledgement waits for its consumer and preserves a write failure cause',{timeout:2000},async()=>{
 const h=client();let rejectWrite;const writing=new Promise((_,reject)=>rejectWrite=reject),pending=h.request('export-raster',()=>writing),worker=h.workers[0],id=worker.messages[0].id;
 const cause=new EngineError('WRITE_FAILED','Disk write failed',{cause:Error('original write error')}),rejected=assert.rejects(pending,e=>e.code==='WRITE_FAILED'&&e.cause.message==='original write error');worker.emit({id,chunk:Uint8Array.of(1,2),sequence:1});await turn();assert.equal(worker.messages.length,1);rejectWrite(cause);await turn();const ack=worker.messages.at(-1);assert.equal(ack.action,'export-ack');assert.equal(ack.error.code,'WRITE_FAILED');assert.equal(ack.error.cause.message,'original write error');worker.emit({id,error:ack.error});await rejected;assert.equal(worker.dead,undefined);
});
test('classic export transport failure drains its request and suppresses a late chunk acknowledgement',{timeout:2000},async()=>{
 const h=client();let finish;const pending=h.request('export-raster',()=>new Promise(resolve=>finish=resolve)),worker=h.workers[0],id=worker.messages[0].id,rejected=assert.rejects(pending,{code:'WORKER_MESSAGE_FAILED'});
 worker.emit({id,chunk:Uint8Array.of(1),sequence:1});worker.onmessageerror({});await rejected;finish();await turn();assert.equal(worker.messages.length,1);assert.equal(h.context.pending.size,0);assert.equal(worker.dead,true);
});
for(const fault of ['duplicate-chunk','early-success'])test('classic export '+fault+' cannot publish a partially consumed file',{timeout:2000},async()=>{
 const h=client();let finish;const pending=h.request('export-raster',()=>new Promise(resolve=>finish=resolve)),worker=h.workers[0],id=worker.messages[0].id,rejected=assert.rejects(pending,{code:'WORKER_MESSAGE_FAILED'});
 worker.emit({id,chunk:Uint8Array.of(1),sequence:1});worker.emit(fault==='duplicate-chunk'?{id,chunk:Uint8Array.of(1),sequence:1}:{id,result:{streamed:true}});await rejected;finish();await turn();assert.equal(worker.messages.length,1);assert.equal(worker.dead,true);
});

const workerSource=(await readFile(workerURL,'utf8')).replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(workerURL.href)).replace("await import('./unified-engine/src/index.js')",'await loadEngine()');
function endpoint({loadFailure,createFailure,delayedLoad,releaseFailure}={}){
 const messages=[],audit={created:0,loads:0,runs:0,exportsReleased:0};let count=0;
 const engine={capabilities:()=>({ready:true}),async loadBlob(){audit.loads++;return {width:2,height:1,surface:{id:'source',revision:1,width:2,height:1}};},async run(){audit.runs++;return {pixels:{width:2,height:1,data:new Uint8Array(6)}};},async exportSurface(){return {id:'export',revision:1,byteLength:2};},async readExport(){return {bytes:Uint8Array.of(1,2)};},async releaseExport(){audit.exportsReleased++;if(releaseFailure)throw releaseFailure;}};
 const createEngine=()=>{audit.created++;if(createFailure)throw createFailure;return engine;};
 const context=vm.createContext({URL,EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError,installWorkerMessageProtocol,workerMessageFailure,AbortController,Uint8Array,resolveComputeProfile:()=>({memoryBudgetBytes:128*1024**2}),loadEngine:async()=>{if(delayedLoad)await delayedLoad;if(loadFailure)throw loadFailure;return{createEngine};},self:{postMessage:data=>messages.push(data)}});new vm.Script(workerSource).runInContext(context);
 const send=async(action,payload={})=>{const id=++count;context.self.onmessage({data:{id,action,payload,options:{uiRGBBudgetBytes:32*1024**2,uiReserveBytes:32*1024**2}}});await turn();return {id,terminal:messages.find(x=>x.id===id&&(x.error||Object.hasOwn(x,'result')))};};
 return {context,messages,audit,send};
}
test('the classic worker exposes a module import refusal through its installed protocol before sending source or running calculations',{timeout:2000},async()=>{
 const cause=new TypeError('Failed to fetch dynamically imported module'),h=endpoint({loadFailure:cause}),{terminal}=await h.send('capabilities');assert.equal(terminal.error.code,'WORKER_LOAD_FAILED');assert.equal(terminal.error.details.phase,'module-load');assert.equal(terminal.error.details.moduleURL,new URL('./unified-engine/src/index.js',workerURL).href);assert.equal(terminal.error.cause.message,cause.message);assert.deepEqual(h.audit,{created:0,loads:0,runs:0,exportsReleased:0});
});
test('the classic worker distinguishes engine construction failures and retains allocation domains',{timeout:2000},async()=>{
 const cause=new EngineError('MEMORY_ALLOCATION','heap allocation refused',{details:{allocationKind:'wasm'}}),h=endpoint({createFailure:cause}),{terminal}=await h.send('load',{id:'source'});assert.equal(terminal.error.code,'MEMORY_ALLOCATION');assert.equal(terminal.error.details.phase,'engine-create');assert.equal(terminal.error.details.allocationKind,'wasm');assert.equal(h.audit.loads,0);assert.equal(h.audit.runs,0);
});
test('the classic worker protocol settles a fatal message during a delayed import and never constructs the engine afterwards',{timeout:2000},async()=>{
 let finish;const h=endpoint({delayedLoad:new Promise(resolve=>finish=resolve)});await h.send('capabilities');h.context.self.onmessageerror({});finish();await turn();assert.equal(h.messages.length,1);assert.equal(h.messages[0].fatal.code,'WORKER_MESSAGE_FAILED');assert.equal(h.audit.created,0);
});
for(const fault of ['null','messageerror','invalid-ack'])test('classic worker '+fault+' while awaiting an export acknowledgement releases the archive and drains its queue',{timeout:2000},async()=>{
 const h=endpoint();await h.send('load',{id:'source'});const {id}=await h.send('export-raster',{display:{id:'source',revision:1},options:{}});assert.equal(vm.runInContext('acks.size',h.context),1);assert.ok(h.messages.some(x=>x.id===id&&x.chunk));
 if(fault==='messageerror')h.context.self.onmessageerror({});else h.context.self.onmessage({data:fault==='null'?null:{id,action:'export-ack',sequence:0}});await turn();assert.equal(h.audit.exportsReleased,1);assert.equal(vm.runInContext('acks.size',h.context),0);assert.equal(h.messages.filter(x=>x.fatal).length,1);
 const previous=h.messages.length;h.context.self.onmessage({data:{id:9,action:'capabilities'}});await turn();assert.equal(h.messages.length,previous);
});
test('classic worker export acknowledgement preserves the consumer error and keeps subsequent source work usable',{timeout:2000},async()=>{
 const h=endpoint();await h.send('load',{id:'source'});const {id}=await h.send('export-raster',{display:{id:'source',revision:1},options:{}}),failure={code:'WRITE_FAILED',message:'consumer refused',cause:{code:'INTERNAL',message:'original sink error'}};
 h.context.self.onmessage({data:{id,action:'export-ack',sequence:1,error:failure}});await turn();const terminal=h.messages.find(x=>x.id===id&&x.error);assert.equal(terminal.error.code,failure.code);assert.equal(terminal.error.cause.message,failure.cause.message);assert.equal(h.audit.exportsReleased,1);assert.equal(vm.runInContext('acks.size',h.context),0);assert.equal(h.messages.some(x=>x.fatal),false);assert.equal((await h.send('capabilities')).terminal.result.ready,true);
});
test('classic raster cleanup failure cannot replace the consumer error or its original cause',{timeout:2000},async()=>{
 const cleanup=new EngineError('CLEANUP_FAILED','Export handle could not be released',{cause:Error('original cleanup failure')}),h=endpoint({releaseFailure:cleanup});await h.send('load',{id:'source'});
 const {id}=await h.send('export-raster',{display:{id:'source',revision:1},options:{}}),failure={code:'WRITE_FAILED',message:'consumer refused',cause:{code:'INTERNAL',message:'original sink error'}};
 h.context.self.onmessage({data:{id,action:'export-ack',sequence:1,error:failure}});await turn();const terminal=h.messages.find(x=>x.id===id&&x.error);assert.equal(terminal.error.code,'WRITE_FAILED');assert.equal(terminal.error.cause.message,'original sink error');assert.equal(terminal.error.details.cleanup.code,'CLEANUP_FAILED');assert.equal(terminal.error.details.cleanup.cause.message,'original cleanup failure');assert.equal(h.audit.exportsReleased,1);assert.equal(vm.runInContext('acks.size',h.context),0);
});
