import {wasmRange,byteView,closeMemoryRanges} from './memory-range.js';
// Native global traversal with bounded caches and externally stored planes.
// Input stores are borrowed; returned planes are owned until dispose(). No
// image resizing, tile-local candidates, or numerical approximation is used.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {planDensePageMemory,densePagedMinimumWorkspace,DENSE_PAGED_WORKSPACE_BYTES} from './dense-paged-memory.js';
import {createDensePagedHeap} from './dense-paged-heap.js';
import {missingMigrationWorkspaceBytes,migrationWorkspaceBytes} from './migration-workspace.js';
import {serializeDenseError} from './dense-memory-error.js';
import {denseWriteBatchBytes} from './dense-write-batch.js';
export async function runPagedDenseField({first,second=first,mask,width,height,dimensions=12,axes=null}, {
 budget,temporarySession,getTemporarySession,storage='auto',pageBytes=4096,cachePages,
 residentPool,residentSiftBounds,pagedSiftBounds,initialBatchPixels,workspaceBytes,parallelism=1,maxParallelism=parallelism,acquireCpu,recoverMemory,releaseWorkspace,fieldWorkerFactory,distanceBatch,reserveGpuStaging,readCache,inputBarrier,inputReaders,reverseWindowPixels,minimum=5,radius=600,iterations=8,compare=false,seed=729,gap=[0,0],signal,onProgress
}={}){
 const n=width*height,compact=first?.kind==='compact-sift';if(compact)dimensions=128;
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&n<=0x7fffffff&&[12,128].includes(dimensions),'Invalid paged dense shape.');
 const store=(s,bytes)=>s?.byteLength===bytes&&typeof s.readInto==='function';
 const compactValid=f=>f?.kind==='compact-sift'&&[f.width,f.height,f.patch,f.offset].every(Number.isSafeInteger)&&f.patch>=3&&f.patch<=32&&f.offset>=0&&f.viewWidth===width&&f.viewHeight===height&&f.width-3*f.patch-2*f.offset===width&&f.height-3*f.patch-2*f.offset===height&&typeof f.mirror==='boolean'&&typeof f.quarter==='boolean'&&f.weights instanceof Float32Array&&f.weights.length===4&&f.weights.every(Number.isFinite)&&store(f.hist,f.width*f.height*32)&&store(f.norms,(f.width-3*f.patch)*(f.height-3*f.patch)*12)&&store(f.turns,(f.width-3*f.patch)*(f.height-3*f.patch))&&store(f.diverse,(f.width-3*f.patch)*(f.height-3*f.patch));
 requireValue((compact?compactValid(first)&&compactValid(second):store(first,n*dimensions*4)&&store(second,n*dimensions*4))&&store(mask,n),'Invalid paged dense planes.');
 requireValue(!axes||axes.length===2&&store(axes[0],width*4)&&store(axes[1],height*4),'Invalid paged dense axes.');
 requireValue([minimum,radius,...gap].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&radius<=0x1fffffff&&gap.length===2&&gap.every(v=>Math.abs(v)<=0x1fffffff)&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean','Invalid paged PatchMatch options.');
 const {poolBytes,bootstrapStagingBytes,minimumKernelBytes:baseMinimumKernelBytes}=densePagedMinimumWorkspace(n);
 requireValue(Number.isInteger(parallelism)&&parallelism>=1&&Number.isInteger(maxParallelism)&&maxParallelism>=parallelism,'Invalid dense CPU grant.');
 const parallel=parallelism>1||typeof acquireCpu==='function',reverseCapacity=Math.min(n,reverseWindowPixels??Math.max(4096,maxParallelism*8192));
 requireValue(Number.isInteger(reverseCapacity)&&reverseCapacity>0,'Invalid reverse window.');
 const symmetric=first===second||(compact&&['hist','norms','turns','diverse','width','height','patch','offset','viewWidth','viewHeight','mirror','quarter'].every(key=>first[key]===second[key])&&first.weights.every((value,index)=>value===second.weights[index]));if(parallel){residentPool=true;residentSiftBounds=false;}
 residentPool??=poolBytes<=Math.min(40*1024**2,(budget.limit-budget.retained-budget.active-32*1024**2)*.3);
 requireValue(typeof residentPool==='boolean','Invalid resident candidate pool choice.');
 const residentPoolBytes=residentPool?poolBytes:0;
 requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0,'Invalid dense page size.');
 const fullBoundBytes=compact&&store(second.bounds,(second.width-3*second.patch)*(second.height-3*second.patch)*128)?second.bounds.byteLength:0;
 const automaticBounds=pagedSiftBounds===undefined;
 pagedSiftBounds??=!!fullBoundBytes&&second.hist.storage!=='memory';
 requireValue(typeof pagedSiftBounds==='boolean'&&(!pagedSiftBounds||fullBoundBytes>0),'Invalid paged SIFT bounds.');
 const lengths=[compact?first.hist.byteLength:n*dimensions*4,compact?second.hist.byteLength:n*dimensions*4,n,n*4,n*4,residentPool?0:n*4,residentPool?0:n*4,width*4,height*4,...(compact?[first.norms.byteLength,second.norms.byteLength,first.turns.byteLength,second.turns.byteLength,first.diverse.byteLength,second.diverse.byteLength,0,pagedSiftBounds?fullBoundBytes:0]:[])];
 if(parallel){while(lengths.length<17)lengths.push(0);lengths.push(reverseCapacity*4,reverseCapacity*4);}
 const boundBytes=compact&&store(second.boundSamples,(second.width-3*second.patch)*(second.height-3*second.patch)*4)?second.boundSamples.byteLength:0;
 requireValue(workspaceBytes===undefined||Number.isSafeInteger(workspaceBytes)&&workspaceBytes>0,'Invalid dense workspace allowance.');
 const outputAllowance=parallel&&(storage==='memory'||(!temporarySession&&!getTemporarySession))?n*(8+(compact&&(first.quarter||second.quarter)?1:0))+reverseCapacity*8:0;
 const migrationBytes=(temporarySession||getTemporarySession)&&temporarySession?.backend!=='opfs'?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(n*4,temporarySession)):0;
 const totalAllowance=Math.min(budget.limit-budget.retained-budget.active-outputAllowance-migrationBytes-(parallel?64*1024:0),workspaceBytes??Infinity);
 const gpuBatchPixels=parallel&&typeof distanceBatch==='function'?Math.min(n,4096):0,gpuNativeBytes=gpuBatchPixels*((compact?16:dimensions)*8+12);
 const bootstrapStaging=parallel?bootstrapStagingBytes:0;
 // One serialized owner window plus the reader cache and incoming window.
 // This capacity belongs to the kernel envelope, alongside its Wasm heap.
 const transportBytesPerKernel=parallel?lengths.reduce((sum,length)=>sum+Math.min(64*1024,length)*3,0):0;
 const writeBatchBytes=parallel?denseWriteBatchBytes(pageBytes):0;
 const minimumKernelBytes=baseMinimumKernelBytes+gpuNativeBytes+transportBytesPerKernel+writeBatchBytes,initialWorkers=parallel?Math.max(1,Math.min(maxParallelism,Math.floor((totalAllowance-poolBytes)/minimumKernelBytes))):1;
 const kernelBytes=parallel?Math.min(DENSE_PAGED_WORKSPACE_BYTES,Math.floor((totalAllowance-poolBytes)/initialWorkers)):0;
 const availableBytes=parallel?kernelBytes-bootstrapStaging-gpuNativeBytes-transportBytesPerKernel-writeBatchBytes:totalAllowance;
 residentSiftBounds??=!!boundBytes&&boundBytes<=Math.min(512*1024**2,(Math.min(DENSE_PAGED_WORKSPACE_BYTES,availableBytes)-16*1024**2-residentPoolBytes)*.45);
 requireValue(typeof residentSiftBounds==='boolean'&&(!residentSiftBounds||boundBytes>0),'Invalid resident SIFT bounds.');
 const residentSiftBoundsBytes=residentSiftBounds?boundBytes:0;
 const plan=()=>planDensePageMemory({lengths,pageBytes,availableBytes,residentBytes:residentPoolBytes+residentSiftBoundsBytes,n,dimensions,cachePages,initialBatchPixels});
 let memory=plan();
 if(automaticBounds&&pagedSiftBounds&&second.hist.byteLength<=memory.cachePages*pageBytes){pagedSiftBounds=false;lengths[16]=0;memory=plan();}
 ({cachePages,initialBatchPixels}=memory);const {cacheBytes,initialCachePages,initialCacheBytes,batchBytes,workspaceBytes:workspace}=memory;
 checkAbort(signal);const reservationBytes=parallel?kernelBytes*initialWorkers+poolBytes:workspace,release=budget.reserve(reservationBytes),owned=[];
 const metrics={workspaceBytes:workspace,initialBatchPixels,batchBytes,residentPool,residentPoolBytes,residentSiftBoundsBytes,pagedSiftBounds,cacheBytes,pageBytes,cachePages,initialCachePages,initialCacheBytes,cachePolicy:'reuse-after-initialization',reads:0,writes:0,readBytes:0,writeBytes:0,heapBytes:0};
 let m,heap,errorPointer,countPointer,metadataPointer,weightsPointer,metadata,weights,parallelMetrics,success=false;
 const allocate=async bytes=>{const s=await createSegmentedBytes(bytes,{budget,temporarySession,getTemporarySession,storage,shared:true,signal,owner:'patchmatch',label:'dense-field-plane'});owned.push(s);return s;};
 try{
  const targets=await allocate(n*4),distancesSquared=await allocate(n*4),pool0=await allocate(residentPool?0:n*4),pool1=await allocate(residentPool?0:n*4);
  let allowed=mask,ownsAllowed=false;
  if(compact&&(first.quarter||second.quarter)){
   allowed=await allocate(n);ownsAllowed=true;const page=new Uint8Array(Math.min(1024**2,n));
   for(let offset=0;offset<n;offset+=page.length){await controlCheckpoint(signal);const part=page.subarray(0,Math.min(page.length,n-offset));await mask.readInto(part,offset);await allowed.write(part,offset);}
  }
  const stores=[compact?first.hist:first,compact?second.hist:second,allowed,targets,distancesSquared,pool0,pool1,...(axes??[null,null]),...(compact?[first.norms,second.norms,first.turns,second.turns,first.diverse,second.diverse,residentSiftBounds?second.boundSamples:null,pagedSiftBounds?second.bounds:null]:[])];
  while(stores.length<19)stores.push(null);
  if(parallel){stores[17]=await allocate(reverseCapacity*4);stores[18]=await allocate(reverseCapacity*4);}
  if(parallel){
   if(compact){metadata=new Int32Array([first,second].flatMap(f=>[f.width,f.height,f.patch,f.offset,f.viewWidth,+f.mirror,+f.quarter,1]));metadata[15]=1+(residentSiftBounds?2:0)+(pagedSiftBounds?4:0);weights=new Float32Array([...first.weights,...second.weights]);}
   const values=[width,height,dimensions,+compare,minimum,radius,iterations,seed,...gap,+!!axes,pageBytes,initialCachePages,0,0,0,0,+residentPool,initialBatchPixels,cachePages,1,reverseCapacity,+symmetric];
   const {runParallelDenseField}=await import('./dense-field-parallel.js');
   parallelMetrics=await runParallelDenseField({values,stores,metadata,weights,distanceBatch,reserveGpuStaging,gpuBatchPixels,transportBytesPerKernel,bootstrapStaging,budget,kernelBytes,initialWorkers,maximum:maxParallelism,acquireCpu,recoverMemory,releaseWorkspace,releaseInitialWorkspace:bytes=>release.split(bytes)(),signal,onProgress,workerFactory:fieldWorkerFactory,readCache,inputBarrier,inputReaders,cachePages,validateCachePages:pages=>planDensePageMemory({lengths,pageBytes,availableBytes:kernelBytes-bootstrapStaging-gpuNativeBytes-transportBytesPerKernel,residentBytes:poolBytes,n,dimensions,cachePages:pages,initialBatchPixels:0}),bootBytes:poolBytes});
  }else{
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');
  heap=createDensePagedHeap(budget,parallel?kernelBytes:workspace);m=await create({wasmMemory:heap.memory});m.distanceBatch=typeof distanceBatch==='function'?job=>{const ranges=['queryDescriptors','candidateDescriptors','best'].map(key=>wasmRange(m,job[key].byteOffset,job[key].byteLength)),{pairCount,dimensions,distanceDimensions}=job;return Promise.resolve().then(()=>{const [queryDescriptors,candidateDescriptors,best]=ranges.map(range=>{const bytes=byteView(range);return new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);});return distanceBatch({pairCount,dimensions,distanceDimensions,queryDescriptors,candidateDescriptors,best});});}:undefined;let lastYield=performance.now();
  m.cacheAllocationFailure=requested=>{metrics.cacheAllocationFallbacks=(metrics.cacheAllocationFallbacks??0)+1;metrics.lastCacheAllocationFailure={requestedPages:requested,...(heap.error?{error:serializeDenseError(heap.error)}:{})};heap.clearError();};
  // Observe only real descriptor/bound reads. No probe or calibration is run.
  // A cold, much larger bound plane can cost more than the exact histogram
  // reads it avoids; retiring that optional check preserves every decision.
  const io=pagedSiftBounds?{descriptor:{seen:0,count:0,ms:0},bound:{seen:0,count:0,ms:0}}:null;
  if(io)metrics.siftBoundsReadTiming={boundSamples:0,descriptorSamples:0,boundReadMeanMs:0,descriptorReadMeanMs:0};
  m.pageIO=(id,offset,length,pointer,write)=>{
   checkAbort(signal);const bytes=wasmRange(m,pointer,length);
   const timing=io&&!metrics.siftBoundsFallback&&!write&&length===pageBytes?(id===16?io.bound:((id===0||id===1||id===9||id===10)?io.descriptor:null)):null;
   const sampled=timing&&((timing.seen++&15)===0),started=sampled?performance.now():0;
   const finish=()=>{
    if(sampled){
     timing.ms+=performance.now()-started;timing.count++;
     const observed=metrics.siftBoundsReadTiming;observed.boundSamples=io.bound.count;observed.descriptorSamples=io.descriptor.count;
     observed.boundReadMeanMs=io.bound.ms/Math.max(1,io.bound.count);observed.descriptorReadMeanMs=io.descriptor.ms/Math.max(1,io.descriptor.count);
     if(io.bound.count>=32&&io.descriptor.count>=32&&io.bound.ms/io.bound.count>8*Math.max(.01,io.descriptor.ms/io.descriptor.count)){
      m.HEAPU32[metadataPointer/4+15]&=~4;metrics.pagedSiftBounds=false;
      metrics.siftBoundsFallback={reason:'slow-bound-reads',boundReadMeanMs:io.bound.ms/io.bound.count,descriptorReadMeanMs:io.descriptor.ms/io.descriptor.count,boundSamples:io.bound.count,descriptorSamples:io.descriptor.count};
     }
    }
    if(write){metrics.writes++;metrics.writeBytes+=length;}else{metrics.reads++;metrics.readBytes+=length;}checkAbort(signal);if(performance.now()-lastYield>=20)return m.checkpoint();};
   const result=write?stores[id].write(bytes,offset):stores[id].readInto(bytes,offset);
   return result&&typeof result.then==='function'?result.then(finish):finish();
  };
  m.checkpoint=async()=>{checkAbort(signal);metrics.workspaceBytes=heap.reservedBytes;if(performance.now()-lastYield>=20){onProgress?.({phase:'global-patchmatch',...m.fieldProgress,...metrics});await controlCheckpoint(signal);lastYield=performance.now();}};
  errorPointer=m._malloc(1024);countPointer=m._malloc(8);
  if(!errorPointer||!countPointer)throw heap.error??new EngineError('MEMORY_ALLOCATION','Paged dense allocation failed.');
  if(compact){
   metadata=new Int32Array([first,second].flatMap(f=>[f.width,f.height,f.patch,f.offset,f.viewWidth,+f.mirror,+f.quarter,1]));
   metadata[15]=1+(residentSiftBounds?2:0)+(pagedSiftBounds?4:0);
   weights=new Float32Array([...first.weights,...second.weights]);metadataPointer=m._malloc(metadata.byteLength);weightsPointer=m._malloc(weights.byteLength);
   if(!metadataPointer||!weightsPointer)throw heap.error??new EngineError('MEMORY_ALLOCATION','Paged compact metadata allocation failed.');
   m.HEAPU8.set(new Uint8Array(metadata.buffer),metadataPointer);m.HEAPU8.set(new Uint8Array(weights.buffer),weightsPointer);
  }
 const values=[width,height,dimensions,+compare,minimum,radius,iterations,seed,...gap,+!!axes,pageBytes,initialCachePages,countPointer,errorPointer,metadataPointer??0,weightsPointer??0,+residentPool,initialBatchPixels,cachePages,0,reverseCapacity,+symmetric];
  let code=0;
  code=await m.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});
  if(m.ioError)throw m.ioError;
  if(code&&heap.error)throw heap.error;
  if(code)throw new EngineError(code===-2?'MEMORY_ALLOCATION':'NUMERIC_RANGE',m.UTF8ToString(errorPointer));
  }
  checkAbort(signal);await targets.flush();await distancesSquared.flush();
  const comparisons=parallelMetrics?.comparisons??(BigInt(m.HEAPU32[countPointer/4])+(BigInt(m.HEAPU32[countPointer/4+1])<<32n));
  if(parallelMetrics){const {comparisons:parallelComparisons,...execution}=parallelMetrics;metrics.parallel=execution;metrics.reservationBytes=parallelMetrics.reservedWorkspaceBytes;metrics.reverseScratchBytes=reverseCapacity*8;metrics.gpuNativeScratchBytes=gpuNativeBytes;metrics.symmetricReverse=symmetric;await stores[17].dispose();await stores[18].dispose();}
  metrics.heapBytes=parallelMetrics?parallelMetrics.kernels.reduce((sum,kernel)=>sum+kernel.heapBytes,0):m.HEAPU8.byteLength;metrics.workspaceBytes=parallelMetrics?parallelMetrics.reservedWorkspaceBytes:heap.reservedBytes;metrics.plannedWorkspaceBytes=workspace;metrics.siftBoundRejections=parallelMetrics?parallelMetrics.kernels.reduce((sum,kernel)=>sum+(kernel.siftBoundRejections??0),0):(m.siftBoundRejections??0);
  await pool0.dispose();await pool1.dispose();success=true;
  let disposed=false;
  return {width,height,targets,distancesSquared,allowed,ownsAllowed,comparisons,metrics,descriptorStorage:compact?'paged-compact-sift':'paged-global',async dispose(){if(disposed)return;disposed=true;await Promise.all([targets.dispose(),distancesSquared.dispose(),ownsAllowed?allowed.dispose():undefined]);}};
 }finally{
  if(m){closeMemoryRanges(m);if(errorPointer)m._free(errorPointer);if(countPointer)m._free(countPointer);if(metadataPointer)m._free(metadataPointer);if(weightsPointer)m._free(weightsPointer);m.pageIO=null;m.checkpoint=null;}
  if(!success)await Promise.allSettled(owned.map(s=>s.dispose()));
  heap?.dispose();release();
 }
}
