import {EngineError,requireValue,checkAbort} from './errors.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {createNlmAtlasReadEnvelope} from './nlm-atlas-read-envelope.js';
import {sourceRegionLocalSupport} from './source-region-local-support.js';
// Existing source/Native consumers stop at their GPU call. Preparation remains
// sequential; only independent source loans wait together for one physical map.
export async function executeSeparationColorGroup(cores,p,{gpu,view,domain,budget,signal,ioWorkspaceBytes=0,compute,commit,single}={}){
 requireValue(Array.isArray(cores)&&cores.length>0&&cores.length<=32,'Bounded colour consumers required');
 if(cores.length<2||p.mode!==0||typeof gpu?.runWindows!=='function'){for(const core of cores)await single(core);return;}
 const supports=cores.map(core=>sourceRegionLocalSupport(domain,core,p.radius)),shapes=supports.map((s,i)=>({width:s.width,height:s.height,start:cores[i].y-s.y,rows:cores[i].height,membership:!!cores[i].observedBoundary}));
 const sourceBytes=supports.reduce((n,s,i)=>n+s.width*s.height*(cores[i].observedBoundary?4:3),0)+Math.max(...supports.map(s=>s.width*s.height*3))+ioWorkspaceBytes;
 const hostBytes=cores.reduce((n,c)=>n+c.width*c.height*3,0)+cores.length*1024;
 // Optional transport must not evict Native/source caches to obtain its credit.
 if(sourceBytes+hostBytes>budget.limit-budget.total()){for(const core of cores)await single(core);return;}
 const pool=new WaveletStripPool(budget,{resourceOwner:'separation',workerFactory:null}),life=new AbortController(),selected=AbortSignal.any([life.signal,...(signal?[signal]:[])]),loans=new Set(),tasks=[],queued=[],values=[];
 let envelope,hostFree,failed=false,primary,hasTaskFailure=false,taskFailure,declined=false;
 const note=error=>{if(!hasTaskFailure){hasTaskFailure=true;taskFailure=error;}};
 const stop=()=>{life.abort();for(const q of queued)q.reject(selected.reason??new EngineError('CANCELLED','Colour group retired'));};
 const owner=pool.ownCleanup(async()=>{
  stop();const all=await Promise.allSettled(tasks);for(const item of all)if(item.status==='rejected')note(item.reason);
  let cleanupFailed=false,cleanupPrimary;const attempt=async f=>{try{const r=await f();if(r===0||r===false)throw new EngineError('BUSY','Colour source retirement awaits ACK');}catch(e){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=e;}else appendWaveletCleanup(cleanupPrimary,e);}};
  for(const loan of [...loans])await attempt(async()=>{const answer=await loan.release();if(answer===0||answer===false)throw new EngineError('BUSY','Colour source loan retirement awaits ACK');loans.delete(loan);});
  if(!loans.size&&envelope)await attempt(async()=>{await envelope.release();envelope=null;});
  if(!loans.size&&hostFree)await attempt(async()=>{await hostFree();hostFree=null;});
  if(cleanupFailed)throw cleanupPrimary;
 });
 try{
  envelope=createNlmAtlasReadEnvelope({reserve(bytes){if(bytes>budget.limit-budget.total())throw new EngineError('MEMORY_LIMIT','Colour source headroom unavailable');return budget.reserve(bytes);}},sourceBytes);hostFree=budget.reserve(hostBytes);
  const reserve=envelope.reserve,adoptSource=loan=>{requireValue(loan&&typeof loan.release==='function','An owned colour source loan is required');loans.add(loan);};
  const read=method=>async(rect,hooks={})=>{const loan=await view[method](rect,{...hooks,signal:selected,reserve,adoptSource});adoptSource(loan);return loan;};
  const sourceView={...view,readWindow:read('readWindow'),readMaskedWindow:read('readMaskedWindow')};
  const result=await gpu.runWindows(shapes,p,{signal:selected,async prepare(){
   const jobs=[];
   for(let index=0;index<cores.length;index++){
    checkAbort(selected);let ready;const reached=new Promise(resolve=>ready=resolve);let captured=false;
    const adapter={available:true,run(image,params,start,rows,hooks={}){requireValue(!captured&&params.mode===p.mode&&params.radius===p.radius&&params.grayscale===p.grayscale,'One unchanged colour kernel per core required');captured=true;jobs.push({image,start,rows,hooks:{...hooks,signal:selected}});return new Promise((resolve,reject)=>{queued.push({resolve,reject});ready();});}};
    const task=Promise.resolve().then(()=>compute(cores[index],adapter,sourceView,selected)).then(value=>{values[index]=value;return value;},error=>{note(error);throw error;});tasks.push(task);void task.catch(()=>{});
    await Promise.race([reached,task]);if(hasTaskFailure)throw taskFailure;requireValue(captured,'Colour consumer did not reach its admitted kernel');
   }
   return jobs;
  }});
  if(!result){declined=true;requireValue(tasks.length===0,'Colour admission must decline before source IO');}
  else{
   requireValue(result.entries?.length===queued.length,'Colour output order differs from queued windows');for(let i=0;i<queued.length;i++)queued[i].resolve(result.entries[i]);
   await Promise.allSettled(tasks);if(hasTaskFailure)throw taskFailure;
   for(let i=0;i<cores.length;i++){checkAbort(selected);await commit(cores[i],values[i]);}
  }
 }catch(error){failed=true;primary=error;stop();await Promise.allSettled(tasks);throw error;}
 finally{try{await owner.retire();}catch(error){if(failed)appendWaveletCleanup(primary,error);else throw error;}}
 if(declined)for(const core of cores)await single(core);
}
