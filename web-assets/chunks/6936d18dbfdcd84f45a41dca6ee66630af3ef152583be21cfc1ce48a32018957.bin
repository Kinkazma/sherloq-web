import {EngineError,checkAbort} from './errors.js';
import {removeTerminatedTemporarySession} from './opfs-storage.js';
// Independent global metrics share an admission budget; every worker retains
// complete image coordinates and owns only its own temporary session.
export async function runPagedComparisonJobs(jobs,images,{budget,profile={},signal,onProgress,consume,blockPixels=65536,original=false}={}){
 const maximum=Math.max(1,Math.floor(profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1)),running=new Set(),waiting=jobs.slice(),workers=new Set();let failure,peak=0;
 const {width,height}=images[0].surface.descriptor,staging=8*1024**2+blockPixels*12;
 const abort=()=>{for(const w of workers)w.postMessage({op:'abort'});};signal?.addEventListener('abort',abort,{once:true});
 const execute=async job=>{
  const bytes=job.plan.workspace+4*1024**2,release=budget.reserve(bytes),sessionId='job-'+crypto.randomUUID();let worker,completed=false,terminated=false,problem;
  try{
   worker=new Worker(new URL('./comparison-paged-worker.js',import.meta.url),{type:'module'});workers.add(worker);
   const result=await new Promise((resolve,reject)=>{
    worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message||'Paged comparison worker failed.'));
    worker.onmessage=async({data})=>{
     if(data.progress){onProgress?.({...data.progress,metric:job.name});return;}
     if(data.rpc!==undefined){
      try{
       checkAbort(signal);if(failure)throw failure;
       if(data.op==='read'){
        const part=await images[data.side].surface.readWindow(data.rect,{signal});
        try{const bytes=part.pixels.data;if(!terminated)worker.postMessage({op:'reply',id:data.rpc,result:bytes},[bytes.buffer]);}finally{part.release();}
       }else{await job.output.write(data.bytes,data.offset);if(!terminated)worker.postMessage({op:'reply',id:data.rpc});}
      }catch(e){if(!terminated)worker.postMessage({op:'reply',id:data.rpc,error:{code:e.code??'STORAGE_IO',message:e.message}});}return;
     }
     completed=data.cleaned===true;data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);
    };
    worker.postMessage({op:'run',mode:job.mode,view:!!job.output,width,height,bytes,sessionId,options:{original,...job.options}});
   });
   checkAbort(signal);await job.output?.flush();await consume(job,result);
  }catch(e){problem=e;throw e;}finally{terminated=true;if(worker){workers.delete(worker);worker.terminate();}try{if(!completed)await removeTerminatedTemporarySession(sessionId);}catch(e){if(!problem)throw e;}finally{release();}}
 };
 try{
  while(waiting.length||running.size){checkAbort(signal);if(failure)throw failure;
   let i;while(running.size<maximum&&(i=waiting.findIndex(j=>j.plan.workspace+4*1024**2+staging<=budget.limit-budget.retained-budget.active))>=0){const job=waiting.splice(i,1)[0];let task;task=execute(job).catch(e=>{failure??=e;abort();}).finally(()=>running.delete(task));running.add(task);peak=Math.max(peak,running.size);}
   if(!running.size&&waiting.length)throw new EngineError('MEMORY_LIMIT','A paged comparison workspace and staging do not fit.');
   if(running.size)await Promise.race(running);
  }
  if(failure)throw failure;return {workers:peak};
 }catch(e){failure??=e;abort();await Promise.allSettled(running);throw e;}finally{signal?.removeEventListener('abort',abort);}
}
