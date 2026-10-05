import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createResamplingEmMath} from './resampling-em-math.js';
// One complete global fit; only the transfer neighborhoods and matrix rows are
// regenerated. No full F or inverse-times-F allocation and no independent tile fit.
export const resamplingEmBytes=width=>16*1024**2+Math.max(8192,width*5)*48;
export async function resamplingEmStage(gray,rect,size,plane,{budget,signal,onProgress,region=0}={}){
 const [x0,y0,x1,y1]=rect,w=x1-x0,h=y1-y0,cols=w-size+1,n=cols*(h-size+1),release=budget.reserve(resamplingEmBytes(w));let worker,local,pending,closed=false;
 const abort=()=>{closed=true;worker?.terminate();pending?.(new EngineError('CANCELLED','EM stopped.'));pending=null;};signal?.addEventListener('abort',abort,{once:true});
 try{
  if(globalThis.Worker)worker=new Worker(new URL('./resampling-em-worker.js',import.meta.url),{type:'module'});else local=await createResamplingEmMath();
  const call=async j=>{checkAbort(signal);if(closed)throw new EngineError('CANCELLED','EM stopped.');if(local){await controlCheckpoint(signal);if(j.op==='create')return local.create(j.width,j.height,j.size);if(j.op==='batch')return {weights:local.batch(j.gray,j.first,j.count,j.top,j.weights)};return local.finish();}return new Promise((resolve,reject)=>{pending=reject;worker.onmessage=({data})=>{pending=null;data.error?reject(deserializeEngineError(data.error)):resolve(data.result);};worker.onerror=e=>{pending=null;reject(new EngineError('WORKER_FAILED',e.message||'EM worker failed.'));};worker.postMessage(j,[j.gray?.buffer,j.weights?.buffer].filter(Boolean));});};
  await call({op:'create',width:w,height:h,size});let state,minimum=Infinity,maximum=-Infinity,jobs=0;
  for(let iteration=0;iteration<100;iteration++){
   for(let phase=0;phase<2;phase++){
    for(let first=0;first<n;first+=8192){await controlCheckpoint(signal);const count=Math.min(8192,n-first),top=Math.floor(first/cols),bottom=Math.floor((first+count-1)/cols)+size,values=await gray.read(x0,y0+top,w,bottom-top,{signal});if(iteration===0&&phase===0){for(const v of values){requireValue(Number.isFinite(v),'Non-finite EM source.');minimum=Math.min(minimum,v);maximum=Math.max(maximum,v);}}
     let weights;if(phase){weights=new Float64Array(count);await plane.store.readInto(new Uint8Array(weights.buffer),first*8);}
     const result=await call({op:'batch',gray:values,first,count,top,weights});jobs++;if(!phase)await plane.store.write(new Uint8Array(result.weights.buffer),first*8);
     onProgress?.({phase:phase?'em-coefficients':'em-weights',region,iteration:iteration+1,completed:first+count,total:n});
    }
    if(iteration===0&&phase===0&&minimum===maximum)throw new EngineError('NUMERIC_RANGE','The selected region has no usable intensity variation.');
    state=await call({op:'finish'});
   }
   onProgress?.({phase:'em-iteration',region,completed:state.iterations,total:100});if(state.status!==1)break;
  }
  checkAbort(signal);await plane.store.flush();return {iterations:state.iterations,converged:state.status===2,heapBytes:state.heapBytes,completedStripJobs:jobs,preflightExecutions:0};
 }finally{signal?.removeEventListener('abort',abort);worker?.terminate();local?.dispose();release();}
}
