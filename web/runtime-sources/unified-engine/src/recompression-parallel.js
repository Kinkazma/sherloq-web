import "../../runtime-context.js?v=0.31.0";
import {getExecutionScheduler} from './execution-scheduler.js';
import {checkAbort,requireValue} from './errors.js';
// Each lane owns one native codec worker. Siblings are useful requested jobs,
// never duplicated calibration. A failed lane cancels and drains every sibling.
export async function runRecompressionLanes(items,{budget,workers=1,cpuPerWorker=1,signal,run}={}){
 requireValue(Array.isArray(items)&&typeof run==='function'&&Number.isInteger(workers)&&workers>=1,'Useful selected-codec jobs required.');
 const scheduler=getExecutionScheduler(budget),count=Math.max(1,Math.min(items.length,workers,Math.floor(scheduler.capacity.cpu/cpuPerWorker)||1)),abort=new AbortController(),cancel=()=>abort.abort(signal?.reason);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();let at=0,primary,lease;const results=new Array(items.length);
 try{checkAbort(abort.signal);lease=await scheduler.acquire({cpu:Math.min(scheduler.capacity.cpu,count*cpuPerWorker),signal:abort.signal,resourceOwner:'selected-recompression',label:'requested-native-codec-qualities'});
  const lanes=Array.from({length:count},(_,lane)=>(async()=>{try{for(;;){checkAbort(abort.signal);const index=at++;if(index>=items.length)return;results[index]=await run(items[index],lane,index,abort.signal);}}catch(error){primary??=error;abort.abort();throw error;}})());
  await Promise.allSettled(lanes);if(primary)throw primary;checkAbort(abort.signal);return{results,workers:count};
 }finally{signal?.removeEventListener('abort',cancel);await lease?.release();}
}
