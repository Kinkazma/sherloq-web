import "../../runtime-context.js?v=0.30.0";
import {ClassicSiftNativeWorkerOwner} from './classic-sift-native-owner.js';
import {ClassicPagedSiftFeatureEngine} from './classic-sift-paged.js';
import {classicSiftRetireAll,attachClassicSiftCleanup,withClassicSiftCleanup,classicSiftOwnedRelease,classicSiftRetirement} from './classic-sift-retirement.js';
import {initialSparseExtractionHeap} from './sparse-extract-heap.js';
import {SPARSE_EXTRACT_SIMD_WASM} from './sparse-extract-simd-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {deserializeWorkerError,serializeEngineError,resourceAllocationKind} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {m3ImageShape} from './m3-image-shape.js';
import {PagedSiftFeatureEngine} from './sift-paged.js';
import {PagedAkazeFeatureEngine} from './akaze-paged.js';
import {researchRows} from './m3-research-rows.js';
import {validateRgbRows} from './rgb-row-source.js';
import {gray} from './pixel-utils.js';
import {SPARSE_EXTRACT_WASM} from './sparse-extract-assets.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {siftRegionPlan} from './sift-regions.js';
import {remapReflectedSiftPoints} from './sift-g2nn.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
const MiB=1024**2,FAMILIES=['SIFT','AKAZE','BRISK','ORB','SIFT-G2NN','SIFT-LightGlue'];

export class SparseFeatureEngine{
 constructor(budget,profile){requireValue(budget&&typeof budget.reserve==='function'&&Number.isFinite(budget.limit)&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'Feature extraction requires shared budget and worker profile.');this.budget=budget;this.profile=profile;this.resourceOwner='sift';this.paged=new PagedSiftFeatureEngine(budget,profile);this.classicPaged=new ClassicPagedSiftFeatureEngine(budget,profile);this.pagedAkaze=new PagedAkazeFeatureEngine(budget,profile);this.adaptive=new AdaptiveConcurrency();this.workers=new Set();this.classicWorkers=new Map();this.pending=new Map();this.running=false;}
 stop(){cancelScheduledWorkerCalls(this);this.paged.stop();this.classicPaged.stop();this.pagedAkaze.stop();for(const worker of [...this.workers]){const classical=this.classicWorkers.get(worker);if(classical){classical.cancel();continue;}worker.terminate();this.pending.get(worker)?.reject(new EngineError('CANCELLED','Feature extraction stopped.'));this.workers.delete(worker);}this.pending.clear();}
 clearCheckpoint(key){return Promise.all([this.paged.clearCheckpoint(key),this.classicPaged.clearCheckpoint(key)]);}
 async dispose(){this.stop();this.adaptive.clear();await classicSiftRetireAll([()=>this.paged.dispose(),()=>this.classicPaged.dispose(),()=>this.finished,()=>this.closeClassicWorkers()]);}
 async closeClassicWorkers(){await classicSiftRetireAll([...this.classicWorkers].map(([worker,owner])=>async()=>{await owner.close();this.classicWorkers.delete(worker);this.workers.delete(worker);}));}
 rpc(worker,message,transfer=[]){const classical=this.classicWorkers.get(worker);if(classical)return classical.call(message,transfer);return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{
  if(this.pending.has(worker)){reject(new EngineError('BUSY','Feature worker already has a pending request.'));return;}
  let settled=false,protocol,workerError;
  const finish=(fn,value)=>{if(settled)return;settled=true;protocol?.dispose();if(worker.onerror===workerError)worker.onerror=null;this.pending.delete(worker);fn(value);},fail=error=>finish(reject,error),bad=reason=>{throw workerMessageFailure('Sparse extraction','message',reason);};
  this.pending.set(worker,{reject:fail});
  protocol=installWorkerMessageProtocol(worker,data=>{
   if(data.error!==undefined){if(!data.error||typeof data.error!=='object'||Array.isArray(data.error)||typeof data.error.message!=='string')bad('invalid-error');fail(deserializeWorkerError(data.error,data.message));return;}
   if(message.kind==='init'){if(data.ready!==true)bad('invalid-ready');}
   else{
    const binary=message.family>=1&&message.family<=3,n=data.points?.length/7;
    if(!(data.points instanceof Float64Array)||!Number.isSafeInteger(n)||n<0||!(data.descriptors instanceof(binary?Uint8Array:Float32Array))||!Number.isSafeInteger(data.descriptorSize)||data.descriptorSize<1||data.descriptorSize>128||data.descriptors.length!==n*data.descriptorSize||!(data.members instanceof Uint8Array)||data.members.length!==n*message.zoneCount||!Number.isSafeInteger(data.totalFeatures)||data.totalFeatures<n||!Number.isSafeInteger(data.heapBytes)||data.heapBytes<1)bad('invalid-feature-geometry');
   }
   finish(resolve,data);
  },{label:'Sparse extraction',onFailure:fail});
  workerError=()=>fail(new EngineError('WORKER_FAILED','Feature worker failed.'));worker.onerror=workerError;
  try{protocol.post(message,transfer);}catch(error){fail(error);}
 }),{label:'sparse-extract'});}
 async extract(image,{family='SIFT-G2NN',limit=6000,regions=[],excluded=[],independent=true,reflected=false,backend='auto',storageContext,checkpointKey,signal,onProgress}={}){
  requireValue(!this.running&&typeof Worker!=='undefined','Feature worker unavailable or engine busy.');
  m3ImageShape(image?.width,image?.height);
  requireValue(image?.format==='rgb8'&&(typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'RGB8 image required.');
  requireValue(FAMILIES.includes(family)&&Number.isInteger(limit)&&limit>=100&&limit<=20000,'Invalid feature family or count.');
  checkAbort(signal);this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});const releases=[],freeOutputs=[],admit=n=>{const release=this.budget.reserve(n);releases.push(release);},abort=()=>this.stop();signal?.addEventListener('abort',abort,{once:true});let returned=false,hasPrimary=false,primary;
  try{
   const classic=['SIFT','SIFT-G2NN'].includes(family),paged=classic?this.classicPaged:this.paged,cooperate=classic?createCooperator(signal):null;
   const perRegion=family==='SIFT-G2NN'&&independent;
   const plan=siftRegionPlan(image.width,image.height,perRegion?regions:[],excluded,{reflected,reserveMemory:admit}),zoneCount=Math.max(1,regions.length);
   if(!perRegion){siftRegionPlan(image.width,image.height,regions,[],{reflected,reserveMemory:admit});plan.jobs[0].regions=regions.map(p=>p.map(([x,y])=>[reflected?image.width-1-x:x,y]));}
   const jobs=plan.jobs;
   const largest=jobs.reduce((n,j)=>Math.max(n,j.rectangle.width*j.rectangle.height*(family==='SIFT-G2NN'?j.scale*j.scale:1)),0);
   if(family.startsWith('SIFT')&&largest*180>Math.min(512*MiB,this.budget.limit*.6))return await paged.extractPlan(image,plan,zoneCount,{family,limit,independent,reflected,backend,storageContext,checkpointKey,signal,onProgress});
   if(family==='AKAZE'&&largest*180>Math.min(512*MiB,this.budget.limit*.6))return await this.pagedAkaze.extract(image,{limit,regions,excluded,storageContext,signal,onProgress});
   admit(16*MiB+jobs.length*1024);
   const response=await fetch(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Feature kernel could not load.');
   const reader=response.body.getReader(),parts=[];let bytes=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>SPARSE_EXTRACT_WASM.bytes)throw new EngineError('ASSET_INTEGRITY','Feature kernel size mismatch.');parts.push(value);}}finally{await reader.cancel();}
   const wasm=new Uint8Array(bytes);let at=0;for(const part of parts){wasm.set(part,at);at+=part.length;}
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasm)),x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes!==SPARSE_EXTRACT_WASM.bytes||sha!==SPARSE_EXTRACT_WASM.sha256)throw new EngineError('ASSET_INTEGRITY','Feature kernel identity mismatch.');
   let optimizedWasm=null;const arithmeticModes=new Set(),precisionFallbacks=[];
   // Keep the verified original bytes for the exact reference fallback. Only
   // ordinary AKAZE and SIFT use equivalent independent SIMD lanes. The SIFT
   // coefficients, row/column tap order and reference resource stay unchanged.
   if(['AKAZE','SIFT','SIFT-G2NN'].includes(family)&&this.profile.cpuKernel!=='reference'){
    try{admit(SPARSE_EXTRACT_SIMD_WASM.bytes*3);optimizedWasm=await fetchM3Asset(new URL('../vendor/sparse-extract-simd/sparse-extract.wasm',import.meta.url),SPARSE_EXTRACT_SIMD_WASM,signal);
     if(!WebAssembly.validate(optimizedWasm)){optimizedWasm=null;precisionFallbacks.push({code:'SIMD_UNAVAILABLE',message:'Original scalar feature extraction retained'});}
    }catch(error){checkAbort(signal);if(error.code==='ASSET_INTEGRITY')throw error;optimizedWasm=null;precisionFallbacks.push({code:error.code??'SIMD_UNAVAILABLE',message:'Optional exact SIMD feature extraction unavailable; original scalar retained'});}
   }
   const results=new Map();let done=0,retries=0,maxWorkers=0,peakHeapBytes=0,executions=0;
   let heapBytes=initialSparseExtractionHeap(largest,family,this.budget.limit-this.budget.total(),largest*2+limit*(568+zoneCount)+32*MiB);
   const key=family+'/'+jobs.length;let pagedFallback=false,nativeMemoryFailures=0;const recovery=[];
   while(done<jobs.length){
    checkAbort(signal);
    if(pagedFallback){try{
     // Keep completed regions and switch only unfinished work to the bounded path.
     for(let index=0;index<jobs.length;index++){if(results.has(index))continue;
      const options={family,limit,independent,reflected,backend,storageContext,checkpointKey:checkpointKey===undefined?undefined:checkpointKey+'/native-fallback/'+index,signal,onProgress};
      const result=family==='AKAZE'?await this.pagedAkaze.extract(image,{...options,regions,excluded}):await paged.extractPlan(image,{...plan,jobs:[jobs[index]]},zoneCount,options);
      freeOutputs.push(result.release);results.set(index,result);done++;executions+=result.metadata?.executions??0;maxWorkers=Math.max(maxWorkers,result.metadata?.workers??0);peakHeapBytes=Math.max(peakHeapBytes,result.metadata?.peakWorkerHeapBytes??0);
     }break;
     }catch(error){error.details={...error.details,nativeFallback:{completedRegions:done,totalRegions:jobs.length,history:recovery}};throw error;}
    }
    const remaining=jobs.map((_,i)=>i).filter(i=>!results.has(i)),maximum=Math.min(this.profile.maxWorkers,remaining.length),perWorker=heapBytes+largest*2+limit*(568+zoneCount)+32*MiB;
    const capacity=this.adaptive.select(key,maximum,this.budget,n=>n*perWorker),reservedWorkers=this.budget.reserve(capacity.count*perWorker),freeWorkers=classic?classicSiftOwnedRelease(this.budget,classicSiftRetirement([()=>this.closeClassicWorkers(),()=>reservedWorkers()])):reservedWorkers;maxWorkers=Math.max(maxWorkers,capacity.count);let next=0,stopped=false,failure,hasFailure=false,batchFailed=false,batchPrimary;const start=performance.now();
    try{
     await Promise.allSettled(Array.from({length:capacity.count},async()=>{try{
      const worker=new Worker(new URL(classic?'./classic-sift-native-worker.js':'./sparse-extract-worker.js',import.meta.url),{type:'module'});this.workers.add(worker);if(classic)this.classicWorkers.set(worker,new ClassicSiftNativeWorkerOwner(this,worker,{onSubmitted:()=>onProgress?.({phase:'extracting',fraction:0,nativeSubmitted:true,extractionBackend:'cpu'})}));const initialized=await this.rpc(worker,{kind:'init',wasm,optimizedWasm,maximumHeapBytes:heapBytes});arithmeticModes.add(initialized.arithmetic??'scalar-reference');if(initialized.precisionFallback)precisionFallbacks.push(initialized.precisionFallback);
      while(next<remaining.length&&!stopped){
       checkAbort(signal);const index=remaining[next++],job=jobs[index],r=job.rectangle,bgr=new Uint8Array(r.width*r.height),source=researchRows(image),f=Math.fround;
       for(let y=0;y<r.height;y+=32){const count=Math.min(32,r.height-y),lease=await source.readRows(r.y+y,count,{signal});
        const fill=()=>{const rgb=validateRgbRows(lease,image.width,count);for(let yy=0;yy<count;yy++)for(let x=0;x<r.width;x++){
         const sx=job.reflected?image.width-1-r.x-x:r.x+x,at=(yy*image.width+sx)*3;
         bgr[(y+yy)*r.width+x]=family==='SIFT-LightGlue'?f(f(f(f(f(rgb[at]/255)*f(.299))+f(f(rgb[at+1]/255)*f(.587)))+f(f(rgb[at+2]/255)*f(.114)))*255):gray(rgb[at],rgb[at+1],rgb[at+2]);
        }};if(classic)await withClassicSiftCleanup(fill,()=>lease.release(),{budget:this.budget});else try{fill();}finally{lease.release();}if(classic)await cooperate();else await controlCheckpoint(signal);
       }
       if(stopped)break;executions++;
       const result=await this.rpc(worker,{kind:'extract',image:{width:r.width,height:r.height,data:bgr,grayscale:true},regions:job.regions,excluded:job.excluded,family:FAMILIES.indexOf(family),limit,zoneCount,independentZone:perRegion?job.zone:null},[bgr.buffer]);
       if(stopped)break;checkAbort(signal);requireValue(result.heapBytes<=heapBytes,'Feature WASM exceeds admitted heap.');peakHeapBytes=Math.max(peakHeapBytes,result.heapBytes);
       freeOutputs.push(this.budget.reserve(result.points.byteLength*2+result.descriptors.byteLength+result.members.byteLength+256));
       for(let i=0;i<result.points.length;i+=7){result.points[i]=result.points[i]+r.x;result.points[i+1]=result.points[i+1]+r.y;}
       if(reflected)result.points=remapReflectedSiftPoints(result.points,image.width);
       results.set(index,result);done++;onProgress?.({phase:'extracting',fraction:done/jobs.length,completed:done,total:jobs.length});
      }
     }catch(error){if(classic){if(!hasFailure){hasFailure=true;failure=error;}}else failure??=error;stopped=true;this.stop();throw error;}}));if(classic?hasFailure:failure)throw failure;this.adaptive.observe(key,{count:capacity.count,maximum,milliseconds:performance.now()-start,units:remaining.length});
    }catch(error){
     batchFailed=true;batchPrimary=error;stopped=true;this.stop();if(classic){try{await freeWorkers();}catch(cleanup){attachClassicSiftCleanup(error,cleanup);throw error;}}else freeWorkers();checkAbort(signal);
     const wasm=resourceAllocationKind(error)==='wasm',bounded=family.startsWith('SIFT')||family==='AKAZE',nextHeap=Math.min(2048*MiB,heapBytes*2),overhead=perWorker-heapBytes,room=this.budget.limit-this.budget.retained-this.budget.active;
     if(wasm)nativeMemoryFailures++;
     let action;
     if(wasm&&bounded&&(nativeMemoryFailures>1||nextHeap<=heapBytes||nextHeap+overhead>room)){pagedFallback=true;action='bounded-extraction';}
     else if(wasm&&nextHeap>heapBytes&&nextHeap+overhead<=room){heapBytes=nextHeap;action='grow-native-heap';}
     else if(isWorkerResourceFailure(error)&&capacity.count>1){this.adaptive.reduce(key,capacity.count,{error});action='reduce-concurrent-heaps';}
     if(action){retries++;const event={phase:'resource-recovery',action,completed:done,total:jobs.length,nextHeapBytes:heapBytes,error:serializeEngineError(error)};recovery.push(event);onProgress?.(event);continue;}
     error.details={...error.details,recovery:{attempts:retries,completedRegions:done,totalRegions:jobs.length,maximumHeapBytes:heapBytes,budget:this.budget.snapshot(),history:recovery}};throw error;
    }
    finally{stopped=true;this.stop();if(classic){try{await freeWorkers();}catch(cleanup){if(batchFailed)attachClassicSiftCleanup(batchPrimary,cleanup);else throw cleanup;}}else freeWorkers();}
   }
   const ordered=jobs.map((_,i)=>results.get(i)),count=ordered.reduce((n,r)=>n+r.points.length/7,0),binary=['AKAZE','BRISK','ORB'].includes(family),descriptorSize=ordered[0]?.descriptorSize??({AKAZE:61,BRISK:64,ORB:32}[family]??128);
   const freeResult=this.budget.reserve(count*(56+descriptorSize*(binary?1:4)+zoneCount)+4096);freeOutputs.push(freeResult);
   const points=new Float64Array(count*7),descriptors=new (binary?Uint8Array:Float32Array)(count*descriptorSize),members=new Uint8Array(count*zoneCount);let offset=0,totalFeatures=0;
   for(const r of ordered){points.set(r.points,offset*7);descriptors.set(r.descriptors,offset*descriptorSize);members.set(r.members,offset*zoneCount);offset+=r.points.length/7;totalFeatures+=r.totalFeatures;}
   checkAbort(signal);let released=false;returned=true;
   return {points,descriptors,members,zoneCount,descriptorSize,totalFeatures,release(){if(!released){released=true;freeResult();}},metadata:{family,opencv:'4.11.0',featurePolicy:perRegion?'independent_roi_v2':'global',reflectedPixels:reflected,workers:maxWorkers,peakWorkerHeapBytes:peakHeapBytes,executions,retries,recovery,preflightExecutions:0,inputLayout:'source-rows-gray',...(['AKAZE','SIFT','SIFT-G2NN'].includes(family)?{arithmeticModes:[...arithmeticModes],precisionFallbacks}:{}),qualification:['ORB','AKAZE','BRISK'].includes(family)?'native-point-descriptor-bytes-qualified':'native arithmetic differences unresolved'}};
  }catch(error){hasPrimary=true;primary=error;throw error;}finally{signal?.removeEventListener('abort',abort);this.stop();try{if(['SIFT','SIFT-G2NN'].includes(family))await classicSiftRetireAll([...releases,...freeOutputs.slice(0,returned?-1:undefined)].map(f=>()=>f()));else{releases.forEach(f=>f());freeOutputs.slice(0,returned?-1:undefined).forEach(f=>f());}}catch(cleanup){if(hasPrimary)attachClassicSiftCleanup(primary,cleanup);else throw cleanup;}finally{this.running=false;finish();}}
 }
}
