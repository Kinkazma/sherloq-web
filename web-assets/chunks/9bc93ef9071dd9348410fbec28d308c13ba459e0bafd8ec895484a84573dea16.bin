import "../../runtime-context.js?v=0.14.5";
import {createDenseDistanceGPU} from './dense-distance-gpu.js';
import {checkAbort} from './errors.js';
import {Budget} from './cache.js';
import {getExecutionScheduler} from './execution-scheduler.js';

const services=new WeakMap();
// GPUDevice cannot be transferred to another worker. Keep one executor at
// the common field owner; only the bounded useful operand batches cross it.
// Error scopes and the reusable arena have one serialized owner.
export function borrowDenseGpuService(budget,{create=createDenseDistanceGPU,reservationBytes=create===createDenseDistanceGPU?25*1024**2:0}={}){
 let service=services.get(budget);
 if(!service){const release=budget.reserve(reservationBytes);service={users:0,pending:0,gpu:null,tail:Promise.resolve(),created:0,batches:0,release,localBudget:new Budget(Math.max(1,reservationBytes)),backing:null};services.set(budget,service);}
 service.users++;let released=false;
 const clear=()=>{service.gpu?.dispose();service.gpu=null;const bytes=service.backing?.bytes??0;service.backing?.();service.backing=null;if(bytes)budget.notifyBackingRelease?.('gpu',bytes);};
 const idle=()=>{if(!service.users&&!service.pending){clear();service.release();services.delete(budget);}};
 return {
  batch(job){
   if(released)throw new Error('Dense GPU borrower closed.');service.pending++;
   const result=service.tail.then(async()=>{checkAbort(job.signal);try{if(!service.gpu){service.gpu=await create({budget:service.localBudget,scheduler:getExecutionScheduler(budget)});service.created++;}const result=await service.gpu.batch(job);service.batches++;const bytes=service.gpu.metrics.residentBufferBytes??0;if(service.backing)service.backing.resize(bytes);else if(bytes)service.backing=budget.registerBacking?.('gpu',bytes,{owner:'patchmatch',label:'shared-dense-gpu-arena'});return {result,metrics:{...service.gpu.metrics,sharedExecutorsCreated:service.created,sharedBatches:service.batches,sharedUsers:service.users}};}catch(error){clear();throw error;}});
   service.tail=result.then(()=>{},()=>{});return result.finally(()=>{service.pending--;idle();});
  },
  release(){if(released)return;released=true;service.users--;idle();}
 };
}
