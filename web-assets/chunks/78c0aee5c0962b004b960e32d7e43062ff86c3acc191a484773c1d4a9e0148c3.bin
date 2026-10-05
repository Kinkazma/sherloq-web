import "../../runtime-context.js?v=0.14.5";
import {wasmAllocationFailure} from './allocation.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
export async function runPagedDenseCoherence({width,height,targets,distancesSquared},{budget,storage='auto',temporarySession,getTemporarySession,threshold=.3,errorThreshold=3,radius=6,minimum=6,pageBytes=4096,cachePages,signal,onProgress}={}){
 const n=width*height;
 requireValue([width,height].every(Number.isSafeInteger)&&width>0&&height>0&&n<=0x7fffffff&&targets?.byteLength===n*4&&distancesSquared?.byteLength===n*4,'Invalid stored dense field.');
 requireValue(Number.isFinite(threshold)&&threshold>=0&&Number.isFinite(errorThreshold)&&errorThreshold>=0&&Number.isInteger(radius)&&radius>=1&&radius<=6&&Number.isInteger(minimum)&&minimum>=1&&minimum<=0x7fffffff,'Invalid stored coherence settings.');
 const base=16*1024**2+width*48;
 cachePages??=Math.max(1,Math.min(2048,Math.floor((budget.limit-budget.retained-budget.active-base)*.6/(7*pageBytes))));
 requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0&&Number.isSafeInteger(cachePages)&&cachePages>=1,'Invalid coherence page cache.');
 const lengths=[n*4,n*4,n,n*4,...(minimum>1?[n*4,n*4,n*4]:[])],cacheBytes=lengths.reduce((sum,l)=>sum+Math.min(cachePages,Math.ceil(l/pageBytes))*(pageBytes+32),0),workspace=base+cacheBytes;
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','The coherence frontier and caches exceed the module allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),owned=[];let m,errorPointer,success=false;
 const metrics={workspaceBytes:workspace,pageBytes,cachePages,cacheBytes,reads:0,writes:0,readBytes:0,writeBytes:0,heapBytes:0};
 const allocate=async bytes=>{const s=await createSegmentedBytes(bytes,{budget,storage,temporarySession,getTemporarySession,signal});owned.push(s);return s;};
 try{
  const selected=await allocate(n),errors=await allocate(n*4),scratch=[];if(minimum>1)for(let i=0;i<3;i++)scratch.push(await allocate(n*4));
  const stores=[targets,distancesSquared,selected,errors,...scratch],{default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let lastYield=performance.now();
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=20){onProgress?.({phase:'global-coherence',...metrics});await controlCheckpoint(signal);lastYield=performance.now();}};
  m.pageIO=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=wasmRange(m,pointer,length);if(write){await stores[id].write(bytes,offset);metrics.writes++;metrics.writeBytes+=length;}else{await stores[id].readInto(bytes,offset);metrics.reads++;metrics.readBytes+=length;}if(performance.now()-lastYield>=20)await m.checkpoint();};
  errorPointer=m._malloc(1024);if(!errorPointer)throw wasmAllocationFailure(m,'Coherence allocation failed.',1024);
  const values=[width,height,threshold*threshold,errorThreshold,radius,minimum,pageBytes,cachePages,errorPointer],code=await m.ccall('dense_paged_coherence','number',values.map(()=> 'number'),values,{async:true});
  if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(errorPointer));checkAbort(signal);
  await selected.flush();await errors.flush();await Promise.all(scratch.map(s=>s.dispose()));metrics.heapBytes=m.HEAPU8.byteLength;success=true;
  return {width,height,selected,errors,metrics,async dispose(){await Promise.all([selected.dispose(),errors.dispose()]);}};
 }finally{if(m){closeMemoryRanges(m);if(errorPointer)m._free(errorPointer);m.pageIO=null;m.checkpoint=null;}if(!success)await Promise.allSettled(owned.map(s=>s.dispose()));release();}
}
