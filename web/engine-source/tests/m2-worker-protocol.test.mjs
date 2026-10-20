import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createM2WorkerClient} from '../src/m2-worker-client.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
class Worker{
 constructor(){this.messages=[];this.terminated=false;}
 postMessage(message,transfer=[]){(this.transfers??=[]).push(transfer);this.messages.push(message);}
 terminate(){this.terminated=true;}
 emit(data){this.onmessage?.({data});}
}
async function fixture(){const worker=new Worker(),opening=createM2WorkerClient({methods:{}},{workerFactory:()=>worker});worker.emit({id:worker.messages[0].id,value:{windowBytes:4*1024**2}});return {worker,client:await opening};}
for(const phase of ['initialization','requests'])for(const fault of ['null','messageerror','invalid-id','missing-result','bad-error'])test('M2 '+fault+' during '+phase+' rejects every request and stops the failed endpoint',{timeout:2000},async()=>{
 const worker=new Worker(),opening=createM2WorkerClient({methods:{}},{workerFactory:()=>worker});let client,pending=[opening];
 if(phase==='requests'){worker.emit({id:worker.messages[0].id,value:{windowBytes:4*1024**2}});client=await opening;pending=[client.memory(),client.clearCache()];}
 const rejected=pending.map(p=>assert.rejects(p,e=>e.code==='WORKER_MESSAGE_FAILED'));
 if(fault==='messageerror')worker.onmessageerror({});else worker.emit(fault==='null'?null:fault==='invalid-id'?{id:0,value:true}:fault==='bad-error'?{id:worker.messages.at(-1).id,error:'lost cause'}:{id:worker.messages.at(-1).id});
 await Promise.all(rejected);assert.equal(worker.terminated,true);assert.equal(worker.onmessage,null);assert.equal(worker.onmessageerror,null);if(client)await assert.rejects(client.memory(),{code:'DISPOSED'});
});
test('M2 fatal endpoint failures preserve their cause and reject concurrent requests',{timeout:2000},async()=>{
 const {worker,client}=await fixture(),calls=[client.memory(),client.clearCache()],expected={code:'WORKER_LOAD_FAILED',message:'Host module load failed',details:{moduleURL:'https://example.invalid/host.js'},cause:{name:'TypeError',message:'Failed to fetch dynamically imported module'}};
 const rejected=calls.map(p=>assert.rejects(p,e=>e.code===expected.code&&e.cause.message===expected.cause.message&&e.details.moduleURL===expected.details.moduleURL));worker.emit({fatal:true,error:expected});await Promise.all(rejected);assert.equal(worker.terminated,true);
});
test('M2 browser errors retain source details and settle all requests',{timeout:2000},async()=>{
 const {worker,client}=await fixture(),pending=client.memory(),cause=Error('worker import refused'),rejected=assert.rejects(pending,e=>e.code==='WORKER_FAILED'&&e.cause===cause&&e.details.workerEvent.line===17);
 worker.onerror({type:'error',message:'Module could not be loaded',filename:'https://example.invalid/worker.js',lineno:17,colno:3,error:cause});await rejected;assert.equal(worker.terminated,true);
});
test('M2 asynchronous progress rejection cancels only its request, preserves its cause and releases a completed result',{timeout:2000},async()=>{
 const {worker,client}=await fixture();let rejectProgress;const cause=Error('Progress callback rejected');
 const analysis=client.analyze('trufor',{}, {}, {onProgress:()=>new Promise((_,reject)=>rejectProgress=reject)}),analysisId=worker.messages.at(-1).id,peer=client.memory(),peerId=worker.messages.at(-1).id;
 const rejected=assert.rejects(analysis,e=>e===cause);worker.emit({id:analysisId,progress:{phase:'inference'}});worker.emit({id:analysisId,value:{id:9}});rejectProgress(cause);await rejected;
 assert.ok(worker.messages.some(x=>x.operation==='cancel'&&x.args.requestId===analysisId));assert.ok(worker.messages.some(x=>x.operation==='releaseResult'&&x.args.resultId===9));assert.equal(worker.terminated,false);
 worker.emit({id:peerId,value:{retainedBytes:0}});assert.deepEqual(await peer,{retainedBytes:0});const disposed=client.dispose();worker.emit({id:worker.messages.at(-1).id,value:true});await disposed;
});
test('M2 transport failure during an asynchronous progress callback cannot resolve a late result',{timeout:2000},async()=>{
 const {worker,client}=await fixture();let resolveProgress;const pending=client.analyze('trufor',{}, {}, {onProgress:()=>new Promise(resolve=>resolveProgress=resolve)}),id=worker.messages.at(-1).id;
 const rejected=assert.rejects(pending,{code:'WORKER_MESSAGE_FAILED'});worker.emit({id,progress:{phase:'inference'}});worker.emit({id,value:{id:7}});worker.onmessageerror({});await rejected;resolveProgress();await turn();assert.equal(worker.terminated,true);
});

const endpointSource=await readFile(new URL(import.meta.resolve('../src/m2-worker.js')),'utf8');
const asModule=source=>'data:text/javascript,'+encodeURIComponent(source);
async function endpoint(hostSource){
 const old=globalThis.self,messages=[],target={postMessage:message=>messages.push(message)},hostURL=asModule(hostSource);globalThis.self=target;
 const module=await import(asModule(endpointSource.replaceAll("'./m2-worker-host.js'",JSON.stringify(hostURL))+'\nexport const loaderSettled=loaded;\n// case '+crypto.randomUUID()));
 return {target,messages,async settle(){await module.loaderSettled;await turn();},restore(){globalThis.self=old;}};
}
test('M2 bootstrap retains early commands and permits cancellation while useful work remains active',{timeout:2000},async()=>{
 const f=await endpoint(`export function createM2WorkerHost({post}){let finish;return{handle(data){if(data.operation==='initialize')return post({id:data.id,value:'ready'});if(data.operation==='analyze')return new Promise(resolve=>finish=()=>{post({id:data.id,value:'finished'});resolve();});if(data.operation==='cancel'){post({id:data.id,value:'cancelled'});finish();}}};}`);
 try{for(const [id,operation]of [[1,'initialize'],[2,'analyze'],[3,'cancel']])f.target.onmessage({data:{id,operation,args:{}}});await f.settle();assert.deepEqual(f.messages,[{id:1,value:'ready'},{id:3,value:'cancelled'},{id:2,value:'finished'}]);}finally{f.restore();}
});
test('M2 bootstrap imports keep a failure cause and module identity for every early request',{timeout:2000},async()=>{
 const f=await endpoint(`throw new TypeError('Host dependency was unavailable');`);
 try{for(const id of [1,2])f.target.onmessage({data:{id,operation:'initialize',args:{}}});await f.settle();assert.deepEqual(f.messages.map(x=>x.id),[1,2]);for(const m of f.messages){assert.equal(m.error.code,'WORKER_LOAD_FAILED');assert.equal(m.error.cause.name,'TypeError');assert.equal(m.error.cause.message,'Host dependency was unavailable');assert.ok(m.error.details.moduleURL.startsWith('data:text/javascript,'));}}finally{f.restore();}
});
test('M2 bootstrap observes an asynchronous host rejection instead of leaving the request pending',{timeout:2000},async()=>{
 const f=await endpoint(`export function createM2WorkerHost(){return{async handle(){await Promise.resolve();throw Object.assign(Error('Asynchronous host failure'),{code:'INTERNAL',cause:Error('original cause')});}};}`);
 try{f.target.onmessage({data:{id:1,operation:'initialize',args:{}}});await f.settle();assert.equal(f.messages.length,1);assert.equal(f.messages[0].id,1);assert.equal(f.messages[0].error.code,'INTERNAL');assert.equal(f.messages[0].error.cause.message,'original cause');}finally{f.restore();}
});
for(const fault of ['null','malformed','messageerror'])test('M2 bootstrap '+fault+' is fatal, reported once and rejects later commands',{timeout:2000},async()=>{
 const f=await endpoint(`export function createM2WorkerHost(){return{handle(){throw Error('No invalid command must reach the host');}};}`);
 try{if(fault==='messageerror')f.target.onmessageerror({});else f.target.onmessage({data:fault==='null'?null:{id:1}});f.target.onmessage({data:{id:2,operation:'memory'}});await f.settle();assert.equal(f.messages.length,1);assert.equal(f.messages[0].fatal,true);assert.equal(f.messages[0].error.code,'WORKER_MESSAGE_FAILED');assert.equal(f.messages[0].error.details.transport.event,fault==='messageerror'?'messageerror':'message');}finally{f.restore();}
});
test('M2 malformed transport prevents already queued bootstrap work from starting',{timeout:2000},async()=>{
 const f=await endpoint(`export function createM2WorkerHost(){return{handle(){throw Error('A fatal endpoint must not start queued work');}};}`);
 try{f.target.onmessage({data:{id:1,operation:'analyze',args:{}}});f.target.onmessageerror({});await f.settle();assert.equal(f.messages.length,1);assert.equal(f.messages[0].fatal,true);}finally{f.restore();}
});
test('M2 native source transfers only its reader port and retains failure cleanup of a completed preparation',async()=>{
 const {worker,client}=await fixture(),channel=new MessageChannel(),cause=Error('Native preparation progress failed');let rejectProgress;
 const image={format:'rgb8-window-source',width:3,height:2,sha256:'a'.repeat(64),port:channel.port2},analysis=client.analyzeNativeSource('scientific-preparation',image,{textOnly:true},{onProgress:()=>new Promise((_,reject)=>rejectProgress=reject)}),id=worker.messages.at(-1).id;
 assert.equal(worker.messages.at(-1).operation,'analyzeNativeSource');assert.equal(worker.messages.at(-1).args.image,image);assert.deepEqual(worker.transfers.at(-1),[channel.port2]);
 const rejected=assert.rejects(analysis,e=>e===cause);worker.emit({id,progress:{phase:'text-detection'}});worker.emit({id,value:{id:19}});rejectProgress(cause);await rejected;assert(worker.messages.some(x=>x.operation==='releaseResult'&&x.args.resultId===19));
 channel.port1.close();channel.port2.close();const disposed=client.dispose();worker.emit({id:worker.messages.at(-1).id,value:true});await disposed;
});
