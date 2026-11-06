// SHERLOQ: keep the delivered CPU artifact for every CPU operator, rather than
// interpreting executionProviders:['wasm'] inside the different GPU artifact.
import {createGlueWorkerOwner} from './xfeat-glue-worker-owner.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
export function createDualGlueOwner(cpu,gpu,options){
 if(cpu!==gpu&&(cpu.env===gpu.env||cpu.Tensor===gpu.Tensor))throw Error('CPU/GPU ORT bundles unexpectedly share mutable runtime identity.');
 const stage=createGlueWorkerOwner(cpu,options),operator=cpu===gpu?stage:createGlueWorkerOwner(gpu,options),owners=[...new Set([stage,operator])];operator.ort.privateCpuOrt=stage.ort;
 return{ort:stage.ort,attentionOrt:operator.ort,
  async retire(){let failed=false,primary;const records=[];for(const owner of owners)try{const record=await owner.retire();records.push(record);if(record.failed){if(!failed){failed=true;primary=record.error;}else attachGpuCleanup(primary,record.error);}}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);records.push({ack:false,state:owner.state});}
   const sum=key=>records.reduce((n,r)=>n+(r.state[key]??0),0);return{ack:records.every(r=>r.ack),failed,error:primary,state:{runtimes:owners.length,tensors:sum('tensors'),sessions:sum('sessions'),devices:sum('devices'),retiredDevices:sum('retiredDevices'),unacknowledgedDevices:sum('unacknowledgedDevices'),moduleIdentitySeparated:cpu===gpu?null:true}};
  }
 };
}
