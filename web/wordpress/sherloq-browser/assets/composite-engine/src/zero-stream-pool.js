import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
export function zeroStreamWorkerBytes(plan){return plan.workingBytes+plan.samples*2+1024**2;}
export async function parallelZeroBands(luminance,plan,count,{budget,signal,onBand}={}){
 const release=budget.reserve(count*zeroStreamWorkerBytes(plan)),states=[];let stopped=false,maximumHeap=0,active=[];
 const reject=(state,error)=>{state.pending?.reject(error);state.pending=null;};
 function stop(){if(stopped)return;stopped=true;for(const s of states){s.worker.onmessage=null;s.worker.terminate();reject(s,new EngineError('CANCELLED','ZERO band workers stopped.'));}}
 const rpc=(state,data,transfer=[])=>new Promise((resolve,reject)=>{state.pending={resolve,reject};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','ZERO band workers stopped.');state.worker.postMessage(data,transfer);}catch(error){state.pending=null;reject(error);}});
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);for(let i=0;i<count;i++){const state={worker:new Worker(new URL('./zero-stream-worker.js',import.meta.url),{type:'module'}),pending:null};states.push(state);state.worker.onmessage=({data})=>{const pending=state.pending;state.pending=null;if(!pending)return;if(data.error)pending.reject(new EngineError(data.error.code,data.error.message));else{maximumHeap=Math.max(maximumHeap,data.heapBytes);pending.resolve(data);}};state.worker.onerror=()=>reject(state,new EngineError('WORKER_FAILED','ZERO band worker failed.'));}
  active=states.map(s=>rpc(s,{action:'init',plan}));await Promise.all(active);
  for(let first=0;first<plan.height;first+=plan.rows*count){await controlCheckpoint(signal);
   active=states.filter((_,i)=>first+i*plan.rows<plan.height).map(async(state,i)=>{const y=first+i*plan.rows,end=Math.min(plan.height,y+plan.rows),lo=Math.max(0,y-7),hi=Math.min(plan.height,end+7),bytes=new Uint8Array((hi-lo)*plan.width);await luminance.readInto(bytes,lo*plan.width);checkAbort(signal);const result=await rpc(state,{action:'votes',bytes,rows:hi-lo,offset:(y-lo)*plan.width,length:(end-y)*plan.width},[bytes.buffer]);checkAbort(signal);await onBand(result.values,{y,end,lo,fallbacks:result.fallbacks});});await Promise.all(active);
  }
  return {heapCapacityBytes:maximumHeap,totalWorkerHeapMaximumBytes:count*plan.heapMaximumBytes};
 }finally{signal?.removeEventListener('abort',stop);stop();await Promise.allSettled(active);release();}
}
