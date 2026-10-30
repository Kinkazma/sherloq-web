import {EngineError} from './errors.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
// Same acknowledged-retirement protocol as the stereo/wavelet providers.
// A transaction remains registered until every buffer, scope, mapped owner
// and reservation acknowledges retirement. A rejected fence is not an ACK.
export function gpuTransaction(owner){const record={device:null,buffers:new Map(),mapping:null,scopes:0,drained:false,workspace:null,outputFree:null,lease:null};owner.pending.add(record);return record;}
export function attachGpuCleanup(primary,cleanup){if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}}
export async function retireGpuTransaction(owner,record){
 let failed=false,primary;const attempt=async operation=>{try{await operation();}catch(error){if(!failed){failed=true;primary=error;}}};
 if(record.mapping?.mapped)await attempt(()=>{nativeGpuSync(()=>record.mapping.buffer.unmap());record.mapping.mapped=false;});
 for(const[buffer,entry]of record.buffers)if(!entry.destroyed)await attempt(()=>{nativeGpuSync(()=>buffer.destroy());entry.destroyed=true;if(record.mapping?.buffer===buffer)record.mapping.mapped=false;});
 if(record.device&&!record.drained)await attempt(async()=>{
  try{await nativeGpuAsync(()=>record.device.queue.onSubmittedWorkDone());}
  catch(error){if(!owner.deviceDestroyed||!record.device.lost)throw error;await record.device.lost;record.contextLost=true;}
  record.drained=true;
 });
 if(record.contextLost)record.scopes=0;
 else while(record.scopes){let accepted=false;await attempt(async()=>{try{const error=await nativeGpuAsync(()=>record.device.popErrorScope());record.scopes--;accepted=true;if(error)throw new EngineError('GPU_FAILED',error.message);}catch(error){if(owner.deviceDestroyed&&record.device.lost){await record.device.lost;record.contextLost=true;record.scopes=0;accepted=true;return;}throw error;}});if(!accepted)break;}
 if(!record.device||record.drained){
  if(record.mapping&&!record.mapping.mapped)await attempt(async()=>{await record.mapping.release?.();record.mapping=null;});
  for(const[buffer,entry]of record.buffers)if(entry.destroyed)await attempt(async()=>{if(!entry.backingRetired){entry.retiredBytes=await entry.release?.();entry.backingRetired=true;}if(!entry.notified){if(entry.retiredBytes!==0)owner.budget.notifyBackingRelease?.('gpu',entry.retiredBytes??entry.bytes);entry.notified=true;}record.buffers.delete(buffer);});
  if(!record.buffers.size&&!record.mapping&&!record.scopes){
   await attempt(async()=>{await record.outputFree?.();record.outputFree=null;});await attempt(async()=>{await record.workspace?.();record.workspace=null;});
   if(!record.outputFree&&!record.workspace){await attempt(async()=>{await record.lease?.release();record.lease=null;});if(!record.lease)owner.pending.delete(record);}
  }
 }
 if(failed)throw primary;
}
export async function drainGpuTransactions(owner){let failed=false,primary;for(const record of [...owner.pending])try{await retireGpuTransaction(owner,record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
