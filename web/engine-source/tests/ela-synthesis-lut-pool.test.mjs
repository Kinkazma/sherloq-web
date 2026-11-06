import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {fusedCpu} from '../src/ela-lut.js';
import {EngineError,requireValue,serializeEngineError} from '../src/errors.js';
import {ElaSynthesisLutPool} from '../src/ela-synthesis-lut-pool.js';

const MiB=1024**2,tick=()=>new Promise(setImmediate),gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture({retireGate,holdCompute=false,firstRetirementRefused=false,computeError=false}={}){
 const children=[],budget=new Budget(128*MiB),entered=gate();let computes=0;
 class Child{
  constructor(){this.commands=[];this.retirements=0;children.push(this);}
  reply(data,transfer=[]){const value=structuredClone(data,{transfer});queueMicrotask(()=>this.onmessage?.({data:value}));}
  postMessage(packet,transfer=[]){const data=structuredClone(packet,{transfer});this.commands.push(data);
   if(data.method==='install'){this.table=data.table;this.reply({id:data.id,ready:true});return;}
   if(data.method==='shutdown'){this.retirements++;this.controller?.abort();void(async()=>{await this.running?.catch(()=>{});if(retireGate)await retireGate.promise;this.table=null;this.reply({id:data.id,retired:!(firstRetirementRefused&&this===children[0]&&this.retirements===1)});})();return;}
   this.controller=new AbortController();const own=this.controller;this.running=(async()=>{try{
    if(++computes===4)entered.resolve();if(holdCompute)await new Promise((_,reject)=>own.signal.addEventListener('abort',()=>reject(new EngineError('CANCELLED','Controlled abort')),{once:true}));
    if(computeError&&this===children[0])throw new EngineError('WORKER_RESOURCE','Controlled worker resource refusal');const result=await fusedCpu(data.a,data.b,data.params,this.table,{signal:own.signal});this.reply({id:data.id,result},[result.buffer]);
   }catch(error){this.reply({id:data.id,error:serializeEngineError(error)});}})();
  }
  terminate(){this.terminated=true;}
 }
 const pool=new ElaSynthesisLutPool(budget,{maxWorkers:4},{workerFactory:()=>new Child(),workerAvailable:()=>true}),a=Uint8Array.from({length:60},(_,i)=>i*31),b=Uint8Array.from(a,(v,i)=>(v+i*7)%256),table=Uint8Array.from({length:65536},(_,i)=>((i>>>8)^(i&255))),params={quality:75,scale:1,contrast:0,linear:false,grayscale:false};return{pool,budget,children,a,b,table,params,entered};
}
test('one job reuses the same requested workers and native LUT across independently changed frame pairs',async()=>{
 const h=fixture(),original=h.a.slice();try{
  for(let frame=0;frame<3;frame++){const b=Uint8Array.from(h.b,v=>(v+frame*11)%256),params={...h.params,quality:frame+1,grayscale:frame===2},expected=await fusedCpu(h.a,b,params,h.table),answer=await h.pool.run(h.a,b,params,h.table.slice());assert.deepEqual(answer.data,expected);assert.equal(answer.workers,4);assert.equal(answer.scheduling.reusedWorkers,frame>0);assert.equal(answer.scheduling.workerStarts,4);assert.equal(answer.scheduling.tableInstallations,1);assert.equal(answer.scheduling.completedFrames,frame+1);assert(h.budget.total()>=4*4*MiB+65536);}
  assert.deepEqual(h.a,original);assert.equal(h.children.length,4);for(const child of h.children){assert.equal(child.commands.filter(v=>v.method==='install').length,1);assert.equal(child.commands.filter(v=>v.method==='compute').length,3);assert.equal(child.terminated,undefined);}
 }finally{await h.pool.dispose();}assert.equal(h.budget.total(),0);assert(h.children.every(child=>child.terminated));
});
test('worker and LUT credits remain owned until every retirement ACK, then disposal is idempotent',async()=>{
 const retire=gate(),h=fixture({retireGate:retire});await h.pool.run(h.a,h.b,h.params,h.table);const owned=h.budget.total();let done=false;const closing=h.pool.dispose().then(()=>done=true);await tick();assert.equal(done,false);assert.equal(h.budget.total(),owned);assert(h.children.every(child=>!child.terminated));retire.resolve();await closing;assert.equal(h.budget.total(),0);await h.pool.dispose();assert.equal(h.budget.total(),0);
});
test('a rejected child retirement never refunds that worker early and can be retried',async()=>{
 const h=fixture({firstRetirementRefused:true});await h.pool.run(h.a,h.b,h.params,h.table);await assert.rejects(h.pool.dispose(),/not acknowledged/);assert.equal(h.budget.total(),4*MiB+65536);assert.equal(h.children[0].terminated,undefined);assert(h.children.slice(1).every(child=>child.terminated));await h.pool.dispose();assert.equal(h.budget.total(),0);assert.equal(h.children[0].retirements,2);
});
test('cancellation preempts active workers out of the CPU queue but keeps credit through shutdown ACK',async()=>{
 const retire=gate(),h=fixture({retireGate:retire,holdCompute:true}),controller=new AbortController(),running=h.pool.run(h.a,h.b,h.params,h.table,{signal:controller.signal}),rejected=assert.rejects(running,{code:'CANCELLED'});await h.entered.promise;const owned=h.budget.total();controller.abort();await rejected;let retired=false;const closing=h.pool.dispose().then(()=>retired=true);await tick();assert.equal(retired,false);assert.equal(h.budget.total(),owned);assert(h.children.every(child=>child.commands.some(v=>v.method==='shutdown')));retire.resolve();await closing;assert.equal(h.budget.total(),0);
});
test('a multiworker error is surfaced without a hidden serial fallback or a reduced actor count',async()=>{
 const h=fixture({computeError:true});try{await assert.rejects(h.pool.run(h.a,h.b,h.params,h.table),{code:'WORKER_RESOURCE'});assert.equal(h.children.length,4);assert(h.children.every(child=>child.commands.filter(v=>v.method==='compute').length===1));}finally{await h.pool.dispose();}assert.equal(h.budget.total(),0);
});
test('disposal after initialization cannot enqueue work behind already acknowledged child shutdown',async()=>{
 const h=fixture(),initialize=h.pool.initialize.bind(h.pool);h.pool.initialize=async(...args)=>{await initialize(...args);void h.pool.dispose();};await assert.rejects(h.pool.run(h.a,h.b,h.params,h.table),{code:'CANCELLED'});await h.pool.dispose();assert(h.children.every(child=>!child.commands.some(message=>message.method==='compute')));assert.equal(h.budget.total(),0);
});
test('the actual dedicated worker reports compute cancellation before its retirement ACK',async()=>{
 const code=(await readFile(new URL('../src/ela-synthesis-lut-worker.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''),messages=[],started=gate(),self={postMessage:data=>messages.push(structuredClone(data))};
 const controlled=async(_a,_b,_p,_table,{signal})=>{started.resolve();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw new EngineError('CANCELLED','Controlled actual handler cancellation');};
 Function('self','fusedCpu','EngineError','requireValue','serializeEngineError','AbortController',code)(self,controlled,EngineError,requireValue,serializeEngineError,AbortController);
 await self.onmessage({data:{id:1,method:'install',table:new Uint8Array(65536)}});const compute=self.onmessage({data:{id:2,method:'compute',a:new Uint8Array(6),b:new Uint8Array(6),params:{}}});await started.promise;const retiring=self.onmessage({data:{id:3,method:'shutdown'}});await Promise.all([compute,retiring]);assert.equal(messages.find(m=>m.id===2).error.code,'CANCELLED');assert.equal(messages.find(m=>m.id===3).retired,true);assert(messages.findIndex(m=>m.id===2)<messages.findIndex(m=>m.id===3));await self.onmessage({data:{id:4,method:'compute',a:new Uint8Array(6),b:new Uint8Array(6),params:{}}});assert.equal(messages.find(m=>m.id===4).error.code,'DISPOSED');
});
