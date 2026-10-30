import {createDensePagedHeap} from './dense-paged-heap.js';
import {denseConstructionOwner,cleanupDenseOwners,retireDenseOwners} from './dense-owner-retirement.js';
import {wasmAllocationFailure} from './allocation.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
// One owned native module per complete coherence phase. Reusing the allocator
// prevents dozens of completed, uncollected Wasm instances accumulating before
// the browser's next garbage collection. Native fields remain independent.
export function createPagedDenseCoherenceRuntime(budget){
 let module,heap,reserved=0,closed=false;const releases=[];
 return {get reservedBytes(){return reserved;},async load(bytes){
  requireValue(!closed,'Dense coherence runtime is closed.');
  if(bytes>reserved){releases.push(budget.reserve(bytes-reserved));reserved=bytes;}
  if(!module){heap=createDensePagedHeap(budget,reserved);const {default:create}=await import('../vendor/dense-paged/dense-paged.js');module=await create({wasmMemory:heap.memory});}
  heap.clearError();module.ioError=null;return module;
 },dispose(){if(closed)return;closed=true;if(module){closeMemoryRanges(module);module.pageIO=null;module.checkpoint=null;}module=null;heap?.dispose();heap=null;for(const release of releases)release();releases.length=0;reserved=0;}};
}
export async function runPagedDenseCoherence({width,height,targets,distancesSquared},{budget,storage='auto',temporarySession,getTemporarySession,threshold=.3,errorThreshold=3,radius=6,minimum=6,pageBytes=4096,cachePages,signal,onProgress,onRetirementOwner,runtime}={}){
 const n=width*height;
 requireValue([width,height].every(Number.isSafeInteger)&&width>0&&height>0&&n<=0x7fffffff&&targets?.byteLength===n*4&&distancesSquared?.byteLength===n*4,'Invalid stored dense field.');
 requireValue(Number.isFinite(threshold)&&threshold>=0&&Number.isFinite(errorThreshold)&&errorThreshold>=0&&Number.isInteger(radius)&&radius>=1&&radius<=6&&Number.isInteger(minimum)&&minimum>=1&&minimum<=0x7fffffff,'Invalid stored coherence settings.');
 const base=16*1024**2+width*48;
 cachePages??=Math.max(1,Math.min(2048,Math.floor((budget.limit-budget.retained-budget.active+(runtime?.reservedBytes??0)-base)*.6/(7*pageBytes))));
 requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0&&Number.isSafeInteger(cachePages)&&cachePages>=1,'Invalid coherence page cache.');
 const lengths=[n*4,n*4,n,n*4,...(minimum>1?[n*4,n*4,n*4]:[])],cacheBytes=lengths.reduce((sum,l)=>sum+Math.min(cachePages,Math.ceil(l/pageBytes))*(pageBytes+32),0),workspace=base+cacheBytes;
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','The coherence frontier and caches exceed the module allowance.');
 checkAbort(signal);const owned=[];let m,errorPointer,success=false,failed=false,primary;const owner=denseConstructionOwner(owned,{onRetirementOwner}),release=runtime?()=>{}:budget.reserve(workspace);
 const metrics={workspaceBytes:workspace,pageBytes,cachePages,cacheBytes,reads:0,writes:0,readBytes:0,writeBytes:0,heapBytes:0};
 const allocate=async bytes=>{const s=await createSegmentedBytes(bytes,{budget,storage,temporarySession,getTemporarySession,signal});owned.push(s);return s;};
 try{
  if(runtime)m=await runtime.load(workspace);
  const selected=await allocate(n),errors=await allocate(n*4),scratch=[];if(minimum>1)for(let i=0;i<3;i++)scratch.push(await allocate(n*4));
  const stores=[targets,distancesSquared,selected,errors,...scratch];if(!m){const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();}let lastYield=performance.now();
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=20){onProgress?.({phase:'global-coherence',...metrics});await controlCheckpoint(signal);lastYield=performance.now();}};
  m.pageIO=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=wasmRange(m,pointer,length);if(write){await stores[id].write(bytes,offset);metrics.writes++;metrics.writeBytes+=length;}else{await stores[id].readInto(bytes,offset);metrics.reads++;metrics.readBytes+=length;}if(performance.now()-lastYield>=20)await m.checkpoint();};
  errorPointer=m._malloc(1024);if(!errorPointer)throw wasmAllocationFailure(m,'Coherence allocation failed.',1024);
  const values=[width,height,threshold*threshold,errorThreshold,radius,minimum,pageBytes,cachePages,errorPointer],code=await m.ccall('dense_paged_coherence','number',values.map(()=> 'number'),values,{async:true});
  if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(errorPointer));checkAbort(signal);
  await selected.flush();await errors.flush();await Promise.all(scratch.map(s=>s.dispose()));metrics.heapBytes=m.HEAPU8.byteLength;owner.publish();success=true;
  return {width,height,selected,errors,metrics,dispose:owner.dispose};
 }catch(error){failed=true;primary=error;throw error;}finally{if(m){if(!runtime)closeMemoryRanges(m);if(errorPointer)m._free(errorPointer);m.pageIO=null;m.checkpoint=null;}try{if(!success)await cleanupDenseOwners(()=>owner.dispose(),{failed,primary});}finally{release();}}
}
