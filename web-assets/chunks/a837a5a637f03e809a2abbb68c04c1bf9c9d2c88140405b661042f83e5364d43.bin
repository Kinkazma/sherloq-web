import "../../../../runtime-context.js?v=0.31.0";
import {SplicebusterPoolGpu} from './splicebuster-pool-gpu.mjs';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../worker-message-protocol.js';
let engine,initializing,active,disposed=false,terminalFailure;
const pendingRequests=new Map(),cancelled=new Set();
const errorData=e=>({code:e.code??'GPU_FAILED',message:e.message??String(e),details:e.details});
const validId=id=>typeof id==='string'||Number.isSafeInteger(id);
function post(id,value,transfer=[]){try{self.postMessage({id,...value},transfer);}catch(cause){const error=workerMessageFailure('splicebuster-gpu','post','serialization-failed');error.knownId=id;error.cause=cause;throw error;}}
async function init(){
 if(disposed)throw terminalFailure??Object.assign(Error('Worker disposed'),{code:'DISPOSED'});
 if(!engine)engine=await(initializing??=SplicebusterPoolGpu.create());
 if(disposed){engine.dispose();throw terminalFailure??Object.assign(Error('Worker disposed'),{code:'DISPOSED'});}
 return engine;
}
function inputTransfers(raw){return [...new Set([raw?.spam?.buffer,raw?.weights?.buffer].filter(b=>b instanceof ArrayBuffer))];}
function returnedRaw(raw){return raw?{spam:raw.spam,weights:raw.weights,shape:raw.shape}:undefined;}
function readbackPermit(id,controller,event){
 return new Promise((resolve,reject)=>{
  const abort=()=>{if(active?.id===id)active.readback=null;reject(terminalFailure??Object.assign(Error('Readback cancelled'),{code:'CANCELLED'}));};
  if(controller.signal.aborted){abort();return;}
  controller.signal.addEventListener('abort',abort,{once:true});
  active.readback=()=>{controller.signal.removeEventListener('abort',abort);active.readback=null;resolve();};
  post(id,{event:'readback-ready',...event});
 });
}
async function dispatch(data){
 const {id,command}=data;
 if(!validId(id))throw workerMessageFailure('splicebuster-gpu','message','missing-id');
 if(typeof command!=='string'){post(id,{error:errorData(workerMessageFailure('splicebuster-gpu','message','missing-command'))});return;}
 if(command==='readback-execute'){
  if(active?.id!==id||!active.readback)throw Object.assign(workerMessageFailure('splicebuster-gpu','message','unexpected-readback-execute'),{knownId:id});
  active.readback();return;
 }
 if(command==='cancel'){
  if(pendingRequests.has(data.jobId))cancelled.add(data.jobId);
  if(active?.id===data.jobId)active.controller.abort();
  post(id,{cancelRequested:true});return;
 }
 if(pendingRequests.has(id))throw Object.assign(workerMessageFailure('splicebuster-gpu','message','duplicate-id'),{knownId:id});
 const raw=data.raw;pendingRequests.set(id,{raw,command});
 try{
  if(command==='dispose'){
   disposed=true;active?.controller.abort();engine?.dispose();
   try{const initialized=await initializing;initialized?.dispose();}catch{}
   try{await active?.done;}catch{}
   if(terminalFailure)throw terminalFailure;post(id,{disposed:true});return;
  }
  const gpu=await init();
  if(terminalFailure)throw terminalFailure;
  if(cancelled.has(id))throw Object.assign(Error('GPU pool job cancelled'),{code:'CANCELLED'});
  if(command==='init'){
   post(id,{ready:true,limits:{maxBufferSize:gpu.device.limits.maxBufferSize,maxStorageBufferBindingSize:gpu.device.limits.maxStorageBufferBindingSize,maxComputeWorkgroupsPerDimension:gpu.device.limits.maxComputeWorkgroupsPerDimension}});return;
  }
  if(command==='plan'){post(id,{plan:gpu.plan(data.geometry,data.maximumGpuBytes)});return;}
  if(command!=='pool')throw Object.assign(Error('Unknown GPU pool command'),{code:'INVALID_INPUT'});
  if(active)throw Object.assign(Error('GPU lane busy'),{code:'BUSY'});
  const controller=new AbortController();
  const job={id,controller,done:null,readback:null};active=job;
  const done=gpu.poolSums(raw,{...data.options,signal:controller.signal,
   onSubmit:event=>post(id,{event:'submitted',...event}),
   beforeReadback:event=>readbackPermit(id,controller,event),
   afterReadback:event=>post(id,{event:'readback-done',...event})});job.done=done;
  let result;try{result=await done;}finally{if(active===job)active=null;}
  if(terminalFailure)throw terminalFailure;
  const transfers=[...new Set([result.sums.buffer,...inputTransfers(raw)])];
  post(id,{result,returnedInputs:returnedRaw(raw),inputReleased:true},transfers);
 }catch(error){
  post(id,{error:errorData(terminalFailure??error),...(raw?{returnedInputs:returnedRaw(raw),inputReleased:true}:{})},inputTransfers(raw));
 }finally{pendingRequests.delete(id);cancelled.delete(id);}
}
installWorkerMessageProtocol(self,dispatch,{label:'splicebuster-gpu',onFailure:error=>{
 terminalFailure=error;disposed=true;active?.controller.abort();engine?.dispose();
 if(pendingRequests.size)return;
 if(validId(error.knownId)){try{post(error.knownId,{error:errorData(error)});return;}catch{}}
 setTimeout(()=>{throw error;},0);
}});
self.postMessage({event:'worker-ready'});
