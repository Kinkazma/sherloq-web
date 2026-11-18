import "../../runtime-context.js?v=0.33.2";
import {deserializeWorkerError,EngineError,requireValue} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {echoLayout} from './echo-layout.js';
// The caller funds each fixed heap and owned transfer. Native16 retirement waits
// for the worker's last reply before its close ACK; no Source loan is transferred.
export class EchoWorkers{
 constructor(count,{budget,resourceOwner='echo',resourceOperation,depth=8}={}){this.budget=budget;this.resourceOwner=resourceOwner;this.resourceOperation=resourceOperation;this.maximum=count;this.depth=depth;this.workers=[];this.pending=new Set();this.closing=false;this.flight=null;
  try{for(let i=0;i<count;i++)this.workers.push(new Worker(new URL('./echo-worker.js',import.meta.url),{type:'module'}));}
  catch(cause){for(const worker of this.workers)worker.terminate();this.workers=[];throw new EngineError('WORKER_RESOURCE','Echo workers could not start.',{cause});}
 }
 call(index,input){if(this.closing)return Promise.reject(new EngineError('CANCELLED','Echo workers stopped.'));return this.budget?scheduledWorkerCall(this,()=>this.dispatch(index,input),{label:'echo-kernel'}):this.dispatch(index,input);}
 dispatch(index,input){
  const worker=this.workers[index];if(!worker||this.closing)return Promise.reject(new EngineError('CANCELLED','Echo workers stopped.'));
  const depth=input.kind==='derivatives'?(input.image.format==='rgb16'?16:8):(input.inputDepth??8),layout=echoLayout(depth,input.radius??input.params.radius);
  requireValue(depth===this.depth,'Echo worker source depth differs from its admitted pool.');
  let settle;const done=new Promise(resolve=>{settle=resolve;});this.pending.add(done);
  return new Promise((resolve,reject)=>{
   const finish=()=>{this.pending.delete(done);settle();};
   worker.onmessage=({data})=>{if(data.echoClosed)return;finish();try{if(data.error)throw deserializeWorkerError(data.error,'Echo worker failed.');const length=input.kind==='derivatives'?input.image.width*input.rows*layout.rawPixelBytes:input.totalBytes/4;requireValue(data.bytes instanceof Uint8Array&&data.bytes.length===length,'Invalid Echo worker bytes.');if(input.kind==='derivatives'){requireValue(data.limits instanceof Float64Array&&data.limits.length===6&&data.limits.every(Number.isFinite),'Invalid Echo worker extrema.');if(depth===16)requireValue(data.inputDepth===16&&data.rawKind===layout.rawKind,'Echo worker raw representation changed.');}resolve(data);}catch(error){reject(error);}};
   worker.onerror=()=>{finish();worker.echoFailed=true;reject(new EngineError('WORKER_FAILED','Echo worker failed.'));};
   try{const buffer=input.kind==='derivatives'?input.image.data.buffer:input.bytes.buffer;worker.postMessage(input,[buffer]);}catch(error){finish();reject(error);}
  });
 }
 clear(){return this.dispose();}
 dispose(){
  if(this.flight)return this.flight;this.closing=true;cancelScheduledWorkerCalls(this);
  const task=(async()=>{await Promise.allSettled([...this.pending]);for(const worker of [...this.workers]){if(this.depth===16&&!worker.echoFailed)await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data?.echoClosed===true)resolve();else reject(new EngineError('WORKER_FAILED','Echo close acknowledgement differs.'));};worker.onerror=()=>reject(new EngineError('WORKER_FAILED','Echo worker close failed.'));try{worker.postMessage({kind:'close'});}catch(error){reject(error);}});await worker.terminate();this.workers.splice(this.workers.indexOf(worker),1);}return true;})();
  this.flight=task;void task.catch(()=>{if(this.flight===task)this.flight=null;});return task.catch(error=>{throw withRetirementOwner(error,this,error);});
 }
}
