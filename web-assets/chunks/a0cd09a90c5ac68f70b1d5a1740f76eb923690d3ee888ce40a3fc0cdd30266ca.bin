import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort} from './errors.js';
import {createObservedNlmGpu} from './observed-nlm-gpu.js';
import {mayFallbackObservedNlmGpu,drainObservedNlmGpuRetirements,attachObservedNlmCleanup,keepObservedNlmGpuRetirement,forgetObservedNlmGpuRetirement} from './observed-nlm-gpu-retirement.js';
export const usefulNlmShape=(image,start,rows,points=false)=>({key:(points?[1,image.width,image.height,start,rows]:[0,Math.floor(Math.log2(image.width)/2),Math.ceil(Math.log2(rows))]).join('/'),work:points?image.width/27:image.width*rows,nativeWork:points?image.width/27:image.width*image.height});
// Performance families bound width by4 and returned rows by2. Native input
// support and GPU output-centre quantities remain separate. No RGB is inspected.
// The generator is geometry only. It neither reads RGB nor materializes all
// cores. Only bounded shape/cost metadata survives this preparation.
export function planUsefulNlm(cores,describe,maximumKeys=24){
 const entries=new Map();let totalWork=0,totalNativeWork=0,untrackedWork=0;
 for(const core of cores){const shape=describe(core),{key,work}=shape,nativeWork=shape.nativeWork??work;if(!Number.isSafeInteger(work)||work<1||!Number.isSafeInteger(nativeWork)||nativeWork<1)throw new Error('Invalid native NLM page work');totalWork+=work;totalNativeWork+=nativeWork;let e=entries.get(key);if(!e){if(entries.size>=maximumKeys){untrackedWork+=work;continue;}entries.set(key,e={key,totalWork:0,totalNativeWork:0,totalPages:0});}e.totalWork+=work;e.totalNativeWork+=nativeWork;e.totalPages++;}
 return{entries:[...entries.values()],totalWork,totalNativeWork,untrackedWork,maximumKeys};
}
export async function openUsefulNlmSession({budget,signal,backend}={}){
 if(!['cpu','webgpu'].includes(backend))throw new EngineError('BACKEND_NOT_ADMITTED','This acknowledged NLM path currently qualifies explicit CPU/GPU only; central Auto routing remains separate.');
 let child,lastChild,closing,retired=false,closed=false,busy=false,pending;
 const life=new AbortController(),combined=signal?AbortSignal.any([signal,life.signal]):life.signal;
 let cpuPages=0,gpuPages=0,cpuWork=0,gpuWork=0;
 const snapshot=()=>({...(child?{backend:child.stats.calls?'webgpu-native-nlm-acknowledged':'cpu',gpu:child.stats}:lastChild??{backend:'cpu'}),nlmExecution:{requestedBackend:backend,cpuPages,gpuPages,cpuWork,gpuWork,adaptiveAutoImplemented:false,calibrationExecutions:0,observedWorkDuplicated:0}});
 let owner;const cleanup=()=>owner.dispose();
 owner={
  get available(){return!closed;},
  async compute(image,p,start,rows,hooks={},native){
   if(closed)throw new EngineError('DISPOSED','NLM useful session is closed');if(busy)throw new EngineError('BUSY','NLM useful page already running');
   const selected=hooks.signal?AbortSignal.any([combined,hooks.signal]):combined;checkAbort(selected);if(typeof native!=='function')throw new EngineError('INVALID_ARGUMENT','A requested native NLM page is required');
   const{work}=usefulNlmShape(image,start,rows,hooks.points),chosen=backend;let result,complete=false,failed=false,primary;busy=true;let finish;pending=new Promise(r=>finish=r);
   try{
    await drainObservedNlmGpuRetirements(budget);checkAbort(selected);if(closed)throw new EngineError('DISPOSED','NLM session closed during previous retirement');
    if(chosen==='webgpu'){
     if(!child)child=await createObservedNlmGpu({budget,signal:selected});result=await child.run(image,p,start,rows,{...hooks,signal:selected});
    }
    if(!result)result={bytes:await native(),release(){}};
    checkAbort(selected);complete=true;let acknowledged=false,returning;return{...result,release(){if(acknowledged)return returning;if(returning)return returning;const task=(async()=>{await result.release?.();if(chosen==='webgpu'){gpuPages++;gpuWork+=work;}else{cpuPages++;cpuWork+=work;}acknowledged=true;})();returning=task;void task.finally(()=>{if(!acknowledged&&returning===task)returning=null;}).catch(()=>{});return task;}};
   }catch(error){failed=true;primary=error;throw error;}finally{try{if(!complete)try{await result?.release();}catch(cleanupError){if(failed)attachObservedNlmCleanup(primary,cleanupError);else throw cleanupError;}}finally{busy=false;finish();}}
  },
  async computeAtlases(shapes,p,hooks={}){
   if(closed)throw new EngineError('DISPOSED','NLM useful session is closed');if(busy)throw new EngineError('BUSY','NLM useful page already running');
   const selected=hooks.signal?AbortSignal.any([combined,hooks.signal]):combined;checkAbort(selected);if(backend!=='webgpu')return null;
   let result,complete=false,failed=false,primary;busy=true;let finish;pending=new Promise(r=>finish=r);
   try{
    await drainObservedNlmGpuRetirements(budget);checkAbort(selected);if(closed)throw new EngineError('DISPOSED','NLM session closed during previous retirement');
    if(!child)child=await createObservedNlmGpu({budget,signal:selected});result=await child.runAtlases(shapes,p,{...hooks,signal:selected});
    if(!result)return null;checkAbort(selected);complete=true;let acknowledged=false,returning;
    return{...result,release(){if(acknowledged)return returning;if(returning)return returning;const task=(async()=>{await result.release();gpuPages+=result.atlasEntries.length;gpuWork+=result.atlasEntries.reduce((sum,e)=>sum+e.points,0);acknowledged=true;})();returning=task;void task.finally(()=>{if(!acknowledged&&returning===task)returning=null;}).catch(()=>{});return task;}};
   }catch(error){failed=true;primary=error;throw error;}
   finally{try{if(!complete)try{await result?.release();}catch(cleanupError){if(failed)attachObservedNlmCleanup(primary,cleanupError);else throw cleanupError;}}finally{busy=false;finish();}}
  },
  snapshot,
  dispose(){
   if(retired)return closing??Promise.resolve();if(closing)return closing;closed=true;life.abort();
   const task=(async()=>{await pending;await child?.dispose();if(child){lastChild={backend:child.stats.calls?'webgpu-native-nlm-acknowledged':'cpu',gpu:child.stats};child=null;}retired=true;forgetObservedNlmGpuRetirement(budget,cleanup);})();closing=task;void task.catch(()=>keepObservedNlmGpuRetirement(budget,cleanup)).catch(()=>{});void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;
  }
 };return owner;
}
