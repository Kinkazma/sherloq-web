import "../../runtime-context.js?v=0.33.2";
// Private store producer for the pending Original. It borrows A/B windows;
// the caller owns the pin, profile source and temporary session throughout.
import{EngineError,requireValue,checkAbort}from'./errors.js';
import{withRetirementOwner}from'./owner-retirement-error.js';
import{createSegmentedBytes}from'./segmented-bytes.js';
import{allocateOwnedTypedArray,allocateTypedArray}from'./allocation.js';
import{describeProjection,checkIccProfile,limited,sameBinding}from'./projection-contract.js';
import{getExecutionScheduler}from'./execution-scheduler.js';
import{projectCodeViewInto}from'./code-view.js';
import{createNativeOpeningPreview}from'./native-opening-preview.js';
const MiB=1024**2,outputProfileMaximum=MiB; // Existing CMM output-profile bound.
const ack=async fn=>{const v=await fn();if(v===false||v===0)throw v;return v;};
const projectionLimits=new Set(['COLOR_DOMAIN_UNSUPPORTED','COLOR_PROFILE_REQUIRED','COLOR_PROFILE_INVALID','COLOR_PROFILE_MISMATCH','COLOR_PROFILE_IDENTITY_MISMATCH','COLOR_TRANSFORM_FAILED']);
// A file's resolved NACK must reach segmented storage before it can forget
// that file. The borrowed session itself is never retired by this projector.
function checkedSession(session){return session&&new Proxy(Object.create(null),{get(_t,key){
 if(key==='create')return async(...args)=>{const f=await session.create(...args);return new Proxy(Object.create(null),{get(_f,field){if(field==='dispose')return()=>ack(()=>f.dispose());const v=Reflect.get(f,field,f);return typeof v==='function'?v.bind(f):v;}});};
 const v=Reflect.get(session,key,session);return typeof v==='function'?v.bind(session):v;
}});}
export async function projectNativeSdr({pin,decodedMetadata,colorContract,admission,budget,readProfile,
 adoptDependent,temporarySession,getTemporarySession,signal,onPreview}={}){
 requireValue(budget?.reserve&&typeof adoptDependent==='function','The projection needs the captured Original budget and retirement owner.');
 checkAbort(signal);const p=describeProjection({pin,decodedMetadata,colorContract,admission});if(p.status==='limited')return p;
 if(p.profile.kind==='embedded'&&typeof readProfile!=='function')return limited('COLOR_PROFILE_REQUIRED','No owned private ICC reader was supplied.');
 const stop=new AbortController(),s=signal?AbortSignal.any([signal,stop.signal]):stop.signal,byteLength=p.totalPixels*3;
 let declaredProfile=p.profile.kind==='declared-icc'?colorContract.profile.bytes:null;
 let operation,finishFlight,retirement,closing=false,closed=false,complete=false,ready=false,deferred=false,answer;
 let parallel,parallelReceipt,parallelOptions,parallelMetrics,executionPlan,canonicalChoice,localColorPreparationMs=0,firstCanonicalCpuMs=null,firstCanonicalPixels=0,canonicalSerialPixels=0;
 let cache,transform,display,profile,profileCopyFee,colorFee,store,storeCleanup,window,pack,rgb,rgbFee,writeInDoubt=false,metrics;
 const stage=async fn=>{try{return await ack(fn);}catch(error){deferred=true;throw withRetirementOwner(error,owner,error);}};
 async function retireProfile(){if(profile){await stage(()=>profile.release());profile=null;}}
 async function retireBand(){
  if(window){await stage(async()=>{const reply=await pin.retireWindow(window);requireValue(reply?.retired===true,'The A/B window retirement was not acknowledged.');});window=null;}
  if(pack){await stage(()=>pack.release());pack=null;}
  if(parallelReceipt){await stage(()=>parallel.retireResult(parallelReceipt));parallelReceipt=null;}rgb=null;rgbFee?.();rgbFee=null;
 }
 async function retireColor(){
  if(parallel){await stage(()=>parallel.dispose());parallelMetrics=parallel.metrics();parallel=null;}parallelOptions=null;
  if(display){await stage(()=>display.dispose());display=null;transform=null;}
  if(transform){await stage(()=>transform.dispose());transform=null;}
  if(cache){await stage(()=>cache.dispose());cache=null;}
  await retireProfile();declaredProfile=null;profileCopyFee?.();profileCopyFee=null;colorFee?.();colorFee=null;
 }
 async function retireStore(){
  if(store){await stage(()=>store.dispose());store=null;}
  else if(storeCleanup){await stage(()=>storeCleanup.dispose());storeCleanup=null;}
  writeInDoubt=false;
 }
 const owner={
  byteLength,get storage(){return store?.storage??'unallocated';},
  readInto(target,offset,options){requireValue(ready&&!closing&&store,'The complete SDR store is not available.');return store.readInto(target,offset,options);},
  // A fully flushed image survives a colour-owner close refusal. This
  // private resume only retries retirement; it cannot repeat the projection.
  finishPresentation(){
   checkAbort(s);requireValue(complete&&!closing&&!closed,'A complete, current projection is required.');if(ready)return Promise.resolve(answer);if(finishFlight)return finishFlight;
   const task=(async()=>{try{await retireColor();}catch(primary){throw withRetirementOwner(primary,owner,primary);}
    checkAbort(s);if(parallelMetrics)metrics=Object.freeze({...metrics,canonicalColorExecution:Object.freeze({...metrics.canonicalColorExecution,...parallelMetrics})});ready=true;answer=Object.freeze({status:'ready',store:owner,width:p.width,height:p.height,projection:metrics});return answer;})();
   finishFlight=task;task.then(()=>finishFlight=null,()=>finishFlight=null);return task;
  },
  dispose(){
   if(closed)return Promise.resolve();if(retirement)return retirement;closing=true;stop.abort();
   const task=(async()=>{await Promise.allSettled([operation,finishFlight].filter(Boolean));
    // A refused write may still own its source buffer. Close the store first
    // in that case, before acknowledging the input window or releasing RGB.
    if(writeInDoubt)await retireStore();await retireBand();await retireColor();await retireStore();closed=true;ready=false;answer=null;
   })();retirement=task;task.then(()=>retirement=null,()=>retirement=null);return task;
  },
 };
 await ack(()=>adoptDependent(owner));
 operation=(async()=>{
  checkAbort(s);
  // The actual CMM heap maximum, pinned resource/copy and generated profile
  // are covered. The accelerated display may use only its separately funded
  // workspace, regardless of later growth in the CMM heap.
  if(!p.codeView){
   const colorPreparationStarted=performance.now();
   const [{createColorTransformCache},{COLOR_NATIVE_RESOURCE}]=await Promise.all([import('./color-managed-runtime.js'),import('./color-managed-resource.js')]);
   const colorBytes=p.colorHeapBytes+2*COLOR_NATIVE_RESOURCE.bytes+outputProfileMaximum+p.displayBytes;
   checkAbort(s);colorFee=budget.reserve(colorBytes);cache=createColorTransformCache({maximumMemoryBytes:p.colorHeapBytes,maxEntries:1,maximumBandBytes:p.maximumColorBandBytes},{signal:s});
   let inputProfileBytes;
   if(p.profile.kind==='embedded'){profile=await readProfile(p.profile.sha256,{signal:s});inputProfileBytes=profile?.data;}
   else {profile=allocateOwnedTypedArray(Uint8Array,p.profileBytes,{budget,owner:'original-sdr8',label:'declared-icc'});profile.data.set(declaredProfile);declaredProfile=null;inputProfileBytes=profile.data;}
   checkIccProfile(inputProfileBytes,p);profileCopyFee=budget.reserve(2*p.profileBytes);
   parallelOptions={inputProfileBytes,inputFormat:p.inputFormat,outputFormat:'rgb8',intent:p.intent,blackPointCompensation:p.blackPointCompensation,
    ...(p.floating?{inputUnits:p.inputUnits,extendedPolicy:'lcms-defined'}:{})};
   transform=await cache.acquire(parallelOptions,{signal:s});
   localColorPreparationMs=Math.max(0,performance.now()-colorPreparationStarted);
   profileCopyFee();profileCopyFee=null;inputProfileBytes=null;
   if(transform.metadata.inputProfileSha256!==p.profile.sha256)throw new EngineError('COLOR_PROFILE_IDENTITY_MISMATCH','The acquired ICC differs from the selected exact profile.');
  }
  checkAbort(s);
  // Keep space for a useful window while the existing store chooses RAM or
  // temporary backing. The window/pack/IO then take their real reservations.
  const colourCopies=p.inputFormat==='rgb16'&&p.backend==='auto'?6:3,
   perPixel=2*p.d.channels*p.Type.BYTES_PER_ELEMENT+(p.alpha&&!p.codeView?p.map.length*p.Type.BYTES_PER_ELEMENT:0)+colourCopies,
   bandFixed=256+p.ioHeadroomBytes,
   bandPixels=Math.max(1,Math.min(p.maximumPixels,Math.floor((budget.limit-budget.total()-bandFixed)/perPixel))),
   bandHeadroom=budget.reserve(bandFixed+bandPixels*perPixel);
  let opening;
  try{
   if(!p.codeView&&p.inputFormat==='rgb16'){const {createNativeColorDisplay}=await import('./native-color-display.js');display=await createNativeColorDisplay({backend:p.backend,transform,colorCache:cache,totalPixels:p.totalPixels,maximumPixels:bandPixels,
    maximumMemoryBytes:cache.snapshot().heapCapacityBytes+p.displayBytes,signal:s,
    ...(p.genuineRgb16?{nativeInput:{sampleType:'uint16',sourceDepth:p.d.sourceDepth,decodedDepth:16,promoted:false}}:{})});}
   try{store=await createSegmentedBytes(byteLength,{budget,storage:p.storage,signal:s,temporarySession:checkedSession(temporarySession),
    ...(getTemporarySession?{getTemporarySession:async hooks=>checkedSession(await getTemporarySession(hooks))}:{}),owner:'original-sdr8',label:'native-icc-sdr8'});}
   catch(primary){storeCleanup=primary?.cleanupOwner;throw primary;}
   opening=createNativeOpeningPreview({width:p.width,height:p.height,budget,signal:s,onPreview,
    allowReordering:!p.floating&&bandPixels>=p.width&&p.d.orientation<=4&&p.d.storage==='memory'&&store.storage==='memory'&&p.backend==='cpu'});
  }finally{bandHeadroom();}
  let windows=0,pixels=0;
  const tileWidth=Math.min(p.width,bandPixels),rows=tileWidth===p.width?Math.max(1,Math.floor(bandPixels/p.width)):1;
  try{
   for(const [start,end] of opening?.rowSpans()??[[0,p.height]])for(let y=start;y<end;y+=rows)for(let x=0;x<p.width;x+=tileWidth){
   checkAbort(s);const width=Math.min(tileWidth,p.width-x),height=Math.min(rows,end-y),n=width*height;
   // B and A admit the real typed window, row/IO scratch and receipt before
   // allocating them. A already applies the single canonical orientation.
   window=await pin.readWindow({x,y,width,height},{signal:s});
   requireValue(window?.sourceId===p.receipt.sourceId&&window.revision===p.receipt.revision&&window.sourceLeaseId===p.receipt.sourceLeaseId
    &&sameBinding(window.bindingOriginal,p.receipt.bindingOriginal)&&window.origin?.[0]===x&&window.origin?.[1]===y
    &&window.width===width&&window.height===height&&window.samples instanceof p.Type&&window.samples.length===n*p.d.channels,'The typed window differs from its captured pin.');
   let samples=window.samples;
   if(p.alpha&&!p.codeView){pack=allocateOwnedTypedArray(p.Type,n*p.map.length,{budget,owner:'original-sdr8',label:'native-colour-pack'});
    const out=pack.data,k=p.map.length;for(let at=0,to=0;at<samples.length;at+=k+1)for(let c=0;c<k;c++)out[to++]=samples[at+c];samples=out;}
   // Existing CMM owns its WASM arrays; its returned RGB and the display's
   // optional assembly copy are outside that heap and funded here.
   const canAssess=!p.codeView&&!parallel&&!executionPlan&&pixels+n<p.totalPixels,
    displayBefore=canAssess?display?.metrics():null,canonicalStarted=canAssess?performance.now():0;
   if(parallel){
    parallelReceipt=await parallel.convert(samples);
    if(parallelReceipt)rgb=parallelReceipt.pixels;
    else{
     // Atomic admission declined before taking any owner. Retire the empty
     // adapter, then use the unchanged canonical band on this same window.
     await stage(()=>parallel.dispose());parallelMetrics=parallel.metrics();parallel=null;
    }
   }
   if(!parallelReceipt){
    rgbFee=budget.reserve(n*colourCopies);
    rgb=p.codeView?projectCodeViewInto(samples,allocateTypedArray(Uint8Array,n*3,{label:'native-unprofiled-preview'}),p):
     await(display?display.convert(samples,{signal:s}):transform.convert(samples,{signal:s}));
   }
   let observedBand;
   if(!p.codeView&&!parallelReceipt){
    const after=display?.metrics();canonicalSerialPixels=display?after.canonicalCpuPixels:canonicalSerialPixels+n;
    if(canAssess){
     const canonicalElapsedMs=Math.max(0,performance.now()-canonicalStarted);
     const{describeCanonicalColorBand}=await import('./canonical-color-plan.js');
     observedBand=describeCanonicalColorBand({pixels:n,elapsedMs:canonicalElapsedMs,displayBefore,displayAfter:after});
     canonicalChoice=observedBand;
     if(observedBand.eligible){firstCanonicalCpuMs=observedBand.canonicalCpuMs;firstCanonicalPixels=n;}
    }
   }
   samples=null;
   requireValue(rgb instanceof Uint8Array&&rgb.length===n*3,'The projection returned a different presentation extent.');checkAbort(s);
   writeInDoubt=true;await ack(()=>store.write(rgb,(y*p.width+x)*3,{signal:s}));writeInDoubt=false;
   const previewComplete=opening?.add({bytes:rgb,x,y,width,rows:height});
   await retireBand();
   windows++;pixels+=n;
   // The first complete band is written through its original path. Only
   // canonical LCMS work may forecast that same computation in worker lanes;
   // GPU/fastCPU active or pending retains its existing display owner.
   if(observedBand?.eligible&&!executionPlan&&pixels<p.totalPixels){
    const{describeCanonicalColorLane,planCanonicalColorExecution}=await import('./canonical-color-plan.js'),
     scheduler=getExecutionScheduler(budget),lanePlan=describeCanonicalColorLane({inputFormat:p.inputFormat,outputFormat:'rgb8',
      profileBytes:p.profileBytes,maximumChunkPixels:Math.min(65536,bandPixels),maximumMemoryBytes:p.colorHeapBytes});
    executionPlan=planCanonicalColorExecution({lanePlan,totalPixels:p.totalPixels,completedPixels:pixels,observedPixels:n,
     completedCpuMs:firstCanonicalCpuMs,localPreparationMs:localColorPreparationMs,schedulerCapacity:scheduler.capacity.cpu,
     availableBytes:Math.max(0,budget.limit-budget.total()),workspaceBytes:bandFixed+bandPixels*perPixel});
    if(executionPlan.workerCount){
     const{createCanonicalColorExecution}=await import('./canonical-color-execution.js');
     parallel=createCanonicalColorExecution({budget,scheduler,localTransform:transform,transformOptions:parallelOptions,
      maximumPixels:bandPixels,executionPlan,signal:s});
    }
   }
   // Float32 can still encounter a non-finite colour outside preview support
   // and require a different presentation policy. Do not announce it early.
   if(previewComplete&&(!p.floating||pixels===p.totalPixels))await opening.publishIfComplete();
   }
  }finally{opening?.dispose();}
  checkAbort(s);requireValue(pixels===p.totalPixels,'Incomplete RGB8 presentation coverage.');await ack(()=>store.flush());checkAbort(s);
  metrics=Object.freeze({inputFormat:p.inputFormat,inputUnits:p.inputUnits,outputFormat:'rgb8',
   ...(p.codeView?{outputColorSpace:null,profileApplied:false,approximateCodeView:true,codeViewPolicy:'nominal-interval-clipped'}:{inputProfileSha256:p.profile.sha256,outputColorSpace:'srgb'}),
   dynamicRange:p.dynamicRange,physicalToneMapApplied:false,alphaPreservedInSource:p.alpha,alphaOmittedFromPresentation:p.alpha,decodedAlphaAssociation:p.alphaAssociation,
   sourceSamplesPreserved:true,windows,pixels,storage:store.storage,backend:display?.metrics().backend??'cpu',
   ...(display?{display:display.metrics()}:{}),...(!p.codeView?{canonicalColorExecution:Object.freeze({canonicalSerialPixels,firstCanonicalBandPixels:firstCanonicalPixels,firstCanonicalBandCpuMs:firstCanonicalCpuMs,assessment:executionPlan?.assessment??{decision:canonicalChoice?.decision??'serial-complete',selectedWorkers:0},costModel:executionPlan?.costModel??null,...(parallel?parallel.metrics():parallelMetrics??{createdWorkers:0,residentWorkers:0,retiredWorkers:0,nativeCloseAcknowledged:0,capturedWorkerExits:0,browserTerminateRequested:0})})}:{}),width:p.width,height:p.height});complete=true;
 })();
 try{await operation;return await owner.finishPresentation();}
 catch(primary){
  if(primary?.cleanupOwner===cache)deferred=true;
  if(deferred)throw primary?.cleanupOwner===owner?primary:withRetirementOwner(primary,owner,primary);
  try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}
  if(projectionLimits.has(primary?.code))return limited(primary.code,primary.message);
  throw primary;
 }
}
