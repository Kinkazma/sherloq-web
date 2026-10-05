import {requireValue} from '../../src/errors.js';

// A downstream model worker may stay warm during an independent GPU backbone.
// Only acquire() protects it from budget reclamation; the backbone never leases
// this idle worker. The caller releases the lease after its last dependent RPC.
export function createSessionCache({budget,bytes,create}){
  requireValue(budget?.reserve&&budget?.registerReclaimer&&Number.isSafeInteger(bytes)&&bytes>0&&typeof create==='function','Reclaimable model session configuration');
  let worker,release,leased=false,disposed=false;
  const counts={creations:0,reuses:0,pressureEvictions:0};
  const drop=(pressure=false)=>{
    if(leased)return;
    const existed=!!worker;
    try{worker?.terminate();}finally{worker=undefined;release?.();release=undefined;if(existed&&pressure)counts.pressureEvictions++;}
  };
  const unregister=budget.registerReclaimer(()=>drop(true));
  return{
    acquire(){
      requireValue(!disposed&&!leased,'Model session already leased or disposed');leased=true;
      try{
        if(worker)counts.reuses++;
        else{release=budget.reserve(bytes);worker=create();requireValue(worker&&typeof worker.terminate==='function','Model worker required');counts.creations++;}
        return worker;
      }catch(error){leased=false;drop();throw error;}
    },
    unlock(){requireValue(leased,'Model session has no active lease');leased=false;},
    releaseIdle(){drop();},
    get residentBytes(){return release?bytes:0;},
    snapshot(){return{...counts,residentBytes:release?bytes:0};},
    dispose(){requireValue(!leased,'Model session still leased');if(disposed)return;disposed=true;drop();unregister();}
  };
}
export function sessionCacheStats(cache,before){
  const after=cache.snapshot(),result={enabled:true,residentBytesAfterInference:after.residentBytes};
  for(const key of ['creations','reuses','pressureEvictions'])result[key]=after[key]-before[key];
  return result;
}
