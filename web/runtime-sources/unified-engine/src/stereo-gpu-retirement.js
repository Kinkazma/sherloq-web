import "../../runtime-context.js?v=0.30.0";
import {EngineError} from './errors.js';

export function stereoGpuOperation(owner){
 const record={device:null,buffers:new Set(),scopes:0,temporary:null,release:null,drained:false};
 owner.pending.add(record);return record;
}
export function attachStereoGpuCleanup(primary,cleanup){
 if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}
}
export async function retireStereoGpuOperation(owner,record){
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
 while(record.scopes){let accepted=false;await attempt(async()=>{try{const error=await record.device.popErrorScope();record.scopes--;accepted=true;if(error)throw new EngineError('UNSUPPORTED_BACKEND',error.message);}catch(error){if(owner.deviceDestroyed&&record.device.lost){await record.device.lost;record.scopes=0;accepted=true;return;}throw error;}});if(!accepted)break;}
 if((!record.device||record.drained)&&!record.buffers.size&&!record.scopes){
  if(record.temporary)await attempt(async()=>{await record.temporary.dispose();record.temporary=null;});
  if(!record.temporary){await attempt(async()=>{await record.release?.();record.release=null;});if(!record.release)owner.pending.delete(record);}
 }
 if(failed)throw primary;
}
export async function drainStereoGpuOperations(owner){
 let failed=false,primary;
 for(const record of [...owner.pending])try{await retireStereoGpuOperation(owner,record);}catch(error){if(!failed){failed=true;primary=error;}}
 if(failed)throw primary;
}
