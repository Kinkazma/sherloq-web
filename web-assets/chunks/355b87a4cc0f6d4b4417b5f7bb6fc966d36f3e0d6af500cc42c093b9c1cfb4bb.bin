import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {denseDescriptorHeapBound,denseDescriptorShape,denseResidentHeapBound} from './dense-math.js';

export function denseJobMemory(job) {
  const {width,height,pass,gray,mask}=job;
  if(job.field){
    const n=width*height;
    requireValue(Number.isSafeInteger(n)&&n>0&&job.field.targets instanceof Int32Array&&job.field.targets.length===n&&job.field.distancesSquared instanceof Float32Array&&job.field.distancesSquared.length===n&&job.field.allowed instanceof Uint8Array&&job.field.allowed.length===n,'Invalid cached dense field.');
    return {width,height,workspace:48*1024**2+n*80,output:n*(job.coherence?14:10)};
  }

  requireValue(pass&&[0,1].includes(pass.method)&&typeof pass.reflection==='boolean'&&typeof pass.quarterTurn==='boolean','Invalid dense pass.');
  requireValue(pass.method===1||(!pass.quarterTurn&&pass.targetPatch===pass.patch),'Zernike does not use SIFT frames or paired bins.');
  requireValue(Number.isInteger(pass.targetPatch)&&pass.targetPatch>=(pass.method?3:2)&&pass.targetPatch<=32&&(pass.patch-pass.targetPatch)%2===0,'Invalid dense target support.');
  const a=denseDescriptorShape(width,height,pass.method,pass.patch),b=denseDescriptorShape(width,height,pass.method,pass.targetPatch);
  const dw=Math.min(a.width,b.width),dh=Math.min(a.height,b.height),n=dw*dh;
  requireValue(job.sourceImage ? job.sourceImage.data instanceof Uint8Array&&job.sourceImage.data.length===job.sourceImage.width*job.sourceImage.height*3 : gray instanceof Float32Array&&gray.length===width*height&&mask instanceof Uint8Array&&mask.length===n,'Dense job dimensions mismatch.');
  if(job.compactDescriptors){
    const heap=pass.method===1?32*1024**2+width*height*180:denseResidentHeapBound(width,height,pass.patch,pass.reflection);
    if(heap>2**31)throw new EngineError('MEMORY_LIMIT','Compact SIFT exceeds the resident WASM allowance.');
    const preparation=job.sourceImage?32*1024**2+job.sourceImage.data.byteLength+width*height*40:0;
    return {workspace:preparation+heap+(gray?.byteLength??width*height*4)+(mask?.byteLength??n)+n*10+16*1024**2,output:n*(job.coherence?14:10),width:dw,height:dh};
  }
  const av=a.width*a.height*a.dimensions*4,bv=b.width*b.height*b.dimensions*4;
  const heap=Math.max(denseDescriptorHeapBound(width,height,pass.method,pass.patch,pass.reflection),denseDescriptorHeapBound(width,height,pass.method,pass.targetPatch,pass.reflection),32*1024**2+2*n*a.dimensions*4+n*64);
  // Source is borrowed from caller. Worker copies, raw features, alignment and
  // WASM high-water memory are charged in addition to caller-owned input bytes.
  const preparation=job.sourceImage?32*1024**2+job.sourceImage.data.byteLength+width*height*40:0;
  const workspace=preparation+heap+(gray?.byteLength??width*height*4)+(mask?.byteLength??n)+(av+bv)*(pass.reflection?2:1)+2*n*a.dimensions*4+n*4+16*1024**2;
  return {workspace,output:n*(job.coherence?14:10),width:dw,height:dh};
}

// Real useful jobs start immediately. The common engine Budget owns every
// reservation; there is no private per-pool memory budget or calibration job.
export class DenseFieldPool {
  constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-worker.js',import.meta.url),{type:'module'})}={}){
    requireValue(budget&&typeof budget.reserve==='function'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid dense pool budget/profile.');
    this.budget=budget;this.maxWorkers=maxWorkers;this.workerFactory=workerFactory;this.active=new Map();this.busy=false;this.adaptive=new AdaptiveConcurrency();
  }
  clear(){for(const [worker,reject] of this.active){worker.terminate();reject(new EngineError('CANCELLED','Dense worker stopped.'));}this.active.clear();}
  dispose(){this.clear();this.adaptive.clear();}
  async run(jobs,{signal,onProgress}={}){
    requireValue(!this.busy&&Array.isArray(jobs)&&jobs.length>0,'Dense pool is busy or has no jobs.');checkAbort(signal);
    jobs=jobs.map(j=>({...j}));const plans=jobs.map((job,i)=>{try{return denseJobMemory(job);}catch(e){if(e.code!=='MEMORY_LIMIT'||job.field||![0,1].includes(job.pass?.method))throw e;jobs[i]={...job,compactDescriptors:true};return denseJobMemory(jobs[i]);}}),outputs=plans.reduce((sum,p)=>sum+p.output,0);
    const room=this.budget.limit-this.budget.retained-this.budget.active-outputs;
    for(let i=0;i<jobs.length;i++)if(plans[i].workspace>room&&!jobs[i].field&&!jobs[i].compactDescriptors){jobs[i].compactDescriptors=true;plans[i]=denseJobMemory(jobs[i]);}
    const largest=plans.reduce((max,p)=>Math.max(max,p.workspace),0);
    const key=jobs.map(j=>[j.width,j.height,j.pass.method,j.pass.patch,j.pass.targetPatch,!!j.compactDescriptors].join(':')).join('/');
    const releaseOutput=this.budget.reserve(outputs);
    let releaseWorkers=null,delivered=false,count=1;this.busy=true;
    const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
    try{
      const plan=this.adaptive.select(key,Math.min(this.maxWorkers,jobs.length),this.budget,n=>n*largest);
      count=plan.count;const start=performance.now();
      releaseWorkers=this.budget.reserve(count*largest);checkAbort(signal);
      const results=new Array(jobs.length);let next=0,completed=0;
      const task=async()=>{
        while(next<jobs.length){
          checkAbort(signal);const index=next++,job=jobs[index],worker=this.workerFactory();
          try{
            const result=await new Promise((resolve,reject)=>{
              this.active.set(worker,reject);
              worker.onmessage=({data})=>{
                if(data.phase){try{onProgress?.({completed,total:jobs.length,index,phase:data.phase,context:job.context,pass:job.pass});}catch(error){reject(error);}return;}
                data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);
              };
              worker.onerror=event=>reject(new EngineError('WORKER_FAILED',event.message||'Dense worker failed.'));
              // Deliberately borrow/copy, never detach caller caches or source.
              worker.postMessage(job);
            });
            checkAbort(signal);
            requireValue(result&&result.targets instanceof Int32Array&&result.targets.length===plans[index].width*plans[index].height&&result.distancesSquared instanceof Float32Array&&result.distancesSquared.length===result.targets.length&&result.selected instanceof Uint8Array&&result.selected.length===result.targets.length&&(!job.coherence||result.errors instanceof Float32Array&&result.errors.length===result.targets.length),'Invalid dense worker result.');
            results[index]=result;completed++;onProgress?.({completed,total:jobs.length,index,phase:'complete',context:job.context,pass:job.pass});
          }finally{this.active.delete(worker);worker.terminate();}
        }
      };
      // Settle cancellation before releasing reservations on any sibling error.
      const tasks=Array.from({length:count},()=>task());
      try{await Promise.all(tasks);}catch(error){next=jobs.length;this.clear();await Promise.allSettled(tasks);throw error;}
      checkAbort(signal);this.adaptive.observe(key,{count,maximum:Math.min(this.maxWorkers,jobs.length),milliseconds:performance.now()-start,units:jobs.length});delivered=true;
      return {results,release:releaseOutput,metrics:{workers:count,completedJobs:completed,preflightExecutions:0,policy:'immediate-useful-work',scheduling:plan,outputBytes:outputs,workerReservationBytes:count*largest,compactDescriptorJobs:jobs.filter(j=>j.compactDescriptors&&!j.field&&j.pass.method===1).length,residentZernikeJobs:jobs.filter(j=>j.compactDescriptors&&!j.field&&j.pass.method===0).length}};
    }catch(error){if(isWorkerResourceFailure(error))this.adaptive.reduce(key,count);throw error;}finally{
      signal?.removeEventListener('abort',abort);this.clear();releaseWorkers?.();if(!delivered)releaseOutput();this.busy=false;
    }
  }
}
