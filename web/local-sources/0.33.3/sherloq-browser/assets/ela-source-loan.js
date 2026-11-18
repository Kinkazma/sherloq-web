import {EngineError} from './unified-engine/src/errors.js';
// A transferred source remains owned until Core's dispose/close acknowledgement.
export function createElaSourceLoans(){
 const workers=new Map(),transferred=new WeakSet();
 return{
  has:worker=>workers.has(worker),
  descriptor(worker){return [...(workers.get(worker)??[])].reverse().find(loan=>transferred.has(loan)&&!loan.closed)?.descriptor;},
  async acquire(payload,parent,{isCurrent=()=>true}={}){
   if(!parent)return null;
   const current=()=>isCurrent()&&parent.isCurrent?.()!==false&&payload?.blob===parent.file&&payload?.id===parent.imageId&&/^[a-f0-9]{64}$/.test(parent.hash??'')&&[parent.source?.width,parent.source?.height].every(n=>Number.isSafeInteger(n)&&n>0);
   if(!current())throw new EngineError('CANCELLED','ELA Original changed before its source loan.');
   const client=await parent.getClient();
   if(typeof client.acquireElaSourceLoan!=='function')return null;
   if(!current())throw new EngineError('CANCELLED','ELA Original changed before its source loan admission.');
   const loan=await client.acquireElaSourceLoan({imageId:parent.imageId,sourceSha256:parent.hash,width:parent.source.width,height:parent.source.height});
   try{if(!current())throw new EngineError('CANCELLED','ELA Original changed during source loan admission.');const d=loan.descriptor;if(d?.sha256!==parent.hash||d.width!==parent.source.width||d.height!==parent.source.height||d.format!=='rgb8'||!loan.port)throw new EngineError('INVALID_INPUT','ELA source loan differs from its admitted Original.');return loan;}
   catch(error){try{await loan.dispose();}catch(cleanup){if(Object.isExtensible(error))error.cleanupError=cleanup;}throw error;}
  },
  track(worker,loan){let entries=workers.get(worker);if(!entries)workers.set(worker,entries=new Set());entries.add(loan);},
  transferred(loan){loan.markTransferred();transferred.add(loan);},
  async rollback(worker,loan){await loan.dispose();const entries=workers.get(worker);entries?.delete(loan);if(entries?.size===0)workers.delete(worker);},
  async retire(worker,{childRetired=false}={}){const entries=workers.get(worker);if(!entries)return;for(const loan of [...entries]){await loan.dispose(childRetired?{childRetired:true}:undefined);entries.delete(loan);}if(!entries.size)workers.delete(worker);}
 };
}
