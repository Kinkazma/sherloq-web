import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {createRgb16Surface,native16Descriptor} from './rgb16-surface.js';
import {createNative16DisplayOwner} from './native16-display-owner.js';
import {parameters,roundEven} from './pixel-utils.js';
import {separationStage} from './separation-stage.js';
import {SeparationWorkers} from './separation-workers.js';
import {SEPARATION_HEAP_BYTES,separationHeapBytes,separationWorkspace,separationHalo} from './separation-math.js';
import {openSeparationGpu,separationGpuAdmission} from './separation-gpu-session.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {NATIVE16_SEPARATION_UNITS} from './native16-separation-math.js';
const littleEndian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const MiB=1024**2,BINS=65536,HISTOGRAM_BYTES=3*BINS*8,owners=new WeakMap();
export function native16SeparationParams(input={}){const p=parameters(input,{mode:0,radius:1,sigma:3,grayscale:false,denoised:false,levels:32},{mode:[0,4],radius:[1,10],sigma:[1,200],levels:[0,255]},{},['grayscale','denoised']);requireValue([0,1,2,3,4].includes(p.mode),'Native16 separation admits median, Gaussian, box, bilateral and native L2 NLM filters.');return p;}
export function native16SeparationAdmitted(input={}){try{const{equalization,...base}=input;native16SeparationParams(base);return true;}catch{return false;}}
export function native16ResidualLuts(histograms,count,levels){
 requireValue(histograms instanceof Float64Array&&histograms.length===3*BINS&&Number.isSafeInteger(count)&&count>0&&Number.isInteger(levels)&&levels>=0&&levels<=255,'Invalid native16 residual presentation.');
 if(levels!==0){const lut=new Uint8Array(BINS),threshold=levels*257;for(let i=0;i<BINS;i++)lut[i]=Math.min(255,Math.trunc(255*i/threshold));return[lut];}
 return Array.from({length:3},(_,c)=>{const bins=histograms.subarray(c*BINS,(c+1)*BINS),lut=new Uint8Array(BINS);let first=0;while(first<BINS-1&&!bins[first])first++;if(bins[first]===count){lut.fill(roundEven(first/257));return lut;}const scale=Math.fround(255/Math.fround(count-bins[first]));let sum=0;for(let i=first+1;i<BINS;i++){sum+=bins[i];lut[i]=Math.max(0,Math.min(255,roundEven(Math.fround(Math.fround(sum)*scale))));}return lut;});
}
function separationSourceReadBytes(surface,windowRows){
 const d=surface.descriptor,w=d.width;
 if(typeof surface.readWindowPlan!=='function')return Math.max(d.sourceWidth??w,d.sourceHeight??d.height)*6;
 const plan=surface.readWindowPlan({x:0,y:0,width:w,height:windowRows});
 requireValue(plan?.known===true&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'Native16 separation source read plan is unavailable.');
 return plan.additionalBytes;
}
export function native16SeparationExecutionPlan({width:w,height:h,params:p,rowsPerBlock,maxWorkers=1,gpuAvailable=false,workersAvailable=typeof Worker!=='undefined',ioBytes=0,sourceReadPlan}){
 const halo=separationHalo(p);let lower=0,upper=h;while(lower<upper){const middle=Math.ceil((lower+upper)/2),windowRows=Math.min(h,middle+2*halo);if(separationWorkspace(w,windowRows,p,16,middle)<=SEPARATION_HEAP_BYTES)lower=middle;else upper=middle-1;}const heapRows=lower;
 // NLM preparation consumes the full input halo even though only core rows
 // are filtered. Use the existing fixed64MiB actor's real admitted extent;
 // the shared-budget rowsFor/count guards below still reduce it as needed.
 // Other filters retain their measured policy; an explicit row cap wins.
 // The NLM shader processes8x8 groups. Align only a partial default GPU
 // band so its last group does not repeat padded rows at every boundary.
 // A whole admitted frame and explicit row caps keep their exact policy.
 const defaultRows=p.mode===4?Math.max(1,heapRows):Math.max(1,Math.floor(262144/w)),tiledRows=p.mode===4&&gpuAvailable&&defaultRows<h&&defaultRows>=8?defaultRows-defaultRows%8:defaultRows;
 const targetRows=Math.min(h,rowsPerBlock??tiledRows),minimumRows=Math.min(targetRows,heapRows,Math.max(1,2*halo)),maximum=gpuAvailable||!workersAvailable?1:Math.min(32,maxWorkers,Math.ceil(h/targetRows));
 const heapBytes=count=>count===1?SEPARATION_HEAP_BYTES:separationHeapBytes()+count*SEPARATION_HEAP_BYTES,batchBytes=(count,rows)=>heapBytes(count)+ioBytes+HISTOGRAM_BYTES*(count+1)+count*w*(rows+Math.min(h,rows+2*halo))*6+65536;
 const additionalReadBytes=(count,rows)=>{const windowRows=Math.min(h,rows+2*halo),sourceExtra=sourceReadPlan?sourceReadPlan(windowRows):Math.max(w,h)*6;requireValue(Number.isSafeInteger(sourceExtra)&&sourceExtra>=0,'Invalid native16 separation source read cost.');return count*w*windowRows*6+sourceExtra;};
 const rowsFor=(count,room)=>{let low=0,high=Math.max(0,Math.min(targetRows,heapRows));while(low<high){const middle=low+Math.ceil((high-low)/2);if(batchBytes(count,middle)+additionalReadBytes(count,middle)<=room)low=middle;else high=middle-1;}return low;};
 return{targetRows,heapRows,minimumRows,maximum,heapBytes,batchBytes,additionalReadBytes,rowsFor};
}
export const native16SeparationCacheBytes=n=>n*6;
export function native16SeparationRenderPlan(w,h,p,available,{rowsPerBlock}={}){
 const pixelBytes=p.denoised?6:9,heapBytes=separationHeapBytes(),rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(4*MiB/(w*pixelBytes))),Math.floor((available-heapBytes)/(w*pixelBytes)));
 return{rows,scratchBytes:rows*w*pixelBytes+heapBytes,heapBytes,lutBytes:p.denoised?0:(p.levels===0?3:1)*BINS,outputBytes:w*h*(p.denoised?6:3)};
}
export function native16SeparationAdmissionPlan(surface,p,{budget,backend='auto',runtimeBytes=0,maxWorkers=1,ioBytes=0,storageOverheadBytes=0}={}){
 try{
  const d=surface.descriptor,w=d.width,h=d.height,n=w*h,owner=owners.get(surface),state=owner?owner.admissionState(p,backend,budget):{known:true,filterCache:false,session:null};if(!state.known)return state;
  const options={width:w,height:h,params:p,maxWorkers,ioBytes,sourceReadPlan:windowRows=>separationSourceReadBytes(surface,windowRows)},cpu=native16SeparationExecutionPlan(options),gpuChoice=native16SeparationExecutionPlan({...options,gpuAvailable:true}),gpuRows=Math.min(gpuChoice.targetRows,gpuChoice.heapRows);if(gpuRows<1)return{known:false,reason:'separation-row-not-admitted'};
  const gpu=separationGpuAdmission(w,Math.min(h,gpuRows+2*separationHalo(p)),gpuRows,p,{budget,backend,sampleDepth:16,session:state.session,priorBytes:runtimeBytes});if(!gpu.known)return gpu;
  const render=native16SeparationRenderPlan(w,h,p,Number.MAX_SAFE_INTEGER),renderBytes=storageOverheadBytes+render.outputBytes+render.scratchBytes+Math.max(0,SEPARATION_HEAP_BYTES-render.heapBytes)+render.lutBytes+ioBytes;
  if(state.filterCache)return{known:true,bytes:runtimeBytes+renderBytes,completeResidentAlternative:true,filterCache:true,parallelWorkers:0,gpuState:gpu.state};
  const cacheBytes=native16SeparationCacheBytes(n);
  const filter=choice=>{const rows=Math.min(choice.targetRows,choice.heapRows);if(rows<1)return NaN;return cacheBytes+choice.batchBytes(choice.maximum,rows)+choice.additionalReadBytes(choice.maximum,rows);};
  const cpuBytes=Math.max(filter(cpu),cacheBytes+HISTOGRAM_BYTES+renderBytes),gpuBytes=gpu.available?gpu.missingResidentBytes+Math.max(filter(gpuChoice)+gpu.hostBytes,cacheBytes+HISTOGRAM_BYTES+renderBytes):0,bytes=runtimeBytes+Math.max(cpuBytes,gpuBytes,gpu.openingBytes??0);
  return Number.isSafeInteger(bytes)&&bytes>0?{known:true,bytes,completeResidentAlternative:true,parallelWorkers:gpu.available?1:cpu.maximum,gpuState:gpu.state}:null;
 }catch{return{known:false,reason:'native16-separation-plan-uninspectable'};}
}
function observeNative16SeparationStore(store,observations){
 const state={active:0,debt:false,closing:false,closed:false};observations.set(store,state);
 for(const name of['readInto','write','flush','migrate','spill','spillReadOnly','promote','dispose']){
  try{const method=store[name];if(typeof method!=='function')continue;store[name]=function(...args){
   state.active++;if(name==='dispose')state.closing=true;let finished=false;
   const finish=failed=>{if(finished)return;finished=true;state.active--;if(failed)state.debt=true;else if(name==='dispose')state.closed=true;};
   let value;try{value=method.apply(this,args);}catch(error){finish(true);throw error;}
   // A fulfilled spill may be false/0 (nothing moved); reads/writes/flush
   // also have no generic ACK payload. Only rejection/throw creates debt.
   // Observe settlement, returning the exact original result/Promise.
   try{if(value&&typeof value.then==='function')value.then(()=>finish(false),()=>finish(true));else finish(false);}catch{finish(true);}
   return value;
  };}catch{state.debt=true;}
 }
 return store;
}
function createOwner(surface,options){
 const{budget}=options,d=surface.descriptor,w=d.width,h=d.height,n=w*h,controller=new AbortController(),adaptive=new AdaptiveConcurrency(),retiring=new Set(),storeObservations=new WeakMap();let active,base,gpu,closed=false,closing;
 async function retire(actions,options={}){await retireCompositeOwners(actions.filter(Boolean).map(action=>async()=>{try{const reply=await action();if(reply===false||reply===0)throw reply;retiring.delete(action);}catch(error){retiring.add(action);throw error;}}),options);}
 const io=()=>options.temporarySession?.backend==='indexeddb'||!options.temporarySession&&options.getTemporarySession?2*MiB:0;
 const store=(bytes,label,signal)=>{const pending=createSegmentedBytes(bytes,{budget,storage:options.storage??'auto',temporarySession:options.temporarySession,getTemporarySession:options.getTemporarySession,signal,owner:'native16-separation',label});void pending.then(value=>{observeNative16SeparationStore(value,storeObservations);},()=>{});return pending;};
 async function clearBase(){if(!base)return;const previous=base;previous.retiring=true;await retire([()=>previous.store.dispose(),()=>previous.histograms.release()]);if(base===previous)base=null;}
 async function clearGpu(){if(!gpu)return;await gpu.dispose();gpu=null;}
 const unregister=budget.registerAsyncReclaimer?.(async()=>{if(active)return 0;const before=budget.total();await retire([...retiring,clearBase,clearGpu]);return Math.max(0,before-budget.total());},{owner:'native16-separation',label:'idle-native16-filter-and-gpu'});
 function alive(){if(closed)throw new EngineError('DISPOSED','Native16 separation source retired.');}
 async function renderDenoised(p,record,hooks){
  const {signal,onProgress,rowsPerBlock}=hooks,available=budget.limit-budget.total()-io(),{rows,scratchBytes,outputBytes}=native16SeparationRenderPlan(w,h,p,available,{rowsPerBlock});
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Native16 denoised output cannot fit one row.');
  let output,scratch,display,resultSurface,failed=false,primary;const started=performance.now();
  try{
   requireValue(typeof hooks.isSourceCurrent==='function'&&hooks.sourceBinding,'Denoised native16 output requires its captured Original color authority.');
   scratch=budget.reserve(scratchBytes+io());output=await store(outputBytes,'native16-denoised-output',signal);
   const bytes=new Uint8Array(rows*w*6),cooperate=createCooperator(signal);let blocks=0;
   for(let y=0;y<h;y+=rows){await cooperate();const count=Math.min(rows,h-y),part=bytes.subarray(0,count*w*6);await record.store.readInto(part,y*w*6,{signal});if(!littleEndian)for(let i=0;i<part.length;i+=2){const a=part[i];part[i]=part[i+1];part[i+1]=a;}await output.write(part,y*w*6,{signal});blocks++;onProgress?.((y+count)/h);}
   await output.flush();checkAbort(signal);
   display=createNative16DisplayOwner({nativeSource:hooks.sourceSurface??surface,budget,isCurrent:hooks.isSourceCurrent,sourceBinding:hooks.sourceBinding,displayAssumption:hooks.displayAssumption,totalPixels:n,backend:hooks.colorBackend??'auto'});
   resultSurface=createRgb16Surface(output,{width:w,height:h,budget,sourceDepth:d.sourceDepth,color:d.color,provenance:d.provenance,displayTransform:display.displayTransform});output=null;display.attach(resultSurface);display=null;
   const result={surface:resultSurface,metrics:{renderMs:performance.now()-started,renderBlocks:blocks,renderRowsPerBlock:rows,storage:resultSurface.descriptor.storage,retainedResultBytes:outputBytes,outputDepth:16},dispose:()=>result.surface.dispose(),markCold:()=>{}};resultSurface=null;return result;
  }catch(error){failed=true;primary=error;throw error;}finally{await retire([output?()=>output.dispose():null,resultSurface?()=>resultSurface.dispose():null,display?()=>display.dispose():null,()=>scratch?.()],failed?{primary}:{});}
 }
 async function render(p,record,hooks){
  if(p.denoised)return renderDenoised(p,record,hooks);
  const {signal,onProgress,rowsPerBlock}=hooks;
  const available=budget.limit-budget.total()-io(),{rows,scratchBytes,lutBytes,outputBytes}=native16SeparationRenderPlan(w,h,p,available,{rowsPerBlock});if(rows<1)throw new EngineError('MEMORY_LIMIT','Native16 residual presentation cannot fit one row.');let output,scratch,lutCredit,primary,failed=false;const at=performance.now();
  try{scratch=budget.reserve(scratchBytes+io());output=await store(outputBytes,'native16-residual-display',signal);lutCredit=budget.reserve(lutBytes);const luts=native16ResidualLuts(record.histograms.data,n,p.levels),cooperate=createCooperator(signal),bytes=new Uint16Array(rows*w*3),display=new Uint8Array(rows*w*3);let blocks=0;
   for(let y=0;y<h;y+=rows){await cooperate();const count=Math.min(rows,h-y),samples=count*w*3,part=bytes.subarray(0,samples);await record.store.readInto(new Uint8Array(part.buffer,part.byteOffset,part.byteLength),y*w*6,{signal});for(let i=0;i<samples;i++)display[i]=(luts.length===1?luts[0]:luts[i%3])[part[i]];await output.write(display.subarray(0,samples),y*w*3,{signal});blocks++;onProgress?.((y+count)/h);}
   await output.flush();checkAbort(signal);const resultSurface=createRgbSurface(output,{width:w,height:h,budget});output=null;return{surface:resultSurface,metrics:{renderMs:performance.now()-at,renderBlocks:blocks,renderRowsPerBlock:rows,storage:resultSurface.descriptor.storage,retainedResultBytes:n*3},dispose:()=>resultSurface.dispose(),markCold:()=>{}};
  }catch(error){failed=true;primary=error;throw error;}finally{await retire([output?()=>output.dispose():null,()=>lutCredit?.(),()=>scratch?.()],failed?{primary}:{});}
 }
 async function filter(p,key,{signal,onProgress,rowsPerBlock,backend,maxWorkers,nativeGpuRetirement,retirementCacheOwner}){
  await clearBase();const halo=separationHalo(p),minimumWindow=Math.min(h,1+2*halo);if(separationWorkspace(w,minimumWindow,p,16,1)>SEPARATION_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','A native16 separation row and its real halo exceed the shared arithmetic heap.');
  if(backend==='cpu')await clearGpu();else if(!gpu){const retirementTicket=nativeGpuRetirement?.expect('base-gpu',owner,'separation-construction');await openSeparationGpu({budget,backend,signal,sampleDepth:16,nativeGpuRetirement,retirementTicket,retirementCacheOwner,onOwner:session=>{gpu=session;}});}
   const{targetRows,heapRows,minimumRows,maximum,heapBytes,batchBytes,additionalReadBytes,rowsFor}=native16SeparationExecutionPlan({width:w,height:h,params:p,rowsPerBlock,maxWorkers,gpuAvailable:!!gpu?.available,ioBytes:io(),sourceReadPlan:windowRows=>separationSourceReadBytes(surface,windowRows)});
  const plan=adaptive.select(key,maximum,budget,count=>batchBytes(count,minimumRows)+additionalReadBytes(count,minimumRows));let count=plan.count,retry=null;
  async function attempt(){
   let pending,planning,staging,workers,histograms,published=false,primary,failed=false;const cooperate=createCooperator(signal),abort=()=>workers?.clear(),started=performance.now(),metrics={sourceReads:0,blocks:0,workerJobs:0,workers:count,gpuJobs:0,kernelMs:0,postprocessMs:0,readMs:0,writeMs:0};signal?.addEventListener('abort',abort,{once:true});
   try{checkAbort(signal);planning=budget.reserve(batchBytes(count,minimumRows)+additionalReadBytes(count,minimumRows));pending=await store(native16SeparationCacheBytes(n),p.denoised?'native16-filtered-cache':'native16-raw-residual-cache',signal);planning();planning=null;
     const rows=rowsFor(count,budget.limit-budget.total());if(rows<1)throw new EngineError('MEMORY_LIMIT','Native16 separation staging cannot fit one complete row.');
    staging=budget.reserve(batchBytes(count,rows)-io());histograms={data:new Float64Array(3*BINS),release(){}};if(count>1)workers=new SeparationWorkers(count,{budget,resourceOwner:'native16-separation'});
    for(let y=0;y<h;y+=count*rows){await cooperate();const jobs=[],leases=[],results=[];let batchPrimary,batchFailed=false;try{
     for(let i=0;i<count&&y+i*rows<h;i++){const coreY=y+i*rows,coreRows=Math.min(rows,h-coreY),top=Math.max(0,coreY-halo),bottom=Math.min(h,coreY+coreRows+halo),readAt=performance.now(),window=await surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});leases.push(window);metrics.sourceReads++;metrics.readMs+=performance.now()-readAt;const input={image:window.pixels,params:{...p,levels:0},start:coreY-top,rows:coreRows},job=workers?workers.call(i,input):separationStage(input.image,input.params,input.start,coreRows,{signal,gpu,nativeGpuRetirement,retirementTicket:gpu?.available?nativeGpuRetirement?.expect('base-gpu',owner,'separation-native16-band'):undefined,retirementCacheOwner});if(workers)metrics.workerJobs++;jobs.push(job.then(value=>({value,y:coreY,rows:coreRows}),error=>({error})));}
     results.push(...await Promise.all(jobs));checkAbort(signal);for(const item of results){if(item.error)throw item.error;const{value}=item,writeAt=performance.now();await pending.write(new Uint8Array(value.bytes.buffer,value.bytes.byteOffset,value.bytes.byteLength),item.y*w*6,{signal});metrics.writeMs+=performance.now()-writeAt;if(!p.denoised)for(let i=0;i<3*BINS;i++)histograms.data[i]+=value.histograms[i];metrics.kernelMs+=value.kernelMs;metrics.postprocessMs+=value.postprocessMs;metrics.blocks++;onProgress?.((item.y+item.rows)/h);}
    }catch(error){batchFailed=true;batchPrimary=error;throw error;}finally{await Promise.allSettled(jobs);await retire([...results.filter(item=>item.value?.release).map(item=>()=>item.value.release()),...leases.map(lease=>()=>lease.release())],batchFailed?{primary:batchPrimary}:{});}}
    await pending.flush();checkAbort(signal);const retainedHistogram=allocateOwnedTypedArray(Float64Array,3*BINS,{budget,owner:'native16-separation',label:'retained-native-filter-histogram'});retainedHistogram.data.set(histograms.data);base={key,store:pending,histograms:retainedHistogram};pending=null;published=true;base.store.markCold?.(true);metrics.rowsPerBlock=rows;metrics.filterMs=performance.now()-started;metrics.rawResidualStorage=p.denoised?null:base.store.storage;metrics.gpuJobs=gpu?.snapshot().gpu?.calls??0;adaptive.observe(key,{count,maximum,milliseconds:metrics.filterMs,computeMilliseconds:metrics.kernelMs,ioMilliseconds:metrics.readMs+metrics.writeMs,units:n});return metrics;
   }catch(error){failed=true;primary=error;throw error;}finally{signal?.removeEventListener('abort',abort);await retire([()=>workers?.clear(),pending?()=>pending.dispose():null,()=>planning?.(),()=>staging?.()],failed?{primary}:{});if(!published)histograms=null;}
  }
  try{return{...await attempt(),retry};}catch(error){if(signal.aborted||count===1||error?.cleanupOwner||'cleanupError' in Object(error)||'cleanupErrors' in Object(error)&&(!Array.isArray(error.cleanupErrors)||error.cleanupErrors.length)||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,count,{error});const old=count;count=1;retry={from:old,to:1,code:error.code};return{...await attempt(),retry};}
 }
 const owner={
  admissionState(p,backend,expectedBudget){
   if(expectedBudget!==budget||closed||closing||active||retiring.size)return{known:false,reason:'native16-separation-owner-not-idle'};
   const key=JSON.stringify([d.id,d.revision,p.mode,p.radius,p.mode===3?p.sigma:null,p.grayscale,p.denoised,backend]);
   const observed=base&&storeObservations.get(base.store);
   if(base&&(!observed||observed.active||observed.debt||observed.closing||observed.closed||base.retiring||base.store?.storage!=='memory'||base.store.byteLength!==native16SeparationCacheBytes(n)||base.store.allocatedBackingBytes!==native16SeparationCacheBytes(n)||base.store.allocationRecovery||!(base.histograms?.data instanceof Float64Array)||base.histograms.data.length!==3*BINS))return{known:false,reason:'native16-separation-cache-not-attested'};
   return{known:true,filterCache:!!base&&base.key===key,session:gpu};
  },
  run(input,hooks={}){alive();if(active)throw new EngineError('BUSY','Native16 separation is already calculating.');const p=native16SeparationParams(input),backend=hooks.backend??'auto',maxWorkers=hooks.maxWorkers??options.maxWorkers??1;requireValue(['cpu','auto','webgpu'].includes(backend)&&Number.isSafeInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=32,'Invalid native16 separation execution.');const linked=new AbortController(),abort=()=>linked.abort();controller.signal.addEventListener('abort',abort,{once:true});hooks.signal?.addEventListener('abort',abort,{once:true});if(controller.signal.aborted||hooks.signal?.aborted)linked.abort();
   const observer=hooks.nativeGpuRetirement?.hasPort('base-gpu')?hooks.nativeGpuRetirement:null;if(observer)observer.enter('base-gpu',owner);const retirementCacheOwner=observer?.cacheOwner(owner,'native16-separation-source-cache');const task=(async()=>{try{checkAbort(linked.signal);await retire([...retiring]);const key=JSON.stringify([d.id,d.revision,p.mode,p.radius,p.mode===3?p.sigma:null,p.grayscale,p.denoised,backend]),cached=base?.key===key&&!base.retiring,beforeGpu=gpu?.snapshot().gpu?.calls??0,filterMetrics=cached?{sourceReads:0,blocks:0,workerJobs:0,workers:0,gpuJobs:0,kernelMs:0,postprocessMs:0,filterMs:0}:await filter(p,key,{...hooks,signal:linked.signal,backend,maxWorkers,nativeGpuRetirement:observer,retirementCacheOwner,onProgress:f=>hooks.onProgress?.(.75*f)}),record=await render(p,base,{...hooks,signal:linked.signal,onProgress:f=>hooks.onProgress?.(.75+.25*f)}),snapshot=gpu?.snapshot(),gpuJobs=cached?0:Math.max(0,(snapshot?.gpu?.calls??0)-beforeGpu),actualBackend=gpuJobs>0?'webgpu':'cpu';return{...record,semantics:p.denoised?'Native16 filtered samples retained exactly in RGB16; the captured Original color transform applies only to display.':'Native16 absolute filter residual before levels*257 or global65536-bin per-channel HE; RGB8 diagnostic presentation only.',provenance:{schema:'sherloq.native-input/1',...native16Descriptor(surface),operation:'noise.separation',numericalInputDepth:16,presentationOutputDepth:8,profileConversion:p.denoised?'none-coded-filter-domain':'none-coded-residual-domain',scientificOutputDepth:p.denoised?16:8,units:NATIVE16_SEPARATION_UNITS},metrics:{...filterMetrics,...record.metrics,backend:actualBackend,gpuJobs,gpu:snapshot?.gpu??null,gpuFallback:snapshot?.gpuFallback??null,inputDepth:16,outputDepth:p.denoised?16:8,sampleMaximum:65535,filterCacheHit:cached,analysisCacheHit:cached,rawResidualBytes:p.denoised?0:n*6,rawResidualStorage:p.denoised?null:base.store.storage,nativeCacheBytes:n*6,nativeCacheKind:p.denoised?'filtered':'absolute-residual',nativeCacheStorage:base.store.storage,histogramBins:BINS,units:NATIVE16_SEPARATION_UNITS}};}finally{if(observer)observer.finish('base-gpu',owner);}})();active=task;void task.finally(()=>{controller.signal.removeEventListener('abort',abort);hooks.signal?.removeEventListener('abort',abort);if(active===task)active=null;}).catch(()=>{});return task;
  },
  dispose(){if(closing)return closing;closed=true;controller.abort();const task=(async()=>{await active?.catch(()=>{});await retire([...retiring,clearBase,clearGpu,()=>unregister?.()]);})();closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;}
 };
 const previousDispose=surface.dispose.bind(surface);let retiringSource;surface.dispose=()=>{if(retiringSource)return retiringSource;const task=retireCompositeOwners([()=>owner.dispose(),previousDispose]);retiringSource=task;void task.catch(()=>{if(retiringSource===task)retiringSource=null;});return task;};return owner;
}
export function runNative16Separation(surface,params={},options={}){requireValue(surface?.descriptor?.format==='rgb16'&&options.budget,'A budgeted native16 separation source is required.');let owner=owners.get(surface);if(!owner){owner=createOwner(surface,options);owners.set(surface,owner);}return owner.run(params,options);}
