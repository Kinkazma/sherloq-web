import "../../runtime-context.js?v=0.33.1";
import {requireValue,checkAbort} from './errors.js';
export function miniNppRuntimeCapacityPlan({width,height,manifest,windowBytes,workspaceBytes,maximumInputElements,windowWorkers,jobCount,budget,gpuRoute}){
 const MiB=1024**2,quantum=16*MiB,round=n=>Math.ceil(n/quantum)*quantum;
 if(!gpuRoute||budget.recovering||budget.limit<3*1024**3||windowWorkers!==4||jobCount<4||!Number.isSafeInteger(windowBytes)||windowBytes<=0||manifest?.method!=='trufor-mini')return null;
 const npp=manifest.assets?.[manifest.noiseprint];
 const valid=a=>a&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&!a.graphTransform;
 if(!valid(npp)||!Array.isArray(manifest.stages))return null;
 const baselineMaximumBytes=round(64*MiB+2*npp.bytes+workspaceBytes),jobs=[];
 let h=height,w=width;
 for(const stage of manifest.stages){
  const {channels:c,stride,fusionHeads:heads}=stage;
  if(![h,w,c,stride,heads].every(n=>Number.isSafeInteger(n)&&n>0)||c%heads)return null;
  h=Math.ceil(h/stride);w=Math.ceil(w/stride);
  const rows=Math.max(1,Math.min(h,Math.floor(windowBytes/(w*c*4*8))));
  for(const stream of stage.streams??[])for(const block of stream.blocks??[]){
   const asset=manifest.assets[block.kv],sr=block.sr;
   if(!valid(asset)||!Number.isSafeInteger(sr)||sr<1)return null;
   const kh=Math.floor(h/sr),kw=Math.floor(w/sr),step=Math.max(1,Math.floor(rows/sr));
   const shared=block.approximation&&block.approximation!=='exact'&&Boolean(block.querySource);
   if(kh<1||kw<1)return null;
   let maximum=0;
   for(let y=0;y<kh;y+=step){
    const count=Math.min(step,kh-y),inputRows=count*sr+(shared&&y+count===kh?h-kh*sr:0);
    const queryBytes=shared?c*(block.approximation==='global'?1:Math.ceil(inputRows/2)*Math.ceil(w/2))*4:0;
    maximum=Math.max(maximum,c*inputRows*w*4*10+queryBytes+16*MiB);
   }
   jobs.push({name:block.kv,workspaceBytes:maximum,modelBytes:asset.bytes,maximumBytes:round(64*MiB+2*asset.bytes+maximum)});
  }
  const n=heads*(c/heads)**2,contextWorkspace=c*rows*w*4*16+n*8+16*MiB;
  for(const branch of stage.fusion??[]){
   const asset=manifest.assets[branch.context];if(!valid(asset))return null;
   jobs.push({name:branch.context,workspaceBytes:contextWorkspace,modelBytes:asset.bytes,maximumBytes:round(64*MiB+2*asset.bytes+contextWorkspace)});
  }
 }
 if(!jobs.length)return null;
 const maximumBytes=Math.max(...jobs.map(j=>j.maximumBytes));
 // A reservation is useful only when it avoids an already planned increase.
 // Larger or unknown dimensions keep their unchanged ordinary recovery path.
 if(maximumBytes<=baselineMaximumBytes||maximumBytes>352*MiB||maximumBytes>(npp.wasmMaximumBytes??4*1024**3))return null;
 const extraPerWorker=maximumBytes-baselineMaximumBytes;
 // Existing pool resident terms + real caller RGB, pool input/output clones,
 // and core-copy allowance. Both new reservations are financed up front.
 const resident=baselineMaximumBytes+3*npp.bytes+workspaceBytes+4*MiB;
 const peakNppBytes=windowWorkers*(resident+maximumInputElements*36)+2*extraPerWorker;
 if(budget.limit-budget.total()<peakNppBytes+64*MiB)return null;
 return {lanes:2,maximumBytes,baselineMaximumBytes,extraPerWorker,peakNppBytes,gpuWasmWorkspaceBytes:maximumBytes-64*MiB-2*npp.bytes,limitingJobs:jobs.filter(j=>j.maximumBytes===maximumBytes),plannedJobs:jobs};
}

/** Frozen Mini folded/pruned DnCNN over source windows; all 17 convolution halos and
 * global bias positions are preserved on both axes. The destination is an
 * owned, lossless float32 tensor store, not a tile-local detector result. */
export async function truforMiniNoiseprint(surface,target,{budget,pool,signal,onProgress,backend='auto',manifest,windowBytes}={}){
 const {width,height}=surface.descriptor;requireValue(target.width===width&&target.height===height&&target.channels===1,'Noiseprint++ target shape differs from source.');
 // NPP windows are independent convolutions. Avoid oversubscribing the GPU
 // with more than four simultaneous window runtimes while leaving the shared
 // pool, broker, total budget and explicit CPU thread policy unchanged.
 const gpuRoute=backend==='webgpu'||backend==='auto'&&!pool.cpuOnly&&Boolean(globalThis.navigator?.gpu),windowWorkers=gpuRoute?Math.min(4,pool.profile.maxWorkers):pool.profile.maxWorkers;
 const available=Math.max(0,budget.limit-budget.total()),perWorker=Math.max(32*1024**2,Math.min(128*1024**2,Math.floor(available/Math.max(1,windowWorkers)/3))),step=Math.max(32,Math.floor(Math.sqrt(perWorker/800))-34),jobs=[],executions=[];
 let maximumInputElements=0;
 for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
  const rect={x,y,width:Math.min(step,width-x),height:Math.min(step,height-y)};jobs.push(rect);
  const inputWidth=Math.min(width,x+rect.width+17)-Math.max(0,x-17),inputHeight=Math.min(height,y+rect.height+17)-Math.max(0,y-17);
  maximumInputElements=Math.max(maximumInputElements,inputWidth*inputHeight);
 }
 // Edge windows contain fewer halo pixels than interior windows. Reserve the
 // largest REAL window from the start so idle runtimes can serve both without
 // recreating their WASM memory/device. This is the same peak job workspace
 // already required by this plan; worker count and scientific windows stay fixed.
 const workspaceBytes=16*1024**2+maximumInputElements*800;
 const capacityPlan=miniNppRuntimeCapacityPlan({width,height,manifest,windowBytes,workspaceBytes,maximumInputElements,windowWorkers,jobCount:jobs.length,budget,gpuRoute});
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let next=0,completed=0;
 async function compute(rect,recovering=false,prefinance=false){
  checkAbort(controller.signal);const {x,y,width:w,height:h}=rect,x0=Math.max(0,x-17),y0=Math.max(0,y-17),x1=Math.min(width,x+w+17),y1=Math.min(height,y+h+17),tw=x1-x0,th=y1-y0,n=tw*th;let part,lease,output,coreLease,prefinancedHost=false;
  try{
   part=await surface.readWindow({x:x0,y:y0,width:tw,height:th},{signal:controller.signal});lease=budget.reserve(n*12);const rgb=new Float32Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)rgb[c*n+i]=part.pixels.data[i*3+c]/256;await part.release();part=null;
   prefinancedHost=Boolean(prefinance&&!recovering&&!budget.recovering&&!pool.cpuOnly&&capacityPlan);
   output=await pool.run('noiseprint-plus',{rgb:{data:rgb,dims:[1,3,th,tw]}},{backend,signal:controller.signal,onProgress,workspaceBytes:recovering?16*1024**2+n*800:workspaceBytes,outputBytes:n*4,...(prefinancedHost?{gpuWasmWorkspaceBytes:capacityPlan.gpuWasmWorkspaceBytes}:{})});
   requireValue(output.result.noiseprint.data.length===n,'Noiseprint++ output shape differs.');coreLease=budget.reserve(w*h*4);const core=new Float32Array(w*h);for(let row=0;row<h;row++)core.set(output.result.noiseprint.data.subarray((y-y0+row)*tw+x-x0,(y-y0+row)*tw+x-x0+w),row*w);for(const v of core)requireValue(Number.isFinite(v),'Nonfinite Noiseprint++ residual.');await target.writeWindow(rect,core,{signal:controller.signal});executions.push({rect:[x,y,w,h],...output.metrics});completed+=w*h;onProgress?.({phase:'noiseprint-plus-windows',completed,total:width*height});
  }catch(e){
   if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code)||(w===1&&h===1))throw e;
   coreLease?.();coreLease=null;output?.release();output=null;lease?.();lease=null;await part?.release();part=null;
   // Optional future capacity never forces a smaller scientific window.
   // First retry this SAME real job without its optional reservation.
   if(prefinancedHost){await compute(rect,true,false);return;}
   // A refused peak reservation must still shrink with the actual retry
   // window. Keep the existing small-memory recovery instead of retrying
   // every subdivision with the same rejected large workspace.
   if(w>=h&&w>1){const cut=Math.floor(w/2);await compute({...rect,width:cut},true);await compute({...rect,x:x+cut,width:w-cut},true);}else{const cut=Math.floor(h/2);await compute({...rect,height:cut},true);await compute({...rect,y:y+cut,height:h-cut},true);}
  }finally{coreLease?.();output?.release();lease?.();await part?.release();}
 }
 try{const outcomes=await Promise.allSettled(Array.from({length:Math.min(jobs.length,windowWorkers)},async(_,lane)=>{let first=true;while(next<jobs.length){const prefinance=first&&lane<(capacityPlan?.lanes??0);first=false;try{await compute(jobs[next++],false,prefinance);}catch(e){controller.abort();throw e;}}}));const failure=outcomes.find(x=>x.status==='rejected');if(failure)throw failure.reason;checkAbort(signal);await target.flush();return {executions};}finally{signal?.removeEventListener('abort',abort);}
}
