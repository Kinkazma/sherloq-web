import "../../runtime-context.js?v=0.14.5";
import {checkAbort,requireValue} from './errors.js';
/** Independent output rows, full 17-pixel receptive-field halo and global bias order. */
export async function noiseprintPlusResidual(rgb,width,height,{budget,pool,signal,onProgress,backend='auto'}={}){
 const n=width*height,release=budget.reserve(n*4),data=new Float32Array(n),executions=[];
 const available=Math.max(0,budget.limit-budget.active-budget.retained-budget.cacheBytes);
 const perWorker=Math.max(32*1024**2,Math.min(128*1024**2,Math.floor(available/Math.max(1,pool.profile.maxWorkers)/3)));
 const rows=Math.max(1,Math.min(height,Math.floor(perWorker/(width*800))-34)),jobs=[];
 for(let y=0;y<height;y+=rows)jobs.push({y,h:Math.min(rows,height-y)});
 let next=0,done=0;const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const compute=async ({y,h})=>{
  checkAbort(controller.signal);const lo=Math.max(0,y-17),hi=Math.min(height,y+h+17),th=hi-lo,pixels=width*th;let lease,output;
  try{
   lease=budget.reserve(pixels*12);const input=new Float32Array(pixels*3);
   for(let c=0;c<3;c++)input.set(rgb.subarray(c*n+lo*width,c*n+hi*width),c*pixels);
   output=await pool.run('noiseprint-plus',{rgb:{data:input,dims:[1,3,th,width]},global_height:{data:Int32Array.of(height),dims:[],type:'int32'},offset_y:{data:Int32Array.of(lo),dims:[],type:'int32'}},{backend,signal:controller.signal,onProgress,workspaceBytes:16*1024**2+pixels*800,outputBytes:pixels*4});
   const values=output.result.noiseprint.data;requireValue(values.length===pixels,'Noiseprint++ output geometry mismatch.');
   data.set(values.subarray((y-lo)*width,(y+h-lo)*width),y*width);executions.push({top:y,rows:h,...output.metrics});done+=h;onProgress?.({phase:'noiseprint-plus-rows',completed:done,total:height,fraction:done/height});
  }catch(e){
   if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code)||h===1)throw e;
   output?.release();output=null;lease?.();lease=null;const cut=Math.floor(h/2);await compute({y,h:cut});await compute({y:y+cut,h:h-cut});
  }finally{output?.release();lease?.();}
 };
 try{
  const outcomes=await Promise.allSettled(Array.from({length:Math.min(jobs.length,pool.profile.maxWorkers)},async()=>{while(next<jobs.length){try{await compute(jobs[next++]);}catch(e){controller.abort();throw e;}}}));
  const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;
  checkAbort(signal);return {data,dims:[1,1,height,width],executions,release};
 }catch(e){release();throw e;}finally{signal?.removeEventListener('abort',abort);}
}
