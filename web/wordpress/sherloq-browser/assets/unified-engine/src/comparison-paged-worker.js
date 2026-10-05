import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {Budget} from './cache.js';
import {EngineError} from './errors.js';
import {createTemporarySession} from './opfs-storage.js';
import {comparisonPagedHistograms} from './comparison-paged-histograms.js';
import {comparisonPagedSewar} from './comparison-paged-sewar.js';
import {comparisonPagedSsimulacra} from './comparison-paged-ssimulacra.js';
import {comparisonPagedButteraugli} from './comparison-paged-butteraugli.js';
let next=0,controller;const pending=new Map();
function rpc(op,args,transfer=[]){return new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});self.postMessage({rpc:id,op,...args},transfer);});}
self.onmessage=async({data})=>{
 if(data.op==='reply'){const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(deserializeEngineError(data.error)):p.resolve(data.result);return;}
 if(data.op==='abort'){controller?.abort();return;}
 if(data.op!=='run')return;
 controller=new AbortController();let session,result,error,cleaned=false;
 const budget=new Budget(data.bytes),signal=controller.signal;
 try{
  session=await createTemporarySession({id:data.sessionId,signal});
  const images=[0,1].map(side=>({session,surface:{descriptor:{width:data.width,height:data.height},async readWindow(rect){const pixels=await rpc('read',{side,rect}),release=budget.reserve(pixels.byteLength);return {pixels:{data:pixels},release};}}}));
  const output=data.view?{async write(bytes,offset){const copy=bytes.slice();await rpc('write',{bytes:copy,offset},[copy.buffer]);},async flush(){}}:null;
  let last=0;const options={...data.options,budget,signal,onProgress:p=>{if(performance.now()-last>=100){last=performance.now();self.postMessage({progress:p});}}};
  result=data.mode===2?await comparisonPagedHistograms(images,options):data.mode===3?await comparisonPagedSewar(images,options):data.mode===5?await comparisonPagedSsimulacra(images,options):await comparisonPagedButteraugli(images,output,options);
  if(budget.total())throw new EngineError('MEMORY_LIMIT','Paged comparison worker retained a reservation.');
 }catch(e){error=serializeEngineError(e,'WORKER_FAILED');}
 finally{try{await session?.dispose();cleaned=true;}catch(e){error??=serializeEngineError(e,'STORAGE_IO');}}
 self.postMessage(error?{error,cleaned}:{result,cleaned});
};
