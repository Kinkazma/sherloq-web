import "../../runtime-context.js?v=0.31.0";
import {fusedCpu} from './ela-lut.js';
import {allocateOwnedTypedArray,allocateTypedArray} from './allocation.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort,deserializeWorkerError} from './errors.js';

const OVERHEAD=4*1024**2;
// Same native LUT kernel, actor count and pixel partition as LutPool. This
// owner is private to one synthesis job; normal interactive pools are unchanged.
export class ElaSynthesisLutPool{
 constructor(budget,profile,{workerFactory=url=>new Worker(url,{type:'module'}),workerAvailable=()=>typeof Worker!=='undefined'}={}){
  this.budget=budget;this.profile=profile;this.resourceOwner='lut';this.workerFactory=workerFactory;this.workerAvailable=workerAvailable;this.slots=[];this.serial=0;this.frames=0;this.starts=0;this.installs=0;this.plan=null;this.table=null;this.tableOwner=null;this.flight=null;this.closing=false;this.closed=false;this.disposal=null;
 }
 send(slot,message,transfer=[]){
  if(slot.failure)return Promise.reject(slot.failure);if(message.method!=='shutdown'&&(this.closing||slot.retired))return Promise.reject(new EngineError('CANCELLED','Synthesis LUT session is retiring.'));const id=++this.serial;
  return new Promise((resolve,reject)=>{slot.pending.set(id,{resolve,reject});try{slot.worker.postMessage({id,...message},transfer);}catch(error){slot.pending.delete(id);reject(error);}});
 }
 rpc(slot,message,transfer=[],signal){return scheduledWorkerCall(this,()=>this.send(slot,message,transfer),{signal,label:'synthesis-lut-pool'});}
 createSlot(){
  const release=this.budget.reserve(OVERHEAD),slot={worker:null,pending:new Map(),release,retiring:null,retired:false,failure:null};
  try{
   slot.worker=this.workerFactory(new URL('./ela-synthesis-lut-worker.js',import.meta.url));this.starts++;this.slots.push(slot);
   slot.worker.onmessage=({data})=>{const pending=slot.pending.get(data?.id);if(!pending)return;slot.pending.delete(data.id);data.error?pending.reject(deserializeWorkerError(data.error,'Synthesis LUT worker failed.')):pending.resolve(data);};
   slot.worker.onerror=event=>{slot.failure=new EngineError('WORKER_FAILED',event?.message??'Synthesis LUT worker failed.');for(const pending of slot.pending.values())pending.reject(slot.failure);slot.pending.clear();};
   return slot;
  }catch(error){if(slot.worker){slot.worker.terminate();this.slots.splice(this.slots.indexOf(slot),1);}release();throw error;}
 }
 async initialize(a,table,signal){
  const available=this.workerAvailable()?Math.min(this.profile.maxWorkers,a.length/3):1;
  this.plan=new AdaptiveConcurrency().select(String(a.length),available,this.budget,count=>count>1?count*OVERHEAD:0);
  this.tableOwner=allocateOwnedTypedArray(Uint8Array,table.length,{budget:this.budget,owner:'ela-synthesis',label:'job-native-ELA-LUT'});this.tableOwner.data.set(table);this.table=this.tableOwner.data;
  if(this.plan.count>1){
   for(let i=0;i<this.plan.count;i++){checkAbort(signal);this.createSlot();}
   const replies=await Promise.allSettled(this.slots.map(slot=>this.rpc(slot,{method:'install',table:this.table},[],signal))),failure=replies.find(value=>value.status==='rejected');if(failure)throw failure.reason;requireValue(replies.every(value=>value.value.ready===true),'Synthesis LUT installation was not acknowledged.');this.installs++;
  }
 }
 async execute(a,b,params,signal){
  const pixels=a.length/3,count=this.slots.length;
  const replies=await Promise.allSettled(this.slots.map((slot,i)=>{
   const begin=Math.floor(pixels*i/count)*3,end=Math.floor(pixels*(i+1)/count)*3,aa=a.slice(begin,end),bb=b.slice(begin,end);
   return this.rpc(slot,{method:'compute',a:aa,b:bb,params},[aa.buffer,bb.buffer],signal);
  }));
  const failure=replies.find(value=>value.status==='rejected');if(failure)throw failure.reason;checkAbort(signal);const data=allocateTypedArray(Uint8Array,a.length,{label:'synthesis-native-LUT-output'});let at=0;
  for(let i=0;i<replies.length;i++){const {value}=replies[i],expected=(Math.floor(pixels*(i+1)/count)-Math.floor(pixels*i/count))*3;requireValue(value.result instanceof Uint8Array&&value.result.length===expected&&at<=data.length-value.result.length,'Synthesis LUT worker returned another RGB partition.');data.set(value.result,at);at+=value.result.length;}
  requireValue(at===data.length,'Synthesis LUT workers omitted native RGB channels.');return data;
 }
 run(a,b,params,table,{signal}={}){
  requireValue(!this.closing&&!this.closed&&!this.flight,'Synthesis LUT session is closed or busy.');requireValue(a instanceof Uint8Array&&b instanceof Uint8Array&&a.length>0&&a.length===b.length&&a.length%3===0&&table instanceof Uint8Array&&table.length===65536,'A native RGB pair and complete LUT are required.');checkAbort(signal);
  const started=performance.now(),abort=()=>{void this.dispose().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  const task=(async()=>{
   const reused=!!this.plan;if(!this.plan)await this.initialize(a,table,signal);else{requireValue(this.table.length===table.length&&this.table.every((value,i)=>value===table[i]),'A synthesis LUT session cannot change its native lookup.');}
   checkAbort(signal);if(this.closing)throw new EngineError('CANCELLED','Synthesis LUT session is retiring.');const data=this.plan.count===1?await fusedCpu(a,b,params,this.table,{signal}):await this.execute(a,b,params,signal);checkAbort(signal);if(this.closing)throw new EngineError('CANCELLED','Synthesis LUT session is retiring.');this.frames++;
   return{data,workers:this.plan.count,scheduling:{...this.plan,taskExecutions:1,preflightExecutions:0,retry:null,synthesisSession:true,reusedWorkers:reused,workerStarts:this.starts,tableInstallations:this.installs,completedFrames:this.frames,retirement:'job-finish-cancel-dispose-ACK'},kernelMs:performance.now()-started};
  })();this.flight=task;void task.finally(()=>{signal?.removeEventListener('abort',abort);if(this.flight===task)this.flight=null;}).catch(()=>{});return task;
 }
 retireSlot(slot){
  if(slot.retired)return Promise.resolve();if(slot.retiring)return slot.retiring;
  const task=(async()=>{const answer=await this.send(slot,{method:'shutdown'});requireValue(answer.retired===true,'Synthesis LUT retirement was not acknowledged.');slot.worker.terminate();slot.release();slot.retired=true;this.slots.splice(this.slots.indexOf(slot),1);})();
  slot.retiring=task;void task.finally(()=>{if(slot.retiring===task)slot.retiring=null;}).catch(()=>{});return task;
 }
 dispose(){
  if(this.disposal)return this.disposal;if(this.closed)return Promise.resolve();this.closing=true;cancelScheduledWorkerCalls(this);const flight=this.flight;
  const task=(async()=>{
   // Shutdown is an out-of-band control message, never queued behind the CPU
   // actor it must cancel. Each reservation survives through its child ACK.
   const retirements=Promise.allSettled([...this.slots].map(slot=>this.retireSlot(slot)));await flight?.catch(()=>{});const answers=await retirements,failure=answers.find(value=>value.status==='rejected');if(failure)throw failure.reason;
   await retireCompositeOwners([()=>this.tableOwner?.release()]);this.tableOwner=null;this.table=null;this.closed=true;
  })();this.disposal=task;void task.finally(()=>{if(this.disposal===task)this.disposal=null;}).catch(()=>{});return task;
 }
}
