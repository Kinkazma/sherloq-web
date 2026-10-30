import "../../runtime-context.js?v=0.30.0";
// SHERLOQ dedicated-worker ownership wrapper. It changes no operator or tensor.
import {EngineError,checkAbort} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
const bounded=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new EngineError('WORKER_FAILED',label,{details:{glueRetirementPending:true}})),ms);})]);}finally{clearTimeout(timer);}};
export function createGlueWorkerOwner(ort,{signal,getSignal=()=>signal,timeoutMs=5000}={}){
 const tensors=new Map(),sessions=new Map(),devices=new Map(),seenDevices=new WeakSet();let retiring,retiringKeepsDevice=false,attempts=0,retiredDevices=0;
 const captureDevice=(dirty=false)=>{const device=ort.env.webgpu?.device;if(device&&!seenDevices.has(device)){seenDevices.add(device);devices.set(device,{destroyed:false,lost:false,fenced:false});}const state=device&&devices.get(device);if(state&&dirty)state.fenced=false;};
 const tracked=(value,records,method)=>{
  if(records.has(value))return value;const original=value[method].bind(value),record={pending:null};records.set(value,record);
  const retire=()=>{if(!records.has(value))return;if(record.pending)return record.pending;let result;try{result=original();}catch(error){throw error;}if(result&&typeof result.then==='function'){record.pending=Promise.resolve(result).then(ack=>{if(ack===0||ack===false)throw ack;records.delete(value);}).catch(error=>{record.pending=null;throw error;});void record.pending.catch(()=>{});return record.pending;}if(result===0||result===false)throw result;records.delete(value);return result;};
  record.retire=retire;value[method]=retire;return value;
 };
 class OwnedTensor extends ort.Tensor{constructor(...args){super(...args);tracked(this,tensors,'dispose');}}
 const createSession=async(...args)=>{checkAbort(getSignal());let session;try{session=await ort.InferenceSession.create(...args);tracked(session,sessions,'release');const run=session.run.bind(session);session.run=async(...inputs)=>{checkAbort(getSignal());let outputs;try{outputs=await run(...inputs);for(const tensor of Object.values(outputs))tracked(tensor,tensors,'dispose');checkAbort(getSignal());return outputs;}finally{captureDevice(true);}};checkAbort(getSignal());return session;}finally{captureDevice(true);}};
 const api={...ort,Tensor:OwnedTensor,InferenceSession:{create:createSession}};
 const owner={ort:api,
  get state(){return{tensors:tensors.size,sessions:sessions.size,devices:devices.size,retiredDevices,unacknowledgedDevices:[...devices.values()].filter(x=>!x.lost).length,attempts};},
  retire({keepDevice=false}={}){if(retiring)return!keepDevice&&retiringKeepsDevice?retiring.then(()=>owner.retire()):retiring;retiringKeepsDevice=keepDevice;retiring=(async()=>{
   attempts++;captureDevice();let failed=false,primary;const attempt=async operation=>{try{await operation();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}};
   // Every independent resource is attempted, even if a previous callback fails.
   for(const record of [...tensors.values()])await attempt(()=>record.retire());
   for(const record of [...sessions.values()])await attempt(()=>record.retire());
   for(const[device,state]of devices){
    if(!state.fenced&&!state.lost)await attempt(async()=>{await bounded(device.queue.onSubmittedWorkDone(),timeoutMs,'Glue queue retirement timed out.');state.fenced=true;});
    const closeDevice=!keepDevice||!state.fenced;
    if(closeDevice&&!state.destroyed)await attempt(()=>{device.destroy();state.destroyed=true;});
    if(closeDevice&&!state.lost)await attempt(async()=>{await bounded(device.lost,timeoutMs,'Glue device loss acknowledgement timed out.');state.lost=true;});
   }
   const ack=!tensors.size&&!sessions.size&&[...devices.values()].every(x=>keepDevice?x.fenced||x.lost:x.lost);
   for(const[device,state]of devices)if(state.lost){devices.delete(device);retiredDevices++;}
   return{ack,failed,error:primary,state:{tensors:tensors.size,sessions:sessions.size,devices:devices.size,retiredDevices,unacknowledgedDevices:[...devices.values()].filter(x=>!x.lost).length,retainedDevice:keepDevice,jobFencesAcknowledged:[...devices.values()].every(x=>x.fenced||x.lost),attempts}};
  })();void retiring.finally(()=>{retiring=null;});return retiring;}
 };return owner;
}
