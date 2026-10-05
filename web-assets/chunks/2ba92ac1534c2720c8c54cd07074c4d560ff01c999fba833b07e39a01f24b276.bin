import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';
/** Full-resolution DnCNN over source windows; all 17 convolution halos and
 * global bias positions are preserved on both axes. The destination is an
 * owned, lossless float32 tensor store, not a tile-local detector result. */
export async function noiseprintPlusSurface(surface,target,{budget,pool,signal,onProgress,backend='auto'}={}){
 const {width,height}=surface.descriptor;requireValue(target.width===width&&target.height===height&&target.channels===1,'Noiseprint++ target shape differs from source.');
 const available=Math.max(0,budget.limit-budget.total()),perWorker=Math.max(32*1024**2,Math.min(128*1024**2,Math.floor(available/Math.max(1,pool.profile.maxWorkers)/3))),step=Math.max(32,Math.floor(Math.sqrt(perWorker/800))-34),jobs=[],executions=[];
 for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step)jobs.push({x,y,width:Math.min(step,width-x),height:Math.min(step,height-y)});
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let next=0,completed=0;
 async function compute(rect){
  checkAbort(controller.signal);const {x,y,width:w,height:h}=rect,x0=Math.max(0,x-17),y0=Math.max(0,y-17),x1=Math.min(width,x+w+17),y1=Math.min(height,y+h+17),tw=x1-x0,th=y1-y0,n=tw*th;let part,lease,output,coreLease;
  try{
   part=await surface.readWindow({x:x0,y:y0,width:tw,height:th},{signal:controller.signal});lease=budget.reserve(n*12);const rgb=new Float32Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)rgb[c*n+i]=part.pixels.data[i*3+c]/256;part.release();part=null;
   const scalar=n=>({data:Int32Array.of(n),dims:[],type:'int32'});
   output=await pool.run('noiseprint-plus',{rgb:{data:rgb,dims:[1,3,th,tw]},global_height:scalar(height),global_width:scalar(width),offset_y:scalar(y0),offset_x:scalar(x0)},{backend,signal:controller.signal,onProgress,workspaceBytes:16*1024**2+n*800,outputBytes:n*4});
   requireValue(output.result.noiseprint.data.length===n,'Noiseprint++ output shape differs.');coreLease=budget.reserve(w*h*4);const core=new Float32Array(w*h);for(let row=0;row<h;row++)core.set(output.result.noiseprint.data.subarray((y-y0+row)*tw+x-x0,(y-y0+row)*tw+x-x0+w),row*w);for(const v of core)requireValue(Number.isFinite(v),'Nonfinite Noiseprint++ residual.');await target.writeWindow(rect,core,{signal:controller.signal});executions.push({rect:[x,y,w,h],...output.metrics});completed+=w*h;onProgress?.({phase:'noiseprint-plus-windows',completed,total:width*height});
  }catch(e){
   if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code)||(w===1&&h===1))throw e;
   coreLease?.();coreLease=null;output?.release();output=null;lease?.();lease=null;part?.release();part=null;
   if(w>=h&&w>1){const cut=Math.floor(w/2);await compute({...rect,width:cut});await compute({...rect,x:x+cut,width:w-cut});}else{const cut=Math.floor(h/2);await compute({...rect,height:cut});await compute({...rect,y:y+cut,height:h-cut});}
  }finally{coreLease?.();output?.release();lease?.();part?.release();}
 }
 try{const outcomes=await Promise.allSettled(Array.from({length:Math.min(jobs.length,pool.profile.maxWorkers)},async()=>{while(next<jobs.length){try{await compute(jobs[next++]);}catch(e){controller.abort();throw e;}}}));const failure=outcomes.find(x=>x.status==='rejected');if(failure)throw failure.reason;checkAbort(signal);await target.flush();return {executions};}finally{signal?.removeEventListener('abort',abort);}
}
