import "../../runtime-context.js?v=0.33.3";
import {withRetirementOwner} from './owner-retirement-error.js';
import {acquireEchoDerivativeCache} from './echo-cache.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {echoHeapBytes,echoDerivatives,echoRender} from './echo-math.js';
import {echoLayout,echoExecutionPlan} from './echo-layout.js';
import {EchoWorkers} from './echo-workers.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';

export async function segmentedEcho(image,p,{budget,signal,onProgress,rowsPerBlock,cacheKey,cacheFactory=acquireEchoDerivativeCache,maxWorkers=1,adaptive=new AdaptiveConcurrency(),sourceBinding=image.echoSourceBinding,isSourceCurrent,sourceSurface=image.surface,heldHeapBytes=0}={}){
 const d=image.surface.descriptor,w=d.width,h=d.height,n=w*h,r=p.radius,depth=d.format==='rgb16'?16:8,layout=echoLayout(depth,r),capturedId=d.id,capturedRevision=d.revision;
 const current=()=>{checkAbort(signal);if(depth===16&&(image.surface.descriptor.id!==capturedId||image.surface.descriptor.revision!==capturedRevision||sourceSurface.descriptor.id!==sourceBinding.nativeSurfaceId||sourceSurface.descriptor.revision!==sourceBinding.nativeRevision||!isSourceCurrent?.()))throw new EngineError('SOURCE_CHANGED','Echo native Source authority is no longer current.');};
 if(depth===16){const b=sourceBinding,o=sourceSurface?.descriptor;requireValue(b&&typeof b.imageId==='string'&&typeof b.sourceSurfaceId==='string'&&Number.isSafeInteger(b.sourceRevision)&&typeof b.nativeSurfaceId==='string'&&Number.isSafeInteger(b.nativeRevision)&&/^[a-f0-9]{64}$/.test(b.sourceSha256??'')&&typeof b.profileIdentity==='string'&&typeof isSourceCurrent==='function'&&o?.format==='rgb16'&&o.id===b.nativeSurfaceId&&o.revision===b.nativeRevision&&JSON.stringify([o.color,o.provenance])===b.profileIdentity,'Echo16 requires the exact captured Original binding and profile authority.');sourceBinding=structuredClone(b);}
 current();const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const planOptions={rowsPerBlock,maxWorkers,mainHeapBytes:echoHeapBytes(),heldHeapBytes,ioBytes,readWindowPlan:image.surface.readWindowPlan?.bind(image.surface),readWindowInto:typeof image.surface.readWindowInto==='function'};
 const initial=echoExecutionPlan(d,p,planOptions),targetRows=initial.targetRows,heapRows=initial.heapRows,minimumRows=initial.minimumRows,maximum=initial.maximumWorkers;
 const execution=(count,availableBytes=Number.MAX_SAFE_INTEGER)=>echoExecutionPlan(d,p,{...planOptions,mainHeapBytes:echoHeapBytes(),count,availableBytes});
 const key=w+'/'+h+'/'+r+(depth===16?'/16':''),plan=adaptive.select(key,maximum,budget,c=>execution(c).minimum.additionalWorkingBytes),started=performance.now();
 // The legacy8 cache key is byte-identical. Native16 keys bind raw kind and the
 // complete caller domain/grid binding as well as the actual surface revision.
 const nativeKey=depth===16?JSON.stringify({depth,rawKind:layout.rawKind,id:capturedId,revision:capturedRevision,binding:sourceBinding}):'';
 let count=plan.count,retry=null,executions=0,cacheAllowed=true,cacheRetry=null,totalSourceReads=0;
 const ack=value=>{if(value===false||value===0)throw new EngineError('BUSY','Echo resource retirement was not acknowledged.');return value;};
 async function attempt(){
  let limits=new Float64Array([Infinity,0,Infinity,0,Infinity,0]),blocks=0,workerJobs=0;
  const s={cache:null,raw:null,output:null,planning:null,staging:null,workers:null},loans=new Set(),foreign=new Set(),refused=new Set(),held=[];let disposing;
  const owner={dispose(options={}){
   if(disposing)return disposing;const skip=options.skip??new Set();
   const task=(async()=>{
    const retire=async(object,action)=>{if(skip.has(object))throw new EngineError('BUSY','Echo keeps its refused retirement for explicit retry.');try{ack(await action());}catch(error){const child=error?.cleanupOwner;if(child&&child!==owner&&child!==image.surface)foreign.add(child);throw error;}};
    if(s.workers){await retire(s.workers,()=>s.workers.dispose());s.workers=null;}
    for(const loan of [...loans]){if(loan.child){const child=loan.child;await retire(child,()=>child.dispose());foreign.delete(child);loan.child=null;}if(loan.frame){await retire(loan,()=>loan.frame.release?.());loan.frame=null;}loan.owned?.release();loan.owned=null;loans.delete(loan);}
    for(const child of [...foreign]){await retire(child,()=>child.dispose());foreign.delete(child);}
    for(const name of ['raw','output'])if(s[name]){const value=s[name];await retire(value,()=>value.dispose());s[name]=null;}
    if(s.cache){s.cache.close();s.cache=null;}
    held.length=0;
    for(const name of ['planning','staging'])if(s[name]){s[name]();s[name]=null;}
    return true;
   })();disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task.catch(error=>{throw withRetirementOwner(error,owner,error);});
  }};
  async function retireLoan(loan,primary){
   try{if(loan.child){const child=loan.child;ack(await child.dispose());loan.child=null;}if(loan.frame){ack(await loan.frame.release?.());loan.frame=null;}loan.owned?.release();loan.owned=null;loans.delete(loan);}
   catch(error){refused.add(loan.child??loan);throw withRetirementOwner(primary??error,owner,error);}
  }
  const abort=()=>{const stopped=s.workers?.dispose();stopped?.catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   current();const selected=execution(count),minimumOutput=!image.session&&!image.ensureTemporarySession?n*layout.outputPixelBytes+Math.min(4*1024**2,n*layout.outputPixelBytes):0;
   s.cache=cacheAllowed?cacheFactory(budget,cacheKey&&cacheKey+w+'/'+h+'/'+r+(depth===16?'/'+nativeKey:''),n*layout.rawPixelBytes,selected.target.additionalWorkingBytes+minimumOutput):null;
   if(s.cache?.hit)limits=s.cache.limits;
   s.planning=budget.reserve(selected.minimum.additionalWorkingBytes);
   const storage={budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};
   s.raw=s.cache?.store??await createSegmentedBytes(n*layout.rawPixelBytes,storage);s.output=await createSegmentedBytes(n*layout.outputPixelBytes,storage);s.planning();s.planning=null;
   const actual=execution(count,budget.limit-budget.retained-budget.active),rows=actual.rows;
   if(rows<1)throw new EngineError('MEMORY_LIMIT','Echo staging does not fit the shared budget.');
   s.staging=budget.reserve(actual.selected.stagingBytes);
   if(count>1)s.workers=new EchoWorkers(count,{budget,depth});current();const dispatchAccountedBytes=budget.total();
   async function nativeInput(rect){
    const loan={owned:allocateOwnedTypedArray(Uint16Array,rect.width*rect.height*3,{budget,reserve:()=>()=>{},owner:'echo',label:'echo-owned-native-window'}),frame:null,child:null};loans.add(loan);
    try{
     if(image.surface.readWindowInto)loan.frame=await image.surface.readWindowInto(rect,loan.owned.data,{signal});
     else{loan.frame=await image.surface.readWindow(rect,{signal});requireValue(loan.frame.pixels?.format==='rgb16'&&loan.frame.pixels.data instanceof Uint16Array&&loan.frame.pixels.data.length===loan.owned.data.length,'Echo native window type changed.');loan.owned.data.set(loan.frame.pixels.data);}
     requireValue(loan.frame?.pixels?.format==='rgb16'&&loan.frame.pixels.data instanceof Uint16Array&&loan.frame.pixels.width===rect.width&&loan.frame.pixels.height===rect.height&&loan.frame.pixels.data.length===rect.width*rect.height*3,'Echo native window differs from its admitted grid.');current();const pixels={width:rect.width,height:rect.height,format:'rgb16',data:loan.owned.data};
     // Source ACK precedes transfer. Keep the separately owned input alive until
     // the worker has completed or drained; Original backing is never detached.
     if(loan.frame){try{ack(await loan.frame.release?.());loan.frame=null;}catch(error){refused.add(loan);throw error;}}
     return{pixels,loan};
    }catch(error){if(error?.cleanupOwner&&error.cleanupOwner!==owner&&error.cleanupOwner!==image.surface){loan.child=error.cleanupOwner;refused.add(loan.child);}if(!refused.has(loan)&&!loan.child){try{await retireLoan(loan,error);}catch(cleanup){throw withRetirementOwner(error,owner,cleanup);}throw error;}throw withRetirementOwner(error,owner,error);}
   }
   async function batch(y,kind){
    const jobs=[],batchLoans=[];
    try{
     for(let i=0;i<count&&y+i*rows<h;i++){
      await controlCheckpoint(signal);current();const topY=y+i*rows,coreRows=Math.min(rows,h-topY);let input;
      if(kind==='derivatives'){
       const top=Math.max(0,topY-r),bottom=Math.min(h,topY+coreRows+r);totalSourceReads++;
       if(depth===16){const value=await nativeInput({x:0,y:top,width:w,height:bottom-top});batchLoans.push(value.loan);input={kind,image:value.pixels,start:topY-top,rows:coreRows,radius:r};}
       else{const window=await image.surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal}),loan={frame:window};loans.add(loan);batchLoans.push(loan);input={kind,image:window.pixels,start:topY-top,rows:coreRows,radius:r};}
      }else{
       const length=w*coreRows*layout.rawPixelBytes,owned=allocateOwnedTypedArray(Uint8Array,length,{budget,owner:'echo',label:'echo-owned-raw-window'}),loan={owned};loans.add(loan);batchLoans.push(loan);await s.raw.readInto(owned.data,topY*w*layout.rawPixelBytes);current();input={kind,bytes:owned.data,totalBytes:length,limits,params:p,total:n,...(depth===16?{inputDepth:16,rawKind:layout.rawKind}:{})};
      }
      held.push(input);
      const promise=s.workers?s.workers.call(i,input):kind==='derivatives'?echoDerivatives(input.image,input.start,input.rows,r,{signal}):echoRender(input.bytes,limits,p,n,{signal,depth,rawKind:layout.rawKind}).then(bytes=>({bytes}));
      if(s.workers)workerJobs++;jobs.push(promise.then(value=>({value,y:topY,rows:coreRows}),error=>({error})));
     }
     const results=await Promise.all(jobs);held.push(results);current();
     for(const result of results){
      if(result.error)throw result.error;current();const {value,y:topY,rows:coreRows}=result;
      if(kind==='derivatives'){
       if(depth===16)requireValue(value.inputDepth===16&&value.rawKind===layout.rawKind,'Echo raw representation changed.');
       for(let c=0;c<3;c++){limits[c*2]=Math.min(limits[c*2],value.limits[c*2]);limits[c*2+1]=Math.max(limits[c*2+1],value.limits[c*2+1]);}
       ack(await s.raw.write(value.bytes,topY*w*layout.rawPixelBytes));blocks++;onProgress?.(.7*(topY+coreRows)/h);
      }else{ack(await s.output.write(value.bytes,topY*w*layout.outputPixelBytes));onProgress?.(.7+.3*(topY+coreRows)/h);}
     }
     for(const loan of batchLoans)await retireLoan(loan);held.length=0;
    }catch(error){await Promise.all(jobs);if(error?.cleanupOwner&&error.cleanupOwner!==owner&&error.cleanupOwner!==image.surface){foreign.add(error.cleanupOwner);refused.add(error.cleanupOwner);}throw error;}
   }
   let at=performance.now();if(!s.cache?.hit)for(let y=0;y<h;y+=rows*count)await batch(y,'derivatives');else onProgress?.(.7);
   ack(await s.raw.flush());current();const derivativesMs=s.cache?.hit?0:performance.now()-at;
   at=performance.now();for(let y=0;y<h;y+=rows*count)await batch(y,'render');ack(await s.output.flush());current();const renderMs=performance.now()-at;
   if(s.workers){try{ack(await s.workers.dispose());s.workers=null;}catch(error){refused.add(s.workers);throw error;}}
   try{ack(await s.raw.dispose());s.raw=null;}catch(error){refused.add(s.raw);throw error;}
   s.cache?.commit(limits);const cacheHit=s.cache?.hit??false,cacheBytes=s.cache?.bytes??0;s.cache?.close();s.cache=null;
   current();const nativeMetrics=depth===16?{inputDepth:16,rawKind:layout.rawKind,nativeSourceSurfaceId:capturedId,nativeSourceRevision:capturedRevision,sourceBinding:structuredClone(sourceBinding)}:{};const surface=createRgbSurface(s.output,{width:w,height:h,budget});const published=s.output;s.output=null;try{await owner.dispose();}catch(error){s.output=published;throw error;}
   return{surface,semantics:'Native Echo Laplacian with source-wide per-channel normalization, radius1–15 reflect101 halos, unchanged contrast LUT and optional gray display. Full-resolution oriented pixels.',metrics:{totalMs:performance.now()-started,derivativesMs,renderMs,blocks,sourceReads:totalSourceReads,analysisCacheHit:cacheHit,derivativeCacheStored:cacheBytes>0,derivativeCacheBytes:cacheBytes,derivativeCacheStorage:cacheBytes?'memory':null,rowsPerBlock:rows,workers:count,workerJobs,storage:surface.descriptor.storage,retainedResultBytes:n*layout.outputPixelBytes,arithmeticHeapCapacityBytes:actual.selected.grossHeapBytes,dispatchAccountedBytes,...nativeMetrics}};
  }catch(error){
   const primary=error?.cleanupOwner?error:normalizeResourceError(error);
   if(error?.cleanupOwner&&error.cleanupOwner!==owner&&error.cleanupOwner!==image.surface){foreign.add(error.cleanupOwner);refused.add(error.cleanupOwner);}
   try{await owner.dispose({skip:refused});}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;
  }finally{signal?.removeEventListener('abort',abort);}
 }
 let result;
 for(;;){try{executions++;result=await attempt();break;}catch(error){if(error?.cleanupOwner)throw error;current();if(cacheAllowed&&error.code==='ECHO_CACHE_ALLOCATION'){cacheAllowed=false;cacheRetry={code:error.code,workersPreserved:count};continue;}if(count===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,count,{error});retry={failedWorkers:count,code:error.code??'MEMORY_ALLOCATION'};count=1;}}
 adaptive.observe(key,{count,maximum,milliseconds:performance.now()-started,units:n});result.metrics.scheduling={...plan,taskExecutions:executions,preflightExecutions:0,retry,cacheRetry};return result;
}
