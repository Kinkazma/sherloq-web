import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createDenseDistanceGPU} from '../src/dense-distance-gpu.js';
const MiB=1024**2;
function same(a,b,label){if(a.length!==b.length||!a.every((x,i)=>x===b[i]))throw Error(label+' differs at '+a.findIndex((x,i)=>x!==b[i]));}
self.onmessage=async()=>{
 const reports=[];
 try{
  for(const scenario of [{dimensions:12,trim:true},{dimensions:12,failurePhase:1},{dimensions:12,failurePhase:2},{dimensions:12,failurePhase:3},{dimensions:12,failurePhase:4},{dimensions:12,reverseWindowPixels:127},{dimensions:12,symmetric:true},{dimensions:128,compare:true,axes:true},{dimensions:12,ties:true},{dimensions:12,overflow:true},{dimensions:12,temporary:true},{dimensions:128,gpu:true},{dimensions:12,staging:'admitted'},{dimensions:12,staging:'declined'},{dimensions:12,width:257,height:257,iterations:1}]){
   const width=scenario.width??47,height=scenario.height??31,n=width*height,budget=new Budget(192*MiB),owned=[],session=scenario.temporary?await createTemporarySession({backend:'auto',budget}):null;
   const allocate=async(array,storage='memory')=>{const store=await createSegmentedBytes(array.byteLength,{budget,shared:true,storage,temporarySession:session});owned.push(store);await store.write(new Uint8Array(array.buffer));return store;};
   let sequential,parallel,gpu;
   try{
    const dimensions=scenario.dimensions,scale=scenario.overflow?1e20:1,make=(factor)=>Float32Array.from({length:n*dimensions},(_,i)=>scenario.ties?0:Math.fround((((i*factor+(i/17|0)*13)%257)-128)/128*scale));
    const first=await allocate(make(19),scenario.temporary?'temporary':'memory'),second=scenario.symmetric?first:await allocate(make(31),scenario.temporary?'temporary':'memory'),mask=await allocate(Uint8Array.from({length:n},(_,i)=>i%11===0?0:scenario.compare?(i%3)+1:1)),axes=scenario.axes?[await allocate(Float32Array.from({length:width},(_,i)=>i*.75)),await allocate(Float32Array.from({length:height},(_,i)=>i*.5))]:null;
    const input={first,second,mask,width,height,dimensions,axes},settings={budget,iterations:scenario.iterations??4,reverseWindowPixels:scenario.reverseWindowPixels,radius:34,minimum:2,seed:729,compare:!!scenario.compare,gap:scenario.compare?[3,-2]:[0,0],workspaceBytes:128*MiB,temporarySession:session,storage:scenario.temporary?'temporary':'memory',cachePages:3};
    sequential=await runPagedDenseField(input,settings);let grants=0;const gpuBudget=new Budget(32*MiB);if(scenario.gpu&&navigator.gpu)try{gpu=await createDenseDistanceGPU({budget:gpuBudget});}catch(error){if(error.code!=='GPU_UNAVAILABLE')throw error;reports.push({gpuSkipped:error.message});}
    let stagedBytes=0,stagingPeak=0,stagingCalls=0,distanceCalls=0;
    const reserveGpuStaging=scenario.staging?async bytes=>{stagingCalls++;if(scenario.staging==='declined')throw Object.assign(Error('Staging not admitted'),{code:'MEMORY_LIMIT'});const release=budget.reserve(bytes);stagedBytes+=bytes;stagingPeak=Math.max(stagingPeak,stagedBytes);return async()=>{await new Promise(resolve=>setTimeout(resolve,1));stagedBytes-=bytes;release();};}:undefined;
    let faultyCreated=false;
    const fieldWorkerFactory=scenario.failurePhase?()=>{const inject=!faultyCreated;faultyCreated=true;return new Worker(inject?'/tests/dense-command-fault-worker.js?phase='+scenario.failurePhase:'/src/dense-field-kernel-worker.js',{type:'module'});}:undefined;
    parallel=await runPagedDenseField(input,{...settings,fieldWorkerFactory,parallelism:1,maxParallelism:4,reserveGpuStaging,distanceBatch:scenario.staging?async job=>{distanceCalls++;if(!stagedBytes)throw Error('GPU transfer allocated before reservation');return new Float32Array(job.pairCount).fill(NaN);}:gpu?(job)=>gpu.batch(job):undefined,acquireCpu:async({maximum,requiredWorkspaceBytes})=>{budget.limit=256*MiB;const desired=[1,3,2,4][grants++%4];return {cpu:Math.min(maximum,desired),workspaceBytes:requiredWorkspaceBytes,...(scenario.trim?{maxResidentKernels:grants%3===0?1:4}:{}),cachePages:3+(grants%3),release(){}};}});
    for(const key of ['targets','distancesSquared','allowed']){const a=new Uint8Array(sequential[key].byteLength),b=new Uint8Array(a.length);await sequential[key].readInto(a);await parallel[key].readInto(b);same(a,b,key+' '+JSON.stringify(scenario));}
    if(scenario.trim&&!parallel.metrics.parallel.memoryTrims)throw Error('Idle kernel memory was not returned');
    if(scenario.failurePhase&&parallel.metrics.parallel.commandRecoveries!==1)throw Error('Missing internal command recovery '+JSON.stringify(parallel.metrics.parallel));
    if(scenario.staging&&(!stagingCalls||stagedBytes||((scenario.staging==='admitted')!==!!distanceCalls)))throw Error('Staging admission/release violated');
    if(scenario.staging)reports.push({staging:scenario.staging,stagingPeak,stagingCalls,distanceCalls});
    if(sequential.comparisons!==parallel.comparisons)throw Error('Comparisons differ '+sequential.comparisons+' '+parallel.comparisons);
    if(gpu){reports.push({gpu:gpu.metrics});await gpu.dispose();gpu=null;if(gpuBudget.total())throw Error('GPU budget leaked');}
    if(!parallel.metrics.parallel.cacheReconfigurations)throw Error('No safe cache reconfiguration');
    if(parallel.metrics.parallel.peakActiveKernels<2)throw Error('No actual overlapping kernels');reports.push({scenario,storage:session?.backend??'memory',comparisons:String(parallel.comparisons),parallel:parallel.metrics.parallel});
   }finally{await gpu?.dispose();await sequential?.dispose();await parallel?.dispose();await Promise.all(owned.map(store=>store.dispose()));await session?.dispose();if(budget.total())throw Error('Leaked budget '+budget.total());}
  }
  const budget=new Budget(128*MiB),width=64,height=48,n=width*height,first=await createSegmentedBytes(n*48,{budget,shared:true}),mask=await createSegmentedBytes(n,{budget,shared:true}),controller=new AbortController();await mask.write(new Uint8Array(n).fill(1));const before=budget.total();let stopped=false;
  try{await runPagedDenseField({first,mask,width,height},{budget,parallelism:3,maxParallelism:3,iterations:20,signal:controller.signal,onProgress:p=>{if(p.parallel?.tasks>3)controller.abort();}});}catch(error){if(error.code!=='CANCELLED')throw error;stopped=true;}
  if(!stopped||budget.total()!==before)throw Error('Parallel cancellation leaked');
  const second=await createSegmentedBytes(n*48,{budget,shared:true});await first.write(new Uint8Array(new Float32Array(n*12).fill(1).buffer));await second.write(new Uint8Array(new Float32Array(n*12).fill(2).buffer));
  for(const mode of ['cancel','error']){const baseline=budget.total(),controller=new AbortController();let pending=0,calls=0,code;
   try{await runPagedDenseField({first,second,mask,width,height},{budget,workspaceBytes:96*MiB,parallelism:3,maxParallelism:3,iterations:1,signal:controller.signal,reserveGpuStaging:async bytes=>{const release=budget.reserve(bytes);pending+=bytes;return async()=>{await new Promise(resolve=>setTimeout(resolve,1));pending-=bytes;release();};},distanceBatch:async job=>{calls++;if(mode==='error')throw Object.assign(Error('Injected GPU failure'),{code:'GPU_FAILED'});controller.abort();await new Promise(resolve=>setTimeout(resolve,1));return new Float32Array(job.pairCount).fill(NaN);}});}catch(error){code=error.code;}
   if(!calls||code!==(mode==='cancel'?'CANCELLED':'GPU_FAILED')||pending||budget.total()!==baseline)throw Error('GPU '+mode+' cleanup failed '+JSON.stringify({calls,code,pending,total:budget.total(),baseline}));
   reports.push({gpuStagingCleanup:mode,code});
  }
  await second.dispose();await first.dispose();await mask.dispose();self.postMessage({result:{reports,cancelled:true}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
};
