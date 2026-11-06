/* Isolated research implementation; original GRIP-UNINA licence retained. */
import {Budget} from '../cache.js';
import {EngineError,checkAbort,requireValue} from '../errors.js';
import {getExecutionScheduler} from '../execution-scheduler.js';
import {runWithResourceRecovery} from '../resource-recovery.js';
import {allocateOwnedTypedArray,readBlobBytes} from '../allocation.js';
import {createNumericBank} from '../numeric-bank.js';
import {createTemporarySession} from '../temporary-storage.js';
import {cpuMemoryPlan} from './cpu/backend.mjs';
import {streamMemoryPlan} from './cpu/stream-backend.mjs';
import {prepareBanked,fitBankedReplica,mapBanked} from './cpu/banked-analysis.mjs';
import {SplicebusterGpuService} from './gpu/gpu-service.mjs';
import {planPoolTiles,readRawRectangle,rawRectanglePlan} from './gpu/splicebuster-pool-tiles.mjs';
import {ResourceWorkerPool} from './worker-pool.mjs';
import {CPU_RUNTIME,SCIENTIFIC_REVISION} from './assets.mjs';
import {scientificParameters,geometry,planFeatureBands} from './planning.mjs';
import {createSplicebusterRetirement,createSplicebusterRetirementRegistry,createSplicebusterResultOwnership} from './retirement.mjs';

const MiB=1024**2,OWNER='splicebuster';
// Every independent owner must be attempted even when storage cleanup fails.
async function cleanAll(actions){const outcome={failed:false,error:undefined};for(const action of actions)try{await action();}catch(error){if(!outcome.failed){outcome.error=error;outcome.failed=true;}}return outcome;}
function reportCleanup(primary,cleanup,hooks){
 try{hooks.onCleanupError?.(cleanup);}catch{}
 if(primary&&Object.isExtensible(primary))try{primary.details={...primary.details,cleanup:{code:cleanup?.code,message:cleanup?.message??String(cleanup)}};}catch{}
}

/** Shared-budget analyzer intended to run in the existing image host worker.
 * Source accepts owned RGB8, an immutable packed-RGB Blob, or a native surface.
 */
export function createSplicebusterAnalyzer({budget:providedBudget,memoryBudgetBytes=512*MiB,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,
 workerFactory,storage='auto',chunkRows=8192,featureRows,forceStreaming=false,sourceAccounted=false,runtime=CPU_RUNTIME}={}){
 runtime=Object.freeze({...runtime});
 const budget=providedBudget??new Budget(memoryBudgetBytes),ownsBudget=!providedBudget;
 const scheduler=getExecutionScheduler(budget,{maxWorkers});maxWorkers=Math.min(maxWorkers,scheduler.capacity.cpu);
 const front=new ResourceWorkerPool(budget,{kind:'features',maxWorkers,workerFactory});
 const stats=new ResourceWorkerPool(budget,{kind:'statistics',maxWorkers,workerFactory,runtime});
 let gpu,disposed=false,disposing,active,serial=0;const retirements=createSplicebusterRetirementRegistry();let disposalOwners;
 function alive(){if(disposed)throw new EngineError('DISPOSED','Splicebuster analyzer disposed.');}
 async function clearCache(){const outcome=await cleanAll([()=>retirements.drain(),()=>front.clearIdle(),()=>stats.clearIdle(),async()=>{if(gpu&&!active&&!gpu.pendingJobs){await gpu.dispose();gpu=null;}}]);if(outcome.failed)throw outcome.error;}
 async function readSource(source,g,band,signal){
  const {top,height}=band.window;
  if(source.surface){const window=await source.surface.readWindow({x:0,y:top,width:g.width,height},{signal,owner:OWNER});return {data:window.pixels.data,release:window.release};}
  const bytes=height*g.width*3;
  if(source.rgbBlob instanceof Blob){
   requireValue(source.rgbBlob.size===g.width*g.height*3,'Packed RGB Blob length mismatch.');
   const reservation=budget.reserve(bytes);let backing;
   try{const data=await readBlobBytes(source.rgbBlob.slice(top*g.width*3,(top+height)*g.width*3),{label:'sb-source-window'});checkAbort(signal);backing=budget.registerBacking('array-buffer',bytes,{owner:OWNER,label:'sb-source-window',identity:data.buffer});let closed=false;return {data,release(){if(closed)return;closed=true;const retired=backing();reservation();if(retired)budget.notifyBackingRelease('array-buffer',retired);}};}
   catch(error){backing?.();reservation();throw error;}
  }
  requireValue((source.data instanceof Uint8Array||source.data instanceof Uint8ClampedArray)&&source.data.length===g.width*g.height*3,'Packed native RGB8 or a native RGB surface is required.');
  const output=allocateOwnedTypedArray(Uint8Array,bytes,{budget,owner:OWNER,label:'sb-source-window'});
  try{output.data.set(source.data.subarray(top*g.width*3,(top+height)*g.width*3));checkAbort(signal);return output;}catch(error){output.release();throw error;}
 }
 async function analyze(source,parameters={},hooks={}){
  alive();if(active)throw new EngineError('BUSY','Only one Splicebuster analysis may run per analyzer.');
  const params=scientificParameters(parameters),g=geometry(source,params),requestedBackend=hooks.backend??'auto';
  requireValue(['cpu','gpu','webgpu','auto'].includes(requestedBackend),'Unknown backend.');
  const operation=budget.beginOperation({owner:OWNER,id:'analyze/'+(++serial),parent:hooks.resourceOperation});operation.setState('waiting-child');
  const controller=new AbortController(),abort=()=>controller.abort();hooks.signal?.addEventListener('abort',abort,{once:true});if(hooks.signal?.aborted)abort();
  const signal=controller.signal,started=performance.now();
  let finish;const completed=new Promise(resolve=>finish=resolve);active={controller,completed};
  let sourceLease,sourceBacking,session,sessionPromise,prepared,fullPrepared,best,mapOwner,basisOwner,result,failed,hasFailure=false;
  const rangeOwners=[];
  const banks=new Set(),models=[],events=[],timings={featuresMs:0,prepareMs:0,fitMs:0,mapMs:0};
  const progress=async event=>{checkAbort(signal);await hooks.onProgress?.(event);checkAbort(signal);};
  const getSession=async()=>session??(sessionPromise??=(async()=>{session=await createTemporarySession({budget,signal,id:'job-'+crypto.randomUUID()});return session;})());
  const createBank=async(Type,shape,options={})=>{
   const bytes=shape.reduce((a,b)=>a*b,Type.BYTES_PER_ELEMENT),room=budget.limit-budget.total();
   const selected=storage==='auto'?(bytes+48*MiB<room?'memory':'temporary'):storage;
   const bank=await createNumericBank(Type,shape,{budget,storage:selected,signal,getTemporarySession:getSession,owner:OWNER,label:options.label??'sb-scientific-bank',chunkBytes:MiB});banks.add(bank);return bank;
  };
  const drop=async bank=>{if(bank){await bank.dispose();banks.delete(bank);}};
  const task=async(pool,op,inputs,bounds)=>{
   const ticket=budget.beginOperation({owner:OWNER,id:'task/'+op+'/'+(++serial),parent:operation});ticket.setState('waiting-child');
   try{return await runWithResourceRecovery(()=>pool.run(op,inputs,{...bounds,signal,parent:ticket}),{budget,signal,owner:OWNER,resourceOperation:ticket,operation:'sb/'+op});}
   finally{ticket.release();}
  };
  const statsRun=async(op,inputs,extra={})=>{
   const rows=inputs.valid?.length??(inputs.training?.length?inputs.training.length/25:0),nAll=inputs.nAll??rows,nValid=inputs.nValid??rows;
   let plan;
   if(['prepare','fitReplica','map'].includes(op))plan=cpuMemoryPlan({operation:op==='fitReplica'?'fit':op,nAll:Math.max(1,nAll),nValid:Math.max(1,nValid),replicates:params.replicates});
   else plan=streamMemoryPlan({operation:op==='meanFromMoments'?'initialModel':op,rows});
   return task(stats,op,inputs,{heapMaximumBytes:plan.heapMaximumBytes,outputBytes:plan.outputBytes,phase:extra.phase??op});
  };
  try{
   await retirements.drain();checkAbort(signal);if(!sourceAccounted&&!source.surface){
    const bytes=source.data?.buffer.byteLength??g.width*g.height*3;sourceLease=budget.reserve(bytes);
    if(source.data)sourceBacking=budget.registerBacking('array-buffer',bytes,{owner:OWNER,label:'sb-borrowed-input',identity:source.data.buffer});
   }
   let backend=requestedBackend,reason=null;
   if(backend!=='cpu'){
    gpu??=new SplicebusterGpuService(budget,{workerFactory});
    try{await gpu.initialize({signal,parent:operation});backend='gpu';}
    catch(error){if(backend!=='auto'||!['UNSUPPORTED_BACKEND','GPU_DEVICE_LOST','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code))throw error;reason={code:error.code,message:error.message};await gpu.dispose();gpu=null;backend='cpu';}
   }
   const featureStart=performance.now(),spam=await createBank(Float32Array,[g.cells,50],{label:'sb-spam'}),valid=await createBank(Uint8Array,[g.cells],{label:'sb-valid'});
   let nValid=0,completedBands=0,gpuFeatureEnabled=backend==='gpu',gpuBands=0,cpuBands=0;
   const backendRecoveries=[];
   const featurePlan=planFeatureBands(g,params,{availableBytes:budget.limit-budget.total(),maxWorkers,backend,targetRows:featureRows});
   const iterator=featurePlan.bands();
   const writePooled=async(local,top,left=0)=>{
    const [rows,cols]=local.shape;
    for(let y=0;y<rows;y++){
     const at=(top+y)*g.cols+left,from=y*cols;
     await spam.write(local.spam.subarray(from*50,(from+cols)*50),at*50,{signal});
     await valid.write(local.valid.subarray(from,from+cols),at,{signal});
    }
    let count=0;for(const value of local.valid)count+=value;return count;
   };
   const oneBand=async band=>{
    let window,raw,pooled,bandValid=0;
    const bandBackend=gpuFeatureEnabled?'gpu':'cpu';
    const poolOnCpu=async()=>{
     const plainRaw=Object.fromEntries(Object.entries(raw).filter(([key])=>!['release','timing'].includes(key)));
     pooled=await task(front,'poolRows',{raw:plainRaw,options:{stride:g.stride,ksize:g.ksize,saturationProb:params.saturationProb}},
      {outputBytes:band.poolBytes});
     return writePooled(pooled,band.top);
    };
    try{
     window=await readSource(source,g,band,signal);
     raw=await task(front,'prepareRaw',{rgb:window.data,width:g.width,height:band.window.height,imageWidth:g.width,imageHeight:g.height,originY:band.window.top,
      rawRowStart:band.top,rawRowCount:band.rows+g.ky-1,stride:g.stride,ksize:g.ksize,dropSaturated:params.flagDropSaturated!==0},
      {workspaceBytes:band.raw.grayBytes+band.raw.workspaceBytes+8192,outputBytes:band.raw.outputBytes});
     window.release();window=null;
     if(bandBackend==='cpu'){
      bandValid=await poolOnCpu();cpuBands++;
     }else{
      try{
      const tiles=planPoolTiles(raw.shape,{ky:g.ky,kx:g.kx,limits:gpu.limits,maximumGpuBytes:Math.max(1,Math.min(32*MiB,(budget.limit-budget.total())/2)),maximumHostWorkingBytes:32*MiB});
      for(const rect of tiles.rectangles()){
       const copy=rawRectanglePlan(raw,rect);let packedSpam,packedWeights,part,sums,normalized;
       try{
        if(copy.allocationBytes){packedSpam=allocateOwnedTypedArray(Float32Array,copy.inputBytes/4,{budget,owner:OWNER,label:'sb-gpu-rectangle'});packedWeights=allocateOwnedTypedArray(Float32Array,copy.weightBytes/4,{budget,owner:OWNER,label:'sb-gpu-rectangle-weights'});}
        part=readRawRectangle(raw,rect,packedSpam?{spam:packedSpam.data,weights:packedWeights.data}:undefined);
        sums=await gpu.pool(part,{ky:g.ky,kx:g.kx,maximumGpuBytes:rect.plan.gpuBytes,signal,parent:operation,onProgress:e=>{if(events.length<128)events.push({phase:e.phase??e.event,at:performance.now()-started});}});
        normalized=await task(front,'normalize',{sums:sums.sums,outRows:rect.outputRows,outCols:rect.outputCols,features:50,rawRowStart:band.top+rect.top,stride:g.stride,ksize:g.ksize,saturationProb:params.saturationProb},
         {outputBytes:rect.outputRows*rect.outputCols*205+8*(rect.outputRows+rect.outputCols)});
        bandValid+=await writePooled(normalized,band.top+rect.top,rect.left);
       }finally{normalized?.release();sums?.release();part=null;packedSpam?.release();packedWeights?.release();}
      }
      gpuBands++;
      }catch(error){
       // All siblings have disjoint global rows. Retry this entire band and
       // commit its validity count once, overwriting any partial GPU tiles.
       if(!['GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_DEVICE_LOST'].includes(error?.code))throw error;
       checkAbort(signal);gpuFeatureEnabled=false;
       const incident={code:error.code,message:error.message,bandTop:band.top,bandRows:band.rows,recovery:'exact-cpu-band'};
       backendRecoveries.push(incident);reason??=incident;
       bandValid=await poolOnCpu();cpuBands++;
      }
     }
     nValid+=bandValid;
     operation.commit();await progress({phase:'features',completed:++completedBands,total:Math.ceil(g.rows/featurePlan.rows)});
    }finally{window?.release();pooled?.release();raw?.release();}
   };
   let firstFailure,featureFailed=false;
   const outcomes=await Promise.allSettled(Array.from({length:featurePlan.concurrency},async()=>{try{for(;;){checkAbort(signal);const next=iterator.next();if(next.done)return;await oneBand(next.value);}}catch(error){if(!featureFailed){firstFailure=error;featureFailed=true;}controller.abort();throw error;}}));
   if(outcomes.some(x=>x.status==='rejected'))throw firstFailure;
   await spam.flush();await valid.flush();front.clearIdle();timings.featuresMs=performance.now()-featureStart;
   if(backend==='gpu'&&!gpuBands)backend='cpu';
   if(!nValid){
    await drop(spam);await drop(valid);
    let closed=false;
    result={data:{width:g.width,height:g.height,map:new Float64Array(),valid:new Uint8Array(),range0:new Float64Array(),range1:new Float64Array(),mapShape:[0,0],metadata:{method:'Splicebuster',abstained:true,reason:'no-valid-cells',params}},provenance:{scientificRevision:SCIENTIFIC_REVISION,backend},metrics:{...timings,totalMs:performance.now()-started},pin(){requireValue(!closed,'Released result cannot be pinned.');return async()=>{};},release:async()=>{closed=true;}};
    return result;
   }
   const prepareStart=performance.now(),fullPlan=cpuMemoryPlan({operation:'prepare',nAll:g.cells,nValid,replicates:params.replicates});
   const fullNeed=fullPlan.heapMaximumBytes+4*MiB+2*runtime.bytes+g.cells*201+fullPlan.inputBytes+2*fullPlan.outputBytes;
   // Retire acknowledged idle caches before choosing the slower banked path.
   // The shared coordinator preserves live sources/results and never treats
   // an asynchronous disposal request as already released memory.
   if(!forceStreaming&&fullNeed<=budget.limit&&fullNeed>budget.limit-budget.total())
    await budget.reclaim(fullNeed,{signal,owner:OWNER,operation});
   const streaming=forceStreaming||fullNeed>budget.limit-budget.total();
   if(streaming)prepared=await prepareBanked({spam,valid,nAll:g.cells,budget,createBank,run:statsRun,chunkRows,params,signal,onProgress:progress});
   else{
    const features=await spam.readRows(0,g.cells,{signal});let flags;
    try{flags=await valid.readRows(0,g.cells,{signal});fullPrepared=await statsRun('prepare',{spam:features.data,valid:flags.data,nAll:g.cells,nValid,shape:[g.rows,g.cols,50],seed:params.seed,replicates:params.replicates});prepared=fullPrepared;}
    finally{features.release();flags?.release();}
   }
   timings.prepareMs=performance.now()-prepareStart;await drop(spam);
   const fitStart=performance.now(),fitPlan=streaming?streamMemoryPlan({operation:'expectationChunk',rows:Math.min(chunkRows,nValid)}):cpuMemoryPlan({operation:'fit',nAll:g.cells,nValid});
   // Banked EM also owns a posterior bank for the whole valid population and
   // host read windows while the worker's cloned input is live. These are
   // independent of the kernel heap and must constrain replica parallelism.
   const fitRows=Math.min(chunkRows,nValid);
   const replicaHostBytes=streaming?fitRows*(25+2)*8+256*1024:0;
   const replicaPosteriorBytes=streaming&&storage!=='temporary'?nValid*2*8:0;
   const perWorker=fitPlan.heapMaximumBytes+4*MiB+2*runtime.bytes+fitPlan.inputBytes+2*fitPlan.outputBytes+replicaHostBytes+replicaPosteriorBytes;
   const concurrency=Math.max(1,Math.min(maxWorkers,params.replicates,Math.floor((budget.limit-budget.total()+stats.snapshot().retainedBytes)/perWorker)));
   let nextReplica=0,finishedFits=0,firstFitFailure,fitFailed=false;
   const fits=await Promise.allSettled(Array.from({length:concurrency},async()=>{try{while(nextReplica<params.replicates){const index=nextReplica++;checkAbort(signal);
    models[index]=streaming?await fitBankedReplica({prepared,index,run:statsRun,createBank,budget,chunkRows,params,signal,onProgress:progress}):
     await statsRun('fitReplica',{training:prepared.training,nValid,initialIndex:prepared.initialIndices[index],variance:prepared.variance,maxIter:params.maxIter,relErr:1e-5,outliersNlogl:params.outliersNlogl},{phase:'fit-'+index});
    operation.commit();await progress({phase:'fit',completed:++finishedFits,total:params.replicates});
   }}catch(error){if(!fitFailed){firstFitFailure=error;fitFailed=true;}controller.abort();throw error;}}));
   if(fits.some(x=>x.status==='rejected'))throw firstFitFailure;
   let bestIndex=0;for(let i=1;i<models.length;i++)if(models[i].score>models[bestIndex].score)bestIndex=i;
   best=models[bestIndex];for(let i=0;i<models.length;i++)if(i!==bestIndex){await models[i]?.release?.();models[i]=null;}
   timings.fitMs=performance.now()-fitStart;
   const mapStart=performance.now();let map,minimum=Infinity,maximum=-Infinity;
   if(streaming){
    map=await createBank(Float64Array,[g.cells],{label:'sb-mahalanobis'});
    const extrema=await mapBanked({prepared,model:best,valid,map,run:statsRun,budget,chunkRows,params,signal});minimum=extrema.min;maximum=extrema.max;
   }else{
    mapOwner=await statsRun('map',{projected:prepared.projected,nAll:g.cells,mu:best.mu,Sigma:best.Sigma});map=mapOwner.map;
    const flags=await valid.readRows(0,g.cells,{signal});let lease;
    try{lease=await scheduler.acquire({cpu:1,signal,operation,label:'splicebuster/final-map'});
     for(let i=0;i<map.length;i++){if(params.flagDropSaturated>1&&!flags.data[i])map[i]=NaN;else{requireValue(Number.isFinite(map[i]),'Splicebuster produced a non-finite unmasked score.');minimum=Math.min(minimum,map[i]);maximum=Math.max(maximum,map[i]);}}
    }finally{lease?.release();flags.release();}
   }
   basisOwner=allocateOwnedTypedArray(Float64Array,50*25,{budget,owner:OWNER,label:'sb-final-basis'});basisOwner.data.set(prepared.basis);
   if(streaming)await prepared.release();else fullPrepared.release();prepared=fullPrepared=null;
   timings.mapMs=performance.now()-mapStart;
   const range0=allocateOwnedTypedArray(Float64Array,g.rows,{budget,owner:OWNER,label:'sb-range0'});rangeOwners.push(range0);
   const range1=allocateOwnedTypedArray(Float64Array,g.cols,{budget,owner:OWNER,label:'sb-range1'});rangeOwners.push(range1);
   const origin=4+(g.stride-1)/2+(g.ky-1)*g.stride/2;for(let i=0;i<g.rows;i++)range0.data[i]=origin+i*g.stride;for(let i=0;i<g.cols;i++)range1.data[i]=origin+i*g.stride;
   const meta={method:'Splicebuster',params,stride:g.stride,ksize:g.ksize,seed:params.seed,replicates:params.replicates,maxIterations:params.maxIter,validCells:nValid,totalCells:g.cells,streaming,fitWorkers:concurrency,bestReplicate:bestIndex,minimum:Number.isFinite(minimum)?minimum:null,maximum:Number.isFinite(maximum)?maximum:null,abstained:false,featureBackends:{cpuBands,gpuBands},backendRecoveries};
   const ownedMap=mapOwner,ownedModel=best,ownedBasis=basisOwner,ownedSession=session;
   const ownership=createSplicebusterResultOwnership(createSplicebusterRetirement({independent:[()=>ownedMap?.release(),()=>ownedModel?.release?.(),()=>ownedBasis.release(),()=>range0.release(),()=>range1.release()],children:[()=>map.dispose?.(),()=>valid.dispose()],parents:[()=>ownedSession?.dispose()]}),retirements.retire);
   result={data:{width:g.width,height:g.height,map,valid,range0:range0.data,range1:range1.data,mapShape:[g.rows,g.cols],mu:ownedModel.mu,Sigma:ownedModel.Sigma,L:ownedBasis.data,outliersProb:ownedModel.outliersProb,metadata:meta},
    provenance:{scientificRevision:SCIENTIFIC_REVISION,backend,backendSelectionReason:reason,sourceSha256:source.sha256??null,runtimeSha256:runtime.sha256,numericType:'CPU f64 statistics; exact f32 features'},
    metrics:{...timings,totalMs:performance.now()-started,featurePlan:{rows:featurePlan.rows,concurrency:featurePlan.concurrency},workers:stats.snapshot(),memory:budget.snapshot(),temporaryStorage:session?.snapshot()??null,execution:scheduler.snapshot(),gpuEvents:events.slice(0,128)},
    pin:ownership.pin,release:ownership.release};
   // Transfer rollback ownership only after every metadata/snapshot read and
   // the complete result object have been constructed successfully.
   mapOwner=best=basisOwner=null;banks.delete(map);banks.delete(valid);session=null;
   operation.commit();checkAbort(signal);return result;
  }catch(error){failed=error;hasFailure=true;if(result){const cleanup=await cleanAll([()=>result.release()]);if(cleanup.failed)reportCleanup(error,cleanup.error,hooks);}throw error;}
  finally{
   controller.abort();hooks.signal?.removeEventListener('abort',abort);
   let cleanupError;
   try{
    const independent=[],children=[];
    if(!result){independent.push(()=>mapOwner?.release(),()=>basisOwner?.release(),...rangeOwners.map(owner=>()=>owner.release()));children.push(()=>prepared?.release?.(),()=>prepared!==fullPrepared?fullPrepared?.release():undefined,...models.map(model=>()=>model?.release?.()));}
    children.push(...[...banks].map(bank=>()=>bank.dispose()));
    const rollback=createSplicebusterRetirement({independent,children,parents:[()=>session?.dispose()],final:[()=>{const retired=sourceBacking?.();if(retired)budget.notifyBackingRelease('array-buffer',retired);},()=>sourceLease?.(),()=>operation.release()]});
    cleanupError=await cleanAll([()=>retirements.retire(rollback)]);
    if(cleanupError.failed&&!hasFailure&&result)await cleanAll([()=>result.release()]);
    if(cleanupError.failed)reportCleanup(failed,cleanupError.error,hooks);
   }finally{active=null;finish();}
   if(cleanupError.failed&&!hasFailure)throw cleanupError.error;
  }
 }
 return {analyze,clearCache,budget,scheduler,
  memory:()=>({...budget.snapshot(),resources:budget.resourceSnapshot(),execution:scheduler.snapshot()}),
  dispose(){if(disposing)return disposing;disposed=true;active?.controller.abort();const task=(async()=>{await active?.completed;disposalOwners??=createSplicebusterRetirement({independent:[()=>front.dispose(),()=>stats.dispose(),async()=>{await gpu?.dispose();gpu=null;}],children:[()=>retirements.drain()],final:[()=>{if(ownsBudget)scheduler.dispose();}]});await disposalOwners.release();})();disposing=task.finally(()=>{disposing=null;});return disposing;}};
}
