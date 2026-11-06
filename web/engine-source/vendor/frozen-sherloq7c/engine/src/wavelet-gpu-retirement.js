import {EngineError} from './errors.js';
import {nativeGpuAsync} from './gpu-native-boundary.js';

// Validation and submitted-work acknowledgement precede the consumer. The
// operation's reservation still owns its CPU readback until consumption ends.
export async function validateWaveletGpuOperation(record,{signal}={}){
 let failed=false,primary;
 while(record.scopes){record.scopes--;try{const error=await nativeGpuAsync(()=>record.device.popErrorScope(),{signal});if(error)throw new EngineError(error.name==='GPUOutOfMemoryError'?'GPU_OUT_OF_MEMORY':'GPU_FAILED',error.message);}catch(error){if(!failed){failed=true;primary=error;}}}
 if(failed)throw primary;
 await nativeGpuAsync(()=>record.device.queue.onSubmittedWorkDone(),{signal});record.drained=true;
}

export function waveletGpuOperation(owner){
 const record={device:null,buffers:new Set(),scopes:0,temporary:null,release:null,drained:false};
 owner.pending.add(record);return record;
}
export function attachWaveletGpuCleanup(primary,cleanup){
 if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}
}
export async function retireWaveletGpuOperation(owner,record){
 let failed=false,primary;
 const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};
 for(const buffer of record.buffers)await attempt(()=>{if(buffer.mapState==='mapped')buffer.unmap();buffer.destroy();record.buffers.delete(buffer);});
 if(record.device&&!record.drained)await attempt(async()=>{
  try{await record.device.queue.onSubmittedWorkDone();}
  catch(error){
   // Destroyed-device loss is an acknowledgement of context retirement. An
   // ordinary rejected queue fence alone cannot refund live GPU ownership.
   if(!owner.deviceDestroyed||!record.device.lost)throw error;
   await record.device.lost;
  }
  record.drained=true;
 });
 while(record.scopes){record.scopes--;await attempt(async()=>{const error=await record.device.popErrorScope();if(error)throw new EngineError('UNSUPPORTED_BACKEND',error.message);});}
 if((!record.device||record.drained)&&!record.buffers.size){
  if(record.temporary)await attempt(async()=>{await record.temporary.dispose();record.temporary=null;});
  if(!record.temporary){await attempt(()=>{record.release?.();record.release=null;});if(!record.release)owner.pending.delete(record);}
 }
 if(failed)throw primary;
}
export async function drainWaveletGpuOperations(owner){
 let failed=false,primary;
 for(const record of [...owner.pending])try{await retireWaveletGpuOperation(owner,record);}catch(error){if(!failed){failed=true;primary=error;}}
 if(failed)throw primary;
}
