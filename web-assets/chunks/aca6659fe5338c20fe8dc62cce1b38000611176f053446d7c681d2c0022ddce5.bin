import "../runtime-context.js?v=0.25.0";
import {getExecutionScheduler} from '../unified-engine/src/execution-scheduler.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../unified-engine/src/worker-message-protocol.js';
import {analyzeComprintStreaming} from './comprint-streaming-statistics.js';
import {analyzeComprintNativePopulation} from './comprint-native-population-statistics.js';
const MiB=1024**2,BASE=new URL('./comprint-statistics/',import.meta.url),ARCHIVE_SHA='857ce24f89f3fd87aec58de96b72024f9343910f69b9ae2502b9cb00eb435ec9',FACTORY_SHA='7ac81fc7c1341c3112637600fff87732431d5db7b9621bdced27a6853372e4db',KERNEL_SHA='a02c911e72ce1f7de3c6b875193163bbb3037eaa6a2947d6c95bdcc1ceb5f171';
const CHUNKED_SHA='60fd6404eba954ab44a2bded01fb601bb33f4f88acb72a22ffe658966dc6c7a0';
const tensor=(data,dims=[data.length])=>({data,dims});
export function createComprintParallelStatistics({runtimeURL=new URL('pyodide/',BASE).href,budget,scheduler,acquireExecution,maxWorkers=4,mainHeapBytes=768*MiB,fitHeapBytes=256*MiB,getTemporarySession,workerFactory=url=>new Worker(url,{type:'module'})}={}){
 scheduler??=budget?getExecutionScheduler(budget):null;let slots=[],active=false,next=1,tail=Promise.resolve(),generation=0,disposed=false,pendingJobs=0;
 const acquire=acquireExecution??(scheduler?({signal})=>scheduler.acquire({cpu:1,signal,resourceOwner:'comprint-statistics',label:'comprint-SPAM-PCA-EM'}):async()=>({release(){}}));
 function slot(role,overrideHeapBytes){
  const heapBytes=overrideHeapBytes??(role==='main'?mainHeapBytes:fitHeapBytes),downloadBound=role==='fit'?96*MiB:200*MiB,resident=heapBytes+downloadBound*2+8*MiB;
  if(budget)budget.retain(resident);
  let worker;try{worker=workerFactory(new URL('./comprint-statistics-worker.js',import.meta.url));}catch(e){if(budget)budget.retained-=resident;throw e;}
  const backing=budget?.registerBacking?.('wasm',heapBytes,{owner:'comprint-statistics',label:'comprint-'+role,state:'reserved'}),s={worker,role,heapBytes,resident,backing,pending:null};slots.push(s);return s;
 }
 function retire(s){if(!slots.includes(s))return;s.worker.terminate();s.pending?.reject(new DOMException('Comprint cancelled','AbortError'));s.pending=null;const retired=s.backing?.();if(retired)budget?.notifyBackingRelease?.('wasm',retired);if(budget)budget.retained-=s.resident;slots=slots.filter(value=>value!==s);}
 function clearWorkers(){for(const s of [...slots])retire(s);}
 function retireFits(){for(const s of slots.filter(s=>s.role==='fit'))retire(s);}
 function retireFeatures(){for(const s of slots.filter(s=>s.role==='feature'))retire(s);}
 async function retireIdleRole(role,options){await Promise.all(slots.filter(s=>s.role===role).map(async s=>{let timeout;try{await Promise.race([call(s,'release_state',{},options),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Comprint worker retirement acknowledgement timed out')),10000);})]);}finally{clearTimeout(timeout);retire(s);}}));}
 function featureSlots(count){let features=slots.filter(s=>s.role==='feature');for(const extra of features.slice(count))retire(extra);features=features.slice(0,count);while(features.length<count)features.push(slot('feature',512*MiB));return features;}
 function fitSlots(count,heapBytes=fitHeapBytes){let fits=slots.filter(s=>s.role==='fit');for(const s of fits)if(s.heapBytes!==heapBytes)retire(s);fits=slots.filter(s=>s.role==='fit');for(const extra of fits.slice(count))retire(extra);fits=fits.slice(0,count);while(fits.length<count)fits.push(slot('fit',heapBytes));return fits;}
 async function call(s,operation,inputs,{signal,onProgress}={}){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(s.pending)throw Error('Comprint worker busy');const id=next++;let lease,protocol,workerError,settled=false,admitting=false;
  try{return await new Promise((resolve,reject)=>{
   const finish=(fn,value)=>{if(settled)return;settled=true;protocol?.dispose();if(s.worker.onerror===workerError)s.worker.onerror=null;fn(value);};
   const fail=error=>finish(reject,error),bad=reason=>{throw workerMessageFailure('Comprint statistics','message',reason);};
   const validHeap=value=>Number.isSafeInteger(value)&&value>0&&value<=s.heapBytes;
   s.pending={id,reject:fail};
   protocol=installWorkerMessageProtocol(s.worker,data=>{
    if(settled)return;
    if(!Number.isSafeInteger(data.id)||data.id<1)bad('invalid-id');if(data.id!==id)return;
    if(data.executionReady!==undefined){
     if(data.executionReady!==true||!validHeap(data.heapBytes)||data.progress!==undefined||data.error!==undefined||data.outputs!==undefined||admitting||lease)bad('invalid-execution-ready');
     admitting=true;s.backing?.materialize(data.heapBytes);
     Promise.resolve().then(()=>acquire({cpu:1,wasmBytes:s.heapBytes,actualHeapBytes:data.heapBytes,signal})).then(value=>{if(settled||!s.pending||s.pending.id!==id){value?.release?.();return;}lease=value;protocol.post({id,command:'execute'});}).catch(fail);return;
    }
    if(data.progress!==undefined){if(!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress)||typeof data.progress.phase!=='string'||data.error!==undefined||data.outputs!==undefined)bad('invalid-progress');onProgress?.(data.progress);return;}
    if(data.error!==undefined){if(!data.error||typeof data.error!=='object'||Array.isArray(data.error)||typeof data.error.message!=='string'||data.outputs!==undefined)bad('invalid-error');const e=new Error(data.error.message);Object.assign(e,data.error);fail(e);return;}
    if(!data.outputs||typeof data.outputs!=='object'||Array.isArray(data.outputs)||!data.metadata||typeof data.metadata!=='object'||!validHeap(data.metadata.runtime?.heapBytes))bad('invalid-result');
    for(const value of Object.values(data.outputs)){if(!ArrayBuffer.isView(value?.data)||value.data instanceof DataView||!Array.isArray(value.dims)||value.dims.some(v=>!Number.isSafeInteger(v)||v<0)||!Number.isSafeInteger(value.dims.reduce((a,b)=>a*b,1))||value.dims.reduce((a,b)=>a*b,1)!==value.data.length)bad('invalid-output-geometry');}
    s.actualHeapBytes=data.metadata.runtime.heapBytes;s.backing?.materialize(s.actualHeapBytes);finish(resolve,data);
   },{label:'Comprint statistics',onFailure:fail});
   workerError=e=>fail(new Error(e.message));s.worker.onerror=workerError;
   try{protocol.post({id,operation,inputs,role:s.role,heapBytes:s.heapBytes,runtimeURL,factoryURL:new URL('pyodide-factory.js',BASE).href,factorySha256:FACTORY_SHA,archiveURL:new URL('comprint-statistics.zip',BASE).href,archiveSha256:ARCHIVE_SHA,kernelURL:new URL('kernel.py',BASE).href,kernelSha256:KERNEL_SHA,chunkedURL:new URL('em_chunked.py',BASE).href,chunkedSha256:CHUNKED_SHA});}catch(error){fail(error);}
  });}finally{protocol?.dispose();if(s.worker.onerror===workerError)s.worker.onerror=null;lease?.release?.();s.pending=null;}
 }

 function rows(t,indices){const stride=t.data.length/t.dims[0],data=new t.data.constructor(indices.length*stride);for(let j=0;j<indices.length;j++)data.set(t.data.subarray(indices[j]*stride,(indices[j]+1)*stride),j*stride);return tensor(data,[indices.length,...t.dims.slice(1)]);}
 async function analyzeNow(luminance,fingerprint,width,height,{signal,onProgress,maxWorkers:requestedWorkers=maxWorkers,segmented=width*height>2*1024**2,getTemporarySession:temporaryProvider=getTemporarySession,temporarySession,storage='temporary',featureBlockColumns=256,chunkedEM=true}={}){
  if(active)throw Error('Comprint statistics busy');if(!(luminance instanceof Float32Array)||!(fingerprint instanceof Float32Array)||luminance.length!==width*height||fingerprint.length!==width*height)throw Error('Matching full-image Comprint luminance/fingerprint required');active=true;signal?.addEventListener('abort',clearWorkers,{once:true});const started=performance.now();let hostReservation;
  try{
   if(!Number.isFinite(requestedWorkers)||requestedWorkers<1)throw Error('Comprint maxWorkers must be positive');
   const admittedWorkers=Math.min(Math.max(1,Math.trunc(requestedWorkers)),Math.max(1,Math.trunc(maxWorkers)),scheduler?.capacity?.cpu??6,6);
   if(segmented){
    retireFits();const main=slots.find(s=>s.role==='main')??slot('main');
    const result=await analyzeComprintStreaming({luminance,fingerprint,width,height,main,call,fitSlots,retireFits:()=>retireIdleRole('fit',{signal,onProgress}),featureSlots,retireFeatures:()=>retireIdleRole('feature',{signal,onProgress}),resourceSnapshot:()=>({budget:budget?.snapshot(),workers:slots.map(s=>({role:s.role,maximumHeapBytes:s.heapBytes,materializedHeapBytes:s.actualHeapBytes??null,residentBytes:s.resident}))}),budget,getTemporarySession:temporaryProvider,temporarySession,storage,signal,onProgress,maxWorkers:admittedWorkers,blockColumns:featureBlockColumns,chunkedEM});
    result.metadata.resourceAdmission={boundedHeaps:true,mainHeapBytes,fitHeapBytes:slots.filter(s=>s.role==='fit').map(s=>s.heapBytes),retainedUntilClear:Boolean(budget),residentBytes:slots.reduce((n,s)=>n+s.resident,0),scheduler:Boolean(acquireExecution||scheduler)};return result;
   }
   hostReservation=budget?.reserve(width*height*128+64*MiB);
   let main=slots.find(s=>s.role==='main')??slot('main');
   onProgress?.({phase:'comprint-global-features'});const prep=await call(main,'prepare',{luminance:tensor(luminance,[height,width]),fingerprint:tensor(fingerprint,[height,width])},{signal,onProgress});
   const count=prep.outputs.features.dims[0],workers=Math.min(admittedWorkers,Math.max(1,Math.floor(count/50))),fits=fitSlots(workers);
   const covarianceStarted=performance.now(),step=Math.ceil(count/workers);onProgress?.({phase:'comprint-global-covariance',workers});
   const cov=await Promise.all(fits.map((s,i)=>{const begin=i*step,end=Math.min(count,begin+step);return call(s,'covariance',{features:tensor(prep.outputs.features.data.slice(begin*512,end*512),[end-begin,512]),mean:prep.outputs.mean},{signal,onProgress});}));
   const covariances=new Float64Array(workers*512*512);cov.forEach((c,i)=>covariances.set(c.outputs.covariance.data,i*512*512));const covarianceSeconds=(performance.now()-covarianceStarted)/1000;
   onProgress?.({phase:'comprint-global-basis'});const basis=await call(main,'basis',{covariances:tensor(covariances,[workers,512,512])},{signal,onProgress});
   const emStarted=performance.now();onProgress?.({phase:'comprint-independent-em',workers,replicates:10});const batches=await Promise.all(fits.map((s,j)=>{const indices=Array.from({length:10},(_,i)=>i).filter(i=>i%workers===j);return call(s,'fit',{indices:tensor(Int32Array.from(indices)),training:basis.outputs.training,mu:rows(basis.outputs.mu,indices),Sigma:rows(basis.outputs.Sigma,indices),prior:rows(basis.outputs.prior,indices)},{signal,onProgress});}));
   const candidates=new Array(10);for(const batch of batches)for(let at=0;at<batch.outputs.indices.data.length;at++){const i=batch.outputs.indices.data[at];candidates[i]={batch,at,score:batch.outputs.score.data[at]};}
   let best=0;for(let i=1;i<10;i++)if(candidates[i].score>candidates[best].score)best=i;if(!Number.isFinite(candidates[best].score))throw Error('Comprint EM did not produce a finite winning likelihood');
   const chosen=candidates[best],part=chosen.batch.outputs,at=chosen.at,emSeconds=(performance.now()-emStarted)/1000;
   const pick=t=>{const r=rows(t,[at]);return tensor(r.data,r.dims.slice(1));};onProgress?.({phase:'comprint-global-map'});
   const result=await call(main,'finish',{mu:pick(part.mu),Sigma:pick(part.Sigma),prior:pick(part.prior),outlier:tensor(Float64Array.of(part.outlier.data[at]))},{signal,onProgress});
   result.metadata.timings_seconds.covariance_parallel=covarianceSeconds;result.metadata.timings_seconds.em_parallel=emSeconds;result.metadata.timings_seconds.total=(performance.now()-started)/1000;
   result.metadata.parallel={workers,initial_indices:Array.from(basis.outputs.initial_indices.data),winning_replicate:best,likelihoods:candidates.map(c=>c.score),em_fit_seconds:batches.map(b=>b.metadata.fit_seconds),covariance_rows:cov.map(c=>c.metadata.rows),covariance_seconds:cov.map(c=>c.metadata.seconds),basis_runtime_load_seconds:basis.metadata.runtimeLoadSeconds};
   result.metadata.resourceAdmission={boundedHeaps:true,mainHeapBytes,fitHeapBytes,retainedUntilClear:Boolean(budget),residentBytes:slots.reduce((n,s)=>n+s.resident,0),scheduler:Boolean(acquireExecution||scheduler)};return result;
  }catch(error){clearWorkers();throw error;}finally{hostReservation?.();active=false;signal?.removeEventListener('abort',clearWorkers);}
 }
 function clear(){generation++;clearWorkers();}
 function analyze(luminance,fingerprint,width,height,options={}){
  if(disposed)return Promise.reject(new Error('Comprint statistics disposed'));
  const expectedGeneration=generation,requested=performance.now();
  if(pendingJobs)options.onProgress?.({phase:'comprint-queued',pending:pendingJobs});pendingJobs++;
  const job=tail.then(async()=>{
   if(disposed||expectedGeneration!==generation||options.signal?.aborted)throw new DOMException('Comprint queued analysis cancelled','AbortError');
   const queueWait=(performance.now()-requested)/1000;
   const result=await analyzeNow(luminance,fingerprint,width,height,options);
   result.metadata.timings_seconds.queue_wait=queueWait;return result;
  }).finally(()=>{pendingJobs--;});
  tail=job.catch(()=>{});return job;
 }
 function analyzeContexts(contexts,options={}){
  if(disposed)return Promise.reject(new Error('Comprint statistics disposed'));
  const expectedGeneration=generation,requested=performance.now();if(pendingJobs)options.onProgress?.({phase:'comprint-queued',pending:pendingJobs});pendingJobs++;
  const job=tail.then(async()=>{
   if(disposed||expectedGeneration!==generation||options.signal?.aborted)throw new DOMException('Comprint queued contexts cancelled','AbortError');
   if(active)throw Error('Comprint statistics busy');active=true;options.signal?.addEventListener('abort',clearWorkers,{once:true});
   try{
    const requestedWorkers=options.maxWorkers??maxWorkers;if(!Number.isFinite(requestedWorkers)||requestedWorkers<1)throw Error('Comprint maxWorkers must be positive');
    const admittedWorkers=Math.min(Math.max(1,Math.trunc(requestedWorkers)),Math.max(1,Math.trunc(maxWorkers)),scheduler?.capacity?.cpu??6,6);
    retireFits();const main=slots.find(s=>s.role==='main')??slot('main');
    const result=await analyzeComprintNativePopulation({...options,contexts,main,call,fitSlots,retireFits:()=>retireIdleRole('fit',options),featureSlots,retireFeatures:()=>retireIdleRole('feature',options),resourceSnapshot:()=>({budget:budget?.snapshot(),workers:slots.map(s=>({role:s.role,maximumHeapBytes:s.heapBytes,materializedHeapBytes:s.actualHeapBytes??null,residentBytes:s.resident}))}),budget,getTemporarySession:options.getTemporarySession??getTemporarySession,maxWorkers:admittedWorkers});
    if(disposed||expectedGeneration!==generation||options.signal?.aborted)throw new DOMException('Comprint native population cancelled','AbortError');
    result.metadata.resourceAdmission={boundedHeaps:true,mainHeapBytes,retainedUntilClear:Boolean(budget),residentBytes:slots.reduce((n,s)=>n+s.resident,0),scheduler:Boolean(acquireExecution||scheduler)};result.metadata.timings_seconds.queue_wait=(performance.now()-requested)/1000-result.metadata.timings_seconds.total;return result;
   }catch(error){clearWorkers();throw error;}finally{active=false;options.signal?.removeEventListener('abort',clearWorkers);}
  }).finally(()=>{pendingJobs--;});tail=job.catch(()=>{});return job;
 }
 return {analyze,analyzeContexts,clear,dispose(){disposed=true;clear();}};
}
