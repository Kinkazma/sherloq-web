import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {gradientParams} from './gradient-parameters.js';
import {gradientFieldDefaults} from './gradient-field-parameters.js';
import {gradientFieldSurface,gradientFieldExecutionPlan} from './gradient-field.js';
import {createColorTransformCache} from './color-managed-runtime.js';
import {hdrPrimariesMatrix,hdrDecodeTransfer} from './hdr-color-presentation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createSourceRegionView,sourceRegionViewWindowPlan} from './source-region-view.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {native16Descriptor} from './rgb16-surface.js';
const MiB=1024**2,COLOR_BYTES=64*MiB,LUMA_ENTRIES=65536,LUMA_BYTES=LUMA_ENTRIES*Float64Array.BYTES_PER_ELEMENT,owners=new WeakMap();
// Charged extents shared by actual allocations and optional final admission.
function native16ColorProfilePlan(bytes){return{residentBytes:COLOR_BYTES,borrowedBytes:bytes,copiesBytes:bytes*2};}
function native16ColorBandPlan(pixels){return{pixels,lumaBytes:pixels*Float64Array.BYTES_PER_ELEMENT,xyzBytes:pixels*3*Float32Array.BYTES_PER_ELEMENT,grayBytes:pixels*Uint16Array.BYTES_PER_ELEMENT};}
const unknownColor=reason=>({known:false,reason});
function native16ColorResidency(state){
 if(!state.budgetMatches)return unknownColor('native-color-foreign-budget');
 if(state.disposed||state.disposing||state.active||state.retiring||state.disposal)return unknownColor('native-color-owner-not-idle');
 if(!state.observationKnown||state.transients!==0||state.registrations!==state.acknowledgements)return unknownColor('native-color-retirement-not-attested');
 const empty=!state.hasCache&&!state.hasTransform&&!state.hasFee&&!state.hasLut;
 if(empty)return state.generation===state.retiredGeneration?{known:true,state:'cold'}:unknownColor('native-color-generation-not-retired');
 if(state.profile){
  const c=state.cache,m=state.transform;
  const complete=state.hasCache&&state.hasTransform&&!state.hasLut&&state.hasFee&&state.feeBytes===COLOR_BYTES
   &&c?.entries>0&&c.activeHandles>0&&c.heapCapacityBytes>0&&c.heapCapacityBytes<=COLOR_BYTES&&c.heapMaximumBytes===COLOR_BYTES
   &&c.closing===false&&c.disposed===false&&!c.initializing&&c.retiringPointers===0
   &&m?.inputProfileSha256===state.profileSha256&&['rgb16','gray16'].includes(m.inputFormat)&&m.outputFormat==='xyzFloat32';
  return complete?{known:true,state:'warm',inputFormat:m.inputFormat}:unknownColor('native-color-cache-incomplete');
 }
 return state.lutOwned&&!state.hasCache&&!state.hasTransform&&!state.hasFee?{known:true,state:'warm'}:unknownColor('native-color-lut-incomplete');
}
export function native16GradientColorAdmissionPlan(surface,params={},options={}){
 try{
  const d=surface?.descriptor,{budget,effectiveBackend='cpu',maxReadPixels=1024*1024}=options;
  if(d?.format!=='rgb16'||!budget||!['cpu','webgpu'].includes(effectiveBackend))return unknownColor('native-color-plan-input');
  const p=native16GradientParams(params);if(p.luma!=='linear709')return{known:true,missingResidentBytes:0,setupTransientBytes:0,bandBytes:0};
  const profile=d.color?.iccProfile??d.color?.profile;
  if(profile&&(!/^[a-f0-9]{64}$/.test(profile.sha256??'')||!Number.isSafeInteger(profile.bytes)||profile.bytes<128))return unknownColor('native-color-profile-extent-not-attested');
  const owner=owners.get(surface),state=owner?owner.colorAdmissionState(budget):{known:true,state:'cold'};if(!state.known)return state;
  if(owner&&(state.surfaceId!==d.id||state.sourceRevision!==d.revision||state.profileSha256!==(profile?.sha256??null)))return unknownColor('native-color-source-binding-changed');
  const region=options.domain,geometry=region?{width:region.width,height:region.height}:d;if(region&&(region.sourceWidth!==d.width||region.sourceHeight!==d.height))return unknownColor('native-color-domain-grid-mismatch');
  const {rows,halo}=gradientFieldExecutionPlan({width:geometry.width,height:geometry.height,params:p,maxReadPixels,availableBytes:Number.MAX_SAFE_INTEGER,effectiveBackend});
  const pixels=geometry.width*Math.min(geometry.height,rows+2*halo);if(rows<1||!Number.isSafeInteger(pixels)||pixels<1)return unknownColor('native-color-window-not-admitted');
  const band=native16ColorBandPlan(pixels),profilePlan=profile?native16ColorProfilePlan(profile.bytes):null;
  const missingResidentBytes=state.state==='warm'?0:profilePlan?.residentBytes??LUMA_BYTES;
  // If a warm owner retires before the run, its resident fee really returns
  // before reconstruction. Profile borrow/copies must still fit their phase.
  const setupTransientBytes=profilePlan?profilePlan.borrowedBytes+profilePlan.copiesBytes:0;
  const gray=!!profile&&state.inputFormat!=='rgb16',bandBytes=band.lumaBytes+(profile?band.xyzBytes+(gray?band.grayBytes:0):0);
  if(![missingResidentBytes,setupTransientBytes,bandBytes].every(v=>Number.isSafeInteger(v)&&v>=0))return unknownColor('native-color-unsafe-bound');
  return{known:true,state:state.state,missingResidentBytes,setupTransientBytes,bandBytes,windowPixels:pixels,rows,halo,profileBytes:profile?.bytes??0,grayPackingBound:gray};
 }catch{return unknownColor('native-color-uninspectable-plan');}
}
// Additional masked collection bound, shared with the typed regional reader.
// The field's own stores/scratch and native colour plan remain separate posts.
export function native16GradientRegionWindowPlan(surface,params={},options={}){
 try{
  const d=surface?.descriptor,domain=options.domain,effectiveBackend=options.effectiveBackend??'cpu';
  if(d?.format!=='rgb16'||!domain||domain.sourceWidth!==d.width||domain.sourceHeight!==d.height)return{known:false,reason:'native-gradient-region-grid-mismatch'};
  const p=native16GradientParams(params),plan=gradientFieldExecutionPlan({width:domain.width,height:domain.height,params:p,maxReadPixels:options.maxReadPixels??1024**2,availableBytes:Number.MAX_SAFE_INTEGER,rowsPerBlock:options.rowsPerBlock,effectiveBackend});
  if(plan.rows<1)return{known:false,reason:'native-gradient-region-window-not-admitted'};
  const height=Math.min(domain.height,plan.rows+2*plan.halo),window=sourceRegionViewWindowPlan(surface,{width:domain.width,height});
  return{known:true,rows:plan.rows,halo:plan.halo,windowPixels:domain.width*height,...window,additionalBytes:window.maskedBytes+window.sourceLoanBytes+window.sourceRowScratchBytes};
 }catch{return{known:false,reason:'native-gradient-region-window-plan-invalid'};}
}

// ICC PCS D50 -> D65, Bradford. Native samples remain untouched; this matrix
// supplies linear luminance only when the user explicitly selects linear709.
const D50_TO_D65_Y=[-.028315374694589387,1.0099514122111417,.021025967180323932];
const cicp=value=>typeof value==='string'&&/^cicp-\d+$/.test(value)?Number(value.slice(5)):value;
const transfer=value=>value==='source'?13:typeof value==='number'?value:({srgb:13,'iec61966-2-1':13,pq:16,hlg:18,linear:8,bt709:1,'gamma2.2':4,'gamma2.8':5}[String(value).toLowerCase()]??cicp(value)??2);
export const NATIVE16_GRADIENT_UNITS=Object.freeze({source:'uint16 code values,0..65535',bt601:'fraction of the complete encoded channel range per native pixel; historical integer rounding for native Sobel/Krawetz',linear709:'linear D65 luminance per native pixel, relative to ICC white or203nit reference for HDR CICP',sampleStep:'native pixels',kernelSize:'odd tap count; support1+(kernelSize-1)*sampleStep native pixels',sigma:'Gaussian sigma in tap spacing; physical sigma=sigma*sampleStep pixels',preSigma:'native pixels',tensorSigma:'native pixels',intensity:'display-only0..100; applied before optional equalization when requested',output:'RGB8 visualization; signed derivatives retain float64 CPU or float32 GPU precision'});
export function native16GradientParams(input={}){const base=gradientParams(input);return{...gradientFieldDefaults(base.method),...base,sampleMaximum:65535};}
function createOwner(surface,options){
 const {budget}=options,d=surface.descriptor,prefix='native16-gradient/'+d.id+'/'+d.revision,source=options.sourceSurface??surface,controller=new AbortController();
 let disposed=false,disposing,active,currentParams,currentSourceCheck,colorCache,colorTransform,colorFee,lumaLut,lumaReady=false,colorRetiring=false,colorDisposal,retiredColorHeap=0,unregister,sourceReads=0;
 // A window/profile/band is registered before its first acquisition. A refused
 // retire keeps its fields here even after an error loses functions on the wire.
 const transients=new Set();let transientRegistrations=0,transientAcknowledgements=0,colorGeneration=0,retiredColorGeneration=0,colorObservationKnown=true;
 const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
 const colorArray=(...args)=>{try{return allocateOwnedTypedArray(...args);}catch(error){colorObservationKnown=false;throw error;}};
 const releaseColorArray=async value=>{try{return await ack(()=>value.release());}catch(error){if(value.data===null)colorObservationKnown=false;throw error;}};
 const readNativeWindow=async(rect,hooks,reader=surface,method='readWindow')=>{try{return await reader[method](rect,hooks);}catch(error){colorObservationKnown=false;throw error;}};
 const releaseNativeWindow=async value=>{try{return await ack(()=>value.release());}catch(error){colorObservationKnown=false;throw error;}};
 function transient(actions){transientRegistrations++;let flight;const row={dispose(){
  if(!transients.has(row))return Promise.resolve();if(flight)return flight;
  const task=retireCompositeOwners(actions,{requireAck:true}).then(()=>{if(transients.delete(row))transientAcknowledgements++;});flight=task;
  void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
 }};transients.add(row);return row;}
 const drainTransients=()=>retireCompositeOwners([...transients].map(row=>()=>row.dispose()),{requireAck:true});
 const retireTransient=(row,failed,primary)=>retireCompositeOwners([()=>row.dispose()],failed?{primary,requireAck:true}:{requireAck:true});
 const debt=error=>!!error?.cleanupOwner||'cleanupError' in Object(error)||'cleanupErrors' in Object(error)&&(!Array.isArray(error.cleanupErrors)||error.cleanupErrors.length);
 const image={nativeDepth:16,session:options.temporarySession,ensureTemporarySession:options.getTemporarySession,pixelStoreCaches:new Map()};
 const color=d.color??{},profile=color.iccProfile??color.profile,primary=cicp(color.primaries??1),trc=transfer(color.transfer??13),matrix=hdrPrimariesMatrix(primary),yMatrix=[0,1,2].map(c=>D50_TO_D65_Y[0]*matrix[c]+D50_TO_D65_Y[1]*matrix[3+c]+D50_TO_D65_Y[2]*matrix[6+c]);
 function alive(){if(disposed)throw new EngineError('DISPOSED','Native gradient source retired.');if(currentSourceCheck&&!currentSourceCheck())throw new EngineError('SOURCE_CHANGED','Native gradient Original changed.');}
 function releaseColor(){
  if(colorDisposal)return colorDisposal;
  // Bands/profile borrowers are a dependency, not interchangeable free space.
  requireValue(transients.size===0,'Native colour still has owned windows or profile borrows.');colorRetiring=true;
  const task=retireCompositeOwners([async()=>{
   if(lumaLut){await releaseColorArray(lumaLut);lumaLut=null;lumaReady=false;}
   if(colorTransform){await ack(()=>colorTransform.dispose());colorTransform=null;}
   if(colorCache){retiredColorHeap=Math.max(retiredColorHeap,colorCache.snapshot().heapCapacityBytes??0);await ack(()=>colorCache.dispose());
    const state=colorCache.snapshot();requireValue(state.disposed===true&&state.entries===0&&state.activeHandles===0&&state.heapCapacityBytes===0,'Native colour cache retirement is incomplete.');colorCache=null;}
   if(colorFee){await ack(()=>colorFee());colorFee=null;}
   if(retiredColorHeap){budget.notifyBackingRelease?.('wasm',retiredColorHeap);retiredColorHeap=0;}colorRetiring=false;retiredColorGeneration=colorGeneration;
  }],{requireAck:true});colorDisposal=task;void task.finally(()=>{if(colorDisposal===task)colorDisposal=null;}).catch(()=>{});return task;
 }
 async function managedTransform(signal){
  if(colorTransform&&!colorRetiring)return colorTransform;
  requireValue(typeof source.readColorProfile==='function'&&typeof profile?.sha256==='string','The exact private native ICC profile is required for linear luminance.');
  let borrowed,copies,failed=false,primary;
  const row=transient([
   async()=>{if(copies){await ack(()=>copies());copies=null;}},
   async()=>{if(borrowed){await ack(()=>borrowed.release());borrowed=null;}}
  ]);
  try{
   colorGeneration++;await budget.reclaim?.(COLOR_BYTES,{signal,owner:'native16-gradient'});colorFee=budget.reserve(COLOR_BYTES);
   colorCache=createColorTransformCache({maximumMemoryBytes:COLOR_BYTES,maximumBandBytes:6*MiB},{...options.colorHooks,signal});
    try{borrowed=await source.readColorProfile(profile.sha256,{signal});}catch(error){colorObservationKnown=false;throw error;}copies=budget.reserve(native16ColorProfilePlan(borrowed.data.byteLength).copiesBytes);
   const space=String.fromCharCode(...borrowed.data.subarray(16,20));colorTransform=await colorCache.acquire({inputProfileBytes:borrowed.data,inputFormat:space==='GRAY'?'gray16':'rgb16',outputFormat:'xyzFloat32'},{signal});return colorTransform;
  }catch(error){failed=true;primary=error;colorRetiring=true;retiredColorHeap=Math.max(retiredColorHeap,colorCache?.snapshot().heapCapacityBytes??0);throw error;}
  finally{await retireTransient(row,failed,primary);}
 }
 async function prepareLuminance(signal){
  if(profile)return managedTransform(signal);if(lumaLut&&lumaReady&&!colorRetiring)return;
   colorGeneration++;await budget.reclaim?.(LUMA_BYTES,{signal,owner:'native16-gradient'});
   lumaLut=colorArray(Float64Array,LUMA_ENTRIES,{budget,owner:'native16-gradient',label:'native-transfer-lut'});lumaReady=false;
  try{const cooperate=createCooperator(signal);for(let i=0;i<65536;i++){if(i%4096===0)await cooperate();lumaLut.data[i]=hdrDecodeTransfer(i/65535,trc);}lumaReady=true;}
  catch(error){colorRetiring=true;throw error;}
 }
 async function linearLuminance(samples,signal){
  let owned,xyz,fee,graySamples,failed=false,primary,keepOutput=false;
  const releaseOwned=async()=>{if(owned){await releaseColorArray(owned);owned=null;}};
  const row=transient([
   async()=>{if(!keepOutput)await releaseOwned();},
   async()=>{if(graySamples){await releaseColorArray(graySamples);graySamples=null;}},
   async()=>{xyz=null;if(fee){await ack(()=>fee());fee=null;}}
  ]);
  try{
   const bandPlan=native16ColorBandPlan(samples.length/3);owned=colorArray(Float64Array,bandPlan.pixels,{budget,owner:'native16-gradient',label:'linear-luminance-band'});
   const cooperate=createCooperator(signal);if(profile){const transform=await managedTransform(signal);fee=budget.reserve(bandPlan.xyzBytes);let input=samples;
    if(transform.metadata.inputFormat==='gray16'){graySamples=colorArray(Uint16Array,bandPlan.pixels,{budget,owner:'native16-gradient',label:'native-gray-icc-band'});for(let i=0;i<graySamples.data.length;i++){if(i%4096===0)await cooperate();graySamples.data[i]=samples[i*3];}input=graySamples.data;}
    xyz=transform.convert(input,{signal});}
   for(let i=0,j=0;i<samples.length;i+=3,j++){if(j%4096===0)await cooperate();if(xyz)owned.data[j]=D50_TO_D65_Y[0]*xyz[i]+D50_TO_D65_Y[1]*xyz[i+1]+D50_TO_D65_Y[2]*xyz[i+2];else owned.data[j]=yMatrix[0]*lumaLut.data[samples[i]]+yMatrix[1]*lumaLut.data[samples[i+1]]+yMatrix[2]*lumaLut.data[samples[i+2]];}
   checkAbort(signal);keepOutput=true;return owned;
  }catch(error){if(colorCache&&error?.cleanupOwner===colorCache){colorRetiring=true;retiredColorHeap=Math.max(retiredColorHeap,colorCache.snapshot().heapCapacityBytes??0);}failed=true;primary=error;throw error;}
  finally{
   try{await retireTransient(row,failed,primary);}
   catch(cleanup){if(keepOutput){keepOutput=false;await retireCompositeOwners([releaseOwned],{primary:cleanup,requireAck:true});}throw cleanup;}
  }
 }
 async function readLuminanceWindow(reader,method,rect,hooks={}){
  alive();let lease,linear,failed=false,primary,returned=false;
  const row=transient([
   async()=>{if(linear){await releaseColorArray(linear);linear=null;}},
   async()=>{if(lease){await releaseNativeWindow(lease);lease=null;}}
  ]);
  try{lease=await readNativeWindow(rect,hooks,reader,method);sourceReads++;if(currentParams.luma==='linear709')linear=await linearLuminance(lease.pixels.data,hooks.signal);alive();checkAbort(hooks.signal);
   const answer={...lease,pixels:{...lease.pixels,...(linear?{nativeLinearLuminance:linear.data}:{})},release:()=>row.dispose()};returned=true;return answer;
  }catch(error){failed=true;primary=error;throw error;}
  finally{if(!returned)await retireTransient(row,failed,primary);}
 }
 image.surface={descriptor:d,maxReadPixels:1024**2,readWindow:(rect,hooks)=>readLuminanceWindow(surface,'readWindow',rect,hooks)};
 unregister=budget.registerAsyncReclaimer?.(async()=>{if(!active){await drainTransients();await releaseColor();}},{owner:'native16-gradient',label:'idle-native-color',allocationKind:'wasm'});
 async function retireFieldCaches(){await retireCompositeOwners([...image.pixelStoreCaches].map(([key,cache])=>async()=>{await ack(()=>cache.dispose());if(image.pixelStoreCaches.get(key)===cache)image.pixelStoreCaches.delete(key);}),{requireAck:true});}
 const owner={
  colorAdmissionState(candidateBudget){
   const result=native16ColorResidency({budgetMatches:candidateBudget===budget,disposed,disposing:!!disposing,active:!!active,retiring:colorRetiring,disposal:!!colorDisposal,
    observationKnown:colorObservationKnown,transients:transients.size,registrations:transientRegistrations,acknowledgements:transientAcknowledgements,generation:colorGeneration,retiredGeneration:retiredColorGeneration,
    profile:!!profile,profileSha256:profile?.sha256??null,hasCache:!!colorCache,hasTransform:!!colorTransform,hasFee:!!colorFee,feeBytes:colorFee?.bytes??0,cache:colorCache?.snapshot()??null,transform:colorTransform?.metadata??null,
    hasLut:!!lumaLut,lutOwned:!!lumaLut&&lumaReady&&lumaLut.data instanceof Float64Array&&lumaLut.data.length===LUMA_ENTRIES&&lumaLut.data.byteLength===LUMA_BYTES});
   return{...result,surfaceId:d.id,sourceRevision:d.revision,profileSha256:profile?.sha256??null};
  },
  run(params,callOptions={}){
   alive();if(active)throw new EngineError('BUSY','Native gradient source already calculating.');currentSourceCheck=callOptions.domain?callOptions.isSourceCurrent:null;alive();currentParams={...native16GradientParams(params),nativeCoordinateStep:d.provenance?.sampledNative16?.step??1};requireValue(Number.isSafeInteger(currentParams.nativeCoordinateStep)&&currentParams.nativeCoordinateStep>0,'Invalid native gradient coordinate spacing.');
   const linked=new AbortController(),abort=()=>linked.abort();controller.signal.addEventListener('abort',abort,{once:true});callOptions.signal?.addEventListener('abort',abort,{once:true});if(controller.signal.aborted||callOptions.signal?.aborted)linked.abort();
   const task=(async()=>{
    let regionView,regionDomain,regionRecord,regionPublished=false,regionRetirement;
    const observer=callOptions.nativeGpuRetirement?.hasPort('native-color')?callOptions.nativeGpuRetirement:null;let proof,retirementCacheOwner,fieldEntered=false,observedFailed=false,observedPrimary;
    if(observer){observer.enter('native-color',owner);const ticket=observer.expect('native-color',owner,'native16-color-owner');proof=observer.adopt(ticket,owner);retirementCacheOwner=observer.cacheOwner(owner,'native16-color-source-cache');}
    try{
    await drainTransients();if(colorRetiring)await releaseColor();
    try{
     if(callOptions.domain){
      requireValue(typeof callOptions.isSourceCurrent==='function'&&callOptions.sourceBinding,'A regional native gradient needs captured Original authority.');
      const authority=source.descriptor,binding=callOptions.sourceBinding,presentation=callOptions.presentationSurface;
      requireValue(binding.nativeSurfaceId===authority.id&&binding.nativeRevision===authority.revision&&/^[a-f0-9]{64}$/.test(binding.sourceSha256??''),'Regional gradient Original binding differs.');
      regionDomain=await compileOriginalSourceRegions(callOptions.domain.descriptor??callOptions.domain);alive();
      requireValue(regionDomain.sourceSha256===binding.sourceSha256&&regionDomain.sourceWidth===d.width&&regionDomain.sourceHeight===d.height,'Regional gradient domain belongs to another native grid.');
      requireValue(presentation?.descriptor?.format==='rgb8'&&presentation.descriptor.width===d.width&&presentation.descriptor.height===d.height&&typeof presentation.readWindow==='function','Regional gradient needs its canonical SDR background on the same grid.');
     }
     if(currentParams.luma==='linear709')await prepareLuminance(linked.signal);else await releaseColor();const before=sourceReads;
     if(regionDomain){
      regionRetirement=transient([async()=>{if(regionRecord&&!regionPublished){await retireCompositeOwners([()=>regionRecord.surface.dispose(),...Object.values(regionRecord.maskRecords??{}).map(value=>()=>value.surface.dispose())],{requireAck:true});regionRecord=null;}},async()=>{if(regionView){await ack(()=>regionView.dispose());regionView=null;}}]);
      regionView=await createSourceRegionView({...surface,sha256:callOptions.sourceBinding.sourceSha256},regionDomain.descriptor,{budget,signal:linked.signal,maxReadPixels:1024**2});alive();
     }
     fieldEntered=true;const record=await gradientFieldSurface(image,currentParams,{budget,signal:linked.signal,onProgress:callOptions.onProgress,rowsPerBlock:callOptions.rowsPerBlock,cacheKey:regionDomain?prefix+'/domain/'+regionDomain.fingerprint+'/'+d.width+'x'+d.height:prefix,backend:callOptions.backend??'auto',nativeGpuRetirement:callOptions.nativeGpuRetirement,...(regionDomain?{domain:regionDomain,view:{descriptor:regionView.descriptor,maxReadPixels:regionView.maxReadPixels,readMaskedWindow:(rect,hooks)=>readLuminanceWindow(regionView,'readMaskedWindow',rect,hooks)},presentationSurface:callOptions.presentationSurface}:{})});let closing;
     regionRecord=record;alive();if(regionRetirement){regionPublished=true;try{await regionRetirement.dispose();}catch(error){regionPublished=false;throw error;}regionRetirement=null;}
     return{...record,provenance:{schema:'sherloq.native-input/1',...native16Descriptor(surface),operation:'detail.gradient',numericalInputDepth:16,presentationOutputDepth:8,...(regionDomain?{sourceRegionDomain:regionDomain.descriptor,sourceRegionPolicy:'gradient-field-omitted-taps-before-prefilter-derivative-and-tensor',excludedParticipation:'omitted-before-prefilter-derivative-and-tensor',presentationOutsideAnalysedSupport:'original-unanalysed',sourceBinding:structuredClone(callOptions.sourceBinding)}:{}),profileConversion:currentParams.luma==='linear709'?(profile?'exact-private-ICC-to-XYZfloat32-to-linear-D65-luminance':'declared-CICP-transfer-and-primaries-to-linear-D65-luminance'):'none-coded-domain',units:NATIVE16_GRADIENT_UNITS,...(currentParams.luma==='linear709'&&!profile&&(color.transfer==='source'||color.transfer==null)?{profileAssumption:'sRGB transfer and BT709 primaries for undeclared RGB source'}:{})},metrics:{...record.metrics,backend:record.metrics.gpuJobs>0?'webgpu':'cpu',renderBackend:'cpu',derivativeBackend:record.metrics.analysisCacheHit?'cached-'+record.metrics.derivativeBackend:record.metrics.derivativeBackend,inputDepth:16,sampleMaximum:65535,nativeCoordinateStep:currentParams.nativeCoordinateStep,sourceReads:sourceReads-before,nativeLinearColorManaged:currentParams.luma==='linear709'&&!!profile},dispose(){if(closing)return closing;const answer=retireCompositeOwners([()=>record.surface.dispose(),...Object.values(record.maskRecords??{}).map(value=>()=>value.surface.dispose())],{requireAck:true});closing=answer;void answer.catch(()=>{if(closing===answer)closing=null;});return answer;}};
    }catch(error){if(regionRetirement)throw withRetirementOwner(error,regionRetirement,error);if(colorRetiring&&!transients.size&&!debt(error))await retireCompositeOwners([releaseColor],{primary:error,requireAck:true});throw error;}
    }catch(error){observedFailed=true;observedPrimary=error;throw error;}
    finally{if(observer)await retireCompositeOwners([()=>{
     if(!fieldEntered&&observer.hasPort('base-gpu'))observer.skip('base-gpu',owner,'before-gradient-field');
     const rowsAcknowledged=transientRegistrations===transientAcknowledgements;
     const cacheState=colorCache?.snapshot();
     const ownedCache=!!colorTransform&&!!colorCache&&typeof colorFee?.bytes==='number'&&colorFee.bytes===COLOR_BYTES&&cacheState?.entries>0&&cacheState.activeHandles>0&&cacheState.heapCapacityBytes>0&&!cacheState.closing&&!cacheState.disposed;
     const ownedLut=!!lumaLut&&lumaReady&&lumaLut.data instanceof Float64Array&&lumaLut.data.length===65536;
     if(!colorObservationKnown||!rowsAcknowledged)proof.unproven(owner);
     else if(!colorRetiring&&(ownedCache||ownedLut))proof.transfer(owner,retirementCacheOwner);
     else if(retiredColorGeneration===colorGeneration)proof.acknowledge(owner);
     else proof.unproven(owner);
     observer.finish('native-color',owner);
    }],observedFailed?{primary:observedPrimary,requireAck:true}:{requireAck:true});}
   })();active=task;void task.finally(()=>{controller.signal.removeEventListener('abort',abort);callOptions.signal?.removeEventListener('abort',abort);if(active===task){active=null;currentSourceCheck=null;}}).catch(()=>{});return task;
  },
  dispose(){if(disposing)return disposing;disposed=true;controller.abort();const task=(async()=>{
   await active?.catch(()=>{});await drainTransients();await retireCompositeOwners([retireFieldCaches,releaseColor],{requireAck:true});budget.clearPrefix(prefix);if(unregister){await ack(()=>unregister());unregister=null;}
  })();disposing=task;void task.catch(()=>{if(disposing===task)disposing=null;});return task;}
 };
 const originalDispose=surface.dispose.bind(surface);let disposingSource;
 surface.dispose=()=>{if(disposingSource)return disposingSource;const task=(async()=>{await owner.dispose();return ack(()=>originalDispose());})();disposingSource=task;void task.catch(()=>{if(disposingSource===task)disposingSource=null;});return task;};return owner;
}

/** The existing field, storage, borders, tensor and GPU owner serve every grid;
 * native16 changes the numerical source and its declared luminance units. */
export function runNative16Gradient(surface,params={},options={}){requireValue(surface?.descriptor?.format==='rgb16'&&options.budget,'A budgeted native gradient source is required.');let owner=owners.get(surface);if(!owner){owner=createOwner(surface,options);owners.set(surface,owner);}return owner.run(params,options);}
