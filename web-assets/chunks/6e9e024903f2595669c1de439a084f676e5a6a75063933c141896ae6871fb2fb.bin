import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {createColorTransformCache,COLOR_OUTPUT_PROFILE_MAX_BYTES} from './color-managed-runtime.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
import {createGpuAttemptArray,gpuRetirementFailure} from './gpu-attempt-retirement.js';
import {displayGeometry} from './display-sampling.js';
import {roundEven} from './pixel-utils.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {native16DisplayPlan} from './native16-display-owner.js';
import {payloadBytes} from './pixel-operations.js';
const MiB=1024**2,CMM_BYTES=64*MiB,CODES=65536,LUT_BYTES=CODES*6,AXIS_BYTES=CODES*2;
const SRGB=Object.freeze({model:'RGB',primaries:'srgb',transfer:'srgb'});
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
const profileOf=d=>d.color?.iccProfile??d.color?.profile??null;
const bytesOf=data=>new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
function rectangle(d,{x=0,y=0,width=d.width,height=d.height}={}){requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=d.width-width&&y<=d.height-height,'RGB16 working window is outside its Source.');return{x,y,width,height};}
function adopted(Type,length,budget,label){
 const bytes=length*Type.BYTES_PER_ELEMENT;let data,credit,backing,retired,backingDone=false,notified=false;
 return{get data(){return data;},get bytes(){return data?bytes:0;},reserve(){credit=budget.reserve(bytes);},adopt(value){requireValue(value instanceof Type&&value.length===length,'Working color output differs from its admitted type/extent.');data=value;backing=budget.registerBacking?.('array-buffer',bytes,{owner:'native16-rgb-working',label,identity:value.buffer});},release(){if(!backingDone){retired=backing?.();backing=null;backingDone=true;}if(credit){credit();credit=null;}if(!notified){if(retired!==0&&data)budget.notifyBackingRelease?.('array-buffer',retired??bytes);notified=true;}data=null;}};
}
function sourceExtra(source,rect){
 const d=source.descriptor;if(typeof source.readWindowPlan==='function'){const p=source.readWindowPlan(rect);requireValue(p?.known===true&&p.outputBytes===rect.width*rect.height*6&&Number.isSafeInteger(p.additionalBytes)&&p.additionalBytes>=0,'Working RGB16 Source read plan is not attested.');return p.additionalBytes;}
 return(d.orientation??1)===1&&(d.sourceWidth??d.width)===d.width?0:Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*6;
}
/** One Original owns the exact Gray→RGB16 code mapping. Views over its proxy
 * grids share this context; it never owns or disposes the Original or grids. */
export function createNative16RgbWorkingContext({profileSource,budget,sourceBinding,isCurrent}={},options={},hooks={}){
 const original=profileSource?.descriptor;
 requireValue(original?.format==='rgb16'&&original.depth===16&&budget?.reserve&&typeof isCurrent==='function'&&sourceBinding&&/^[a-f0-9]{64}$/.test(sourceBinding.sourceSha256??'')&&(!sourceBinding.nativeSurfaceId||sourceBinding.nativeSurfaceId===original.id)&&(!sourceBinding.nativeRevision||sourceBinding.nativeRevision===original.revision),'Working RGB16 needs its actual Original profile/binding and budget.');
 const inputProfile=profileOf(original),binding=Object.freeze({...sourceBinding,nativeSurfaceId:original.id,nativeRevision:original.revision}),stop=new AbortController(),pending=new Set(),debts=new Set(),views=new Set();
 if(inputProfile)requireValue(/^[a-f0-9]{64}$/.test(inputProfile.sha256??'')&&Number.isSafeInteger(inputProfile.bytes)&&inputProfile.bytes>=128&&typeof profileSource.readColorProfile==='function','The exact working ICC reader is required.');
 const metaBytes=4096+2*JSON.stringify(binding).length,metadataOwner={free:null,release(){if(this.free){this.free();this.free=null;}}};
 let mode=inputProfile?'uninspected':'passthrough',signature=null,heldProfile,inspection,preparation,lut,outputProfile,outputProfileInfo,metadata,closed=false,closing,setup,unregister,preparations=0,sourceReads=0,lookupPixels=0,reclaims=0;
 const check=signal=>{checkAbort(signal);if(closed||closing)throw new EngineError('CLOSED','RGB16 working context is closing.');if(isCurrent(binding)!==true||profileSource.descriptor.id!==binding.nativeSurfaceId||profileSource.descriptor.revision!==binding.nativeRevision||profileOf(profileSource.descriptor)?.sha256!==inputProfile?.sha256)throw new EngineError('SOURCE_CHANGED','RGB16 working Original/profile changed.');};
 const track=promise=>{pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;};
 async function releaseProfile(){if(heldProfile){await ack(()=>heldProfile.release());heldProfile=null;}}
 async function drain(){for(const owner of [...debts]){await ack(()=>owner.dispose());debts.delete(owner);}}
 const profileDebt={async dispose(){await releaseProfile();debts.delete(profileDebt);}};
 async function borrowProfile(signal){if(heldProfile)return heldProfile;heldProfile=await profileSource.readColorProfile(inputProfile.sha256,{signal,reserve:bytes=>budget.reserve(bytes)});requireValue(heldProfile?.data instanceof Uint8Array&&heldProfile.data.byteLength===inputProfile.bytes&&typeof heldProfile.release==='function','The borrowed Original ICC differs from its declared extent.');return heldProfile;}
 async function inspectProfile({signal}={}){
  check(signal);if(mode!=='uninspected'){if(debts.size)await drain();return mode;}if(inspection)return inspection;
  const task=track((async()=>{try{await drain();const profile=await borrowProfile(signal);check(signal);const data=profile.data,v=new DataView(data.buffer,data.byteOffset,data.byteLength);requireValue(v.getUint32(0,false)>=128&&v.getUint32(0,false)<=data.length&&String.fromCharCode(...data.subarray(36,40))==='acsp','Malformed Original ICC.');requireValue(await sha(data)===inputProfile.sha256,'The actual Original ICC digest differs.');check(signal);signature=String.fromCharCode(...data.subarray(16,20));requireValue(['RGB ','GRAY'].includes(signature),'A working RGB16 source cannot carry an encoded CMYK/unknown profile.');if(signature==='GRAY'){const display=native16DisplayPlan(original,{backend:'cpu',displayAssumption:options.displayAssumption});if(!display.known)throw new EngineError(display.limitation.code,display.limitation.message);if(display.mode==='icc-hdr')throw new EngineError('NATIVE16_GRAY_HDR_POLICY_UNAVAILABLE','The maintained HDR ICC policy requires an RGB profile; no Gray HDR working basis is invented.');}mode=signature==='GRAY'?'gray-icc-to-srgb16':'passthrough';if(mode==='passthrough')try{await releaseProfile();}catch(error){debts.add(profileDebt);throw withRetirementOwner(error,profileDebt,error);}return mode;}catch(error){if(debts.has(profileDebt))throw error;try{await releaseProfile();}catch(cleanup){debts.add(profileDebt);throw gpuRetirementFailure(error,profileDebt,cleanup);}throw error;}})());inspection=task;void task.finally(()=>{if(inspection===task)inspection=null;}).catch(()=>{});return task;
 }
 async function prepare({signal}={}){
  check(signal);await inspectProfile({signal});if(mode==='passthrough'||lut?.data)return api;if(preparation)return preparation;
  const task=track((async()=>{await drain();check(signal);let cache,transform,axis,fee,copies,candidate,profileCandidate,profileInfoCandidate,keep=false,flight,retireRefused=false;
   const owner={dispose(){if(flight)return flight;const run=(async()=>{if(transform){await ack(()=>transform.dispose());transform=null;}if(cache){await ack(()=>cache.dispose());cache=null;}if(axis){axis.release();axis=null;}if(copies){copies();copies=null;}await releaseProfile();if(fee){fee();fee=null;}if(!keep){if(candidate){candidate.release();candidate=null;}if(profileCandidate){profileCandidate.release();profileCandidate=null;}}debts.delete(owner);})();flight=run;void run.finally(()=>{if(flight===run)flight=null;}).catch(()=>{});return run;}};
   setup=owner;debts.add(owner);
   try{
    const profile=await borrowProfile(signal);check(signal);requireValue(await sha(profile.data)===inputProfile.sha256,'The Original Gray profile changed before LUT preparation.');
    fee=budget.reserve(CMM_BYTES+2*COLOR_NATIVE_RESOURCE.bytes+2*COLOR_OUTPUT_PROFILE_MAX_BYTES);copies=budget.reserve(inputProfile.bytes*2);
    cache=(hooks.createColorTransformCache??createColorTransformCache)({maximumMemoryBytes:CMM_BYTES,maxEntries:1,maximumBandBytes:AXIS_BYTES},{...hooks.colorHooks,signal:stop.signal});
    transform=await cache.acquire({inputProfileBytes:profile.data,inputFormat:'gray16',outputFormat:'rgb16',intent:original.color?.renderingIntent??1,blackPointCompensation:original.color?.blackPointCompensation??false},{signal});check(signal);
    requireValue(transform.metadata.inputProfileSha256===inputProfile.sha256&&transform.metadata.inputFormat==='gray16'&&transform.metadata.outputFormat==='rgb16'&&transform.metadata.outputColorSpace==='srgb','The existing CMM did not attest true Gray16→sRGB16.');
    axis=createGpuAttemptArray(Uint16Array,CODES,{budget,owner:'native16-rgb-working',label:'gray16-code-axis'});axis.allocate();for(let i=0;i<CODES;i++)axis.data[i]=i;
    candidate=adopted(Uint16Array,CODES*3,budget,'gray16-to-srgb16-lut');candidate.reserve();candidate.adopt(transform.convert(axis.data,{signal}));check(signal);
    const generated=transform.outputProfileBytes;requireValue(generated instanceof Uint8Array&&generated.length>=128&&generated.length<=COLOR_OUTPUT_PROFILE_MAX_BYTES&&String.fromCharCode(...generated.subarray(16,20))==='RGB '&&String.fromCharCode(...generated.subarray(36,40))==='acsp','The real generated working profile is not RGB ICC.');
    if(!outputProfile){profileCandidate=adopted(Uint8Array,generated.length,budget,'working-srgb16-profile');profileCandidate.reserve();profileCandidate.adopt(generated);const digest=await sha(generated);check(signal);profileInfoCandidate=Object.freeze({sha256:digest,bytes:generated.length,storage:'private-working-color-owner'});}
    keep=true;try{await owner.dispose();}catch(error){keep=false;retireRefused=true;throw withRetirementOwner(error,owner,error);}
    lut=candidate;candidate=null;if(profileCandidate){outputProfile=profileCandidate;profileCandidate=null;outputProfileInfo=profileInfoCandidate;}metadata=Object.freeze(workingProvenance());preparations++;return api;
   }catch(error){keep=false;if(retireRefused)throw error;try{await owner.dispose();}catch(cleanup){throw gpuRetirementFailure(error,owner,cleanup);}throw error;}finally{if(setup===owner)setup=null;}
  })());preparation=task;void task.finally(()=>{if(preparation===task)preparation=null;}).catch(()=>{});return task;
 }
 function workingProvenance(){return{operation:'gray-icc-to-working-srgb16',originalNativeSurfaceId:original.id,originalNativeRevision:original.revision,inputProfileSha256:inputProfile?.sha256,inputProfileBytes:inputProfile?.bytes,inputFormat:'gray16',outputFormat:'rgb16',outputColorSpace:'srgb',intent:original.color?.renderingIntent??1,blackPointCompensation:original.color?.blackPointCompensation??false,lutCodes:CODES,lutBytes:LUT_BYTES,interpolation:'none',originalSamplesPreserved:true,...(outputProfileInfo?{outputProfile:outputProfileInfo}:{})};}
 function futureMetadataBytes(){if(mode!=='gray-icc-to-srgb16'||outputProfileInfo)return 0;const summary=64+('sha256'.length*2+128+32)+('bytes'.length*2+8+32)+('storage'.length*2+'private-working-color-owner'.length*2+32);return 2*((2*'workingIccProfile'.length+32+summary)+(2*'outputProfile'.length+32+summary));}
 function color(){return mode==='gray-icc-to-srgb16'?Object.freeze({...SRGB,...(outputProfileInfo?{workingIccProfile:outputProfileInfo}:{})}):original.color;}
 function workingDescriptor(source){const d=source.descriptor;return{width:d.width,height:d.height,format:'rgb16',depth:16,channels:3,sourceDepth:d.sourceDepth,color:mode==='gray-icc-to-srgb16'?color():d.color,provenance:mode==='gray-icc-to-srgb16'?workingProvenance():d.provenance,coordinates:d.coordinates??'full-resolution'};}
 function readPlan(source,{rect,tile,display=false}={}){
  const d=source.descriptor;
  if(tile){const g=displayGeometry(d,tile),pixels=g.width*g.height,sourceRowBytes=Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*6,inner=sourceExtra(source,{x:0,y:0,width:d.width,height:1});return{known:true,outputBytes:pixels*(display?3:6),additionalBytes:pixels*6+sourceRowBytes+inner+(display?pixels*6:0),sourceLoanBytes:pixels*6,sourceRowBytes};}
  const r=rectangle(d,rect),bytes=r.width*r.height*6,extra=sourceExtra(source,r)+(typeof source.readWindowInto==='function'?0:bytes);return{known:true,outputBytes:bytes,additionalBytes:extra,sourceLoanBytes:typeof source.readWindowInto==='function'?0:bytes};
 }
 function plan(source,request={}){
  requireValue(source?.descriptor?.format==='rgb16'&&source.descriptor.depth===16,'An actual native RGB16 input grid is required.');
  if(mode==='uninspected'||debts.size||preparation||closing||closed)return{known:false,reason:'working-rgb16-profile-or-retirement-unattested'};
  const gray=mode==='gray-icc-to-srgb16',residentBytes=metaBytes+(heldProfile?.data?.byteLength??0)+(lut?.bytes??0)+(outputProfile?.bytes??0),retained=gray?metaBytes+LUT_BYTES+(outputProfile?.bytes??COLOR_OUTPUT_PROFILE_MAX_BYTES):metaBytes,
   preparationBytes=gray&&!lut?.data?CMM_BYTES+2*COLOR_NATIVE_RESOURCE.bytes+2*COLOR_OUTPUT_PROFILE_MAX_BYTES+inputProfile.bytes*2+(heldProfile?0:inputProfile.bytes)+AXIS_BYTES+LUT_BYTES+(outputProfile?0:COLOR_OUTPUT_PROFILE_MAX_BYTES):0;
  return{known:true,mode,workingDescriptor:workingDescriptor(source),metadataBytes:futureMetadataBytes(),residentBytes,retainedBytes:retained,missingRetainedBytes:gray?(lut?0:LUT_BYTES)+(outputProfile?0:COLOR_OUTPUT_PROFILE_MAX_BYTES):0,additionalPreparationBytes:preparationBytes,preparationPeakBytes:residentBytes+preparationBytes,readPlan:gray?readPlan(source,request):{known:true,outputBytes:rectangle(source.descriptor,request.rect).width*rectangle(source.descriptor,request.rect).height*6,additionalBytes:sourceExtra(source,rectangle(source.descriptor,request.rect))},profileInspectionBytes:inputProfile?.bytes??0};
 }
 async function map(target,pixels,signal){const cooperate=createCooperator(signal);for(let p=0;p<pixels;p++){if(p%8192===0){await cooperate();check(signal);}const at=p*3,value=target[at];requireValue(target[at+1]===value&&target[at+2]===value,'The Original Gray ICC does not describe unequal source RGB channels.');target[at]=lut.data[value*3];target[at+1]=lut.data[value*3+1];target[at+2]=lut.data[value*3+2];}lookupPixels+=pixels;check(signal);}
 // Colour authority contains no grid reader, storage or LUT reference. Its
 // closure is created at Original-context scope, outside any input-grid view.
 function grayColorContext(descriptor){
  const captured=Object.freeze({...descriptor,color:Object.freeze({...color()}),provenance:Object.freeze({...workingProvenance()})}),profileHash=outputProfileInfo.sha256,
   authority=Object.freeze({descriptor:captured,readColorProfile:readOutputProfile}),colorBinding=Object.freeze({...binding,originalNativeSurfaceId:original.id,originalNativeRevision:original.revision,nativeSurfaceId:captured.id,nativeRevision:captured.revision,workingProfileSha256:profileHash});
  return{nativeSource:authority,sourceBinding:colorBinding,isCurrent:()=>!closed&&isCurrent(binding)===true&&profileSource.descriptor.id===original.id&&profileSource.descriptor.revision===original.revision&&outputProfileInfo?.sha256===profileHash};
 }
 function view(source){
  requireValue(source?.descriptor?.format==='rgb16'&&source.descriptor.depth===16&&typeof source.readWindow==='function','A real native RGB16 input grid is required.');
  const d=source.descriptor,sampled=d.provenance?.sampledNative16;requireValue(source===profileSource||sampled?.parentSurfaceId===original.id&&sampled.parentRevision===original.revision&&Number.isSafeInteger(sampled.step)&&sampled.step>=1&&d.width===Math.ceil(original.width/sampled.step)&&d.height===Math.ceil(original.height/sampled.step),'The RGB16 input is not this Original or its certified native grid.');requireValue(profileOf(d)?.sha256===inputProfile?.sha256,'The input grid carries another Original profile.');let retired=false;const reads=new Set(),id=crypto.randomUUID();
  const alive=signal=>{check(signal);if(retired)throw new EngineError('CLOSED','The working input grid view is closed.');},run=work=>{const task=track(work());reads.add(task);task.then(()=>reads.delete(task),()=>reads.delete(task));return task;};
  const descriptor=Object.freeze({id,revision:1,width:d.width,height:d.height,format:'rgb16',depth:16,channels:3,channelOrder:'RGB',range:Object.freeze([0,65535]),byteOrder:'little-endian',sourceDepth:d.sourceDepth,sourceWidth:d.width,sourceHeight:d.height,orientation:1,coordinates:d.coordinates??'full-resolution',storage:'virtual-working-rgb16',get color(){return color();},get provenance(){return metadata??Object.freeze(workingProvenance());}});
  const surface={descriptor,
   readWindow(rect={},call={}){return run(async()=>{
    alive(call.signal);await prepare(call);if(mode==='passthrough')return source.readWindow(rect,call);
    const r=rectangle(d,rect),owned=createGpuAttemptArray(Uint16Array,r.width*r.height*3,{budget,owner:'native16-rgb-working',label:'working-rgb16-window'});let child;
    const debt={async dispose(){if(child){await ack(()=>child.dispose());child=null;}owned.release();debts.delete(debt);}};debts.add(debt);
    try{owned.allocate();await fill(r,owned.data,call);debts.delete(debt);return{origin:[r.x,r.y],surfaceId:id,revision:1,pixels:{width:r.width,height:r.height,format:'rgb16',space:'RGB',channels:3,depth:16,sourceDepth:d.sourceDepth,color:color(),data:owned.data},release(){try{owned.release();}catch(error){debts.add(debt);throw withRetirementOwner(error,debt,error);}}};}
    catch(error){if(error?.cleanupOwner&&error.cleanupOwner!==debt){child=error.cleanupOwner;throw withRetirementOwner(error,debt,error);}try{await debt.dispose();}catch(cleanup){throw withRetirementOwner(error,debt,cleanup);}throw error;}
   });},
   readWindowInto(rect,target,call={}){return run(async()=>{alive(call.signal);await prepare(call);if(mode==='passthrough')return source.readWindowInto(rect,target,call);return fill(rectangle(d,rect),target,call);});},
   readWindowPlan(rect){return plan(source,{rect}).readPlan;},
   readNativeSampledWindow(tile,call={}){return run(async()=>{
    alive(call.signal);await prepare(call);if(mode==='passthrough')return source.readNativeSampledWindow(tile,call);requireValue(typeof source.readNativeSampledWindow==='function','Native sampled Source reader required.');
    const g=displayGeometry(d,tile),owned=createGpuAttemptArray(Uint16Array,g.width*g.height*3,{budget,owner:'native16-rgb-working',label:'working-rgb16-sampled'});let input,child,refused=false;
    const debt={async dispose(){if(child){await ack(()=>child.dispose());child=null;}if(input){await ack(()=>input.release());input=null;}owned.release();debts.delete(debt);}};debts.add(debt);
    try{owned.allocate();input=await source.readNativeSampledWindow(tile,call);sourceReads++;requireValue(input?.pixels?.data instanceof Uint16Array&&input.pixels.data.length===owned.data.length,'Native working sample shape differs.');owned.data.set(input.pixels.data);
     try{await ack(()=>input.release());input=null;}catch(error){refused=true;throw error;}
     await map(owned.data,g.width*g.height,call.signal);alive(call.signal);debts.delete(debt);
     return{origin:[g.x,g.y],samplingStep:g.step,logicalRect:{x:g.x,y:g.y,width:g.w,height:g.h},pixels:{width:g.width,height:g.height,format:'rgb16',space:'RGB',channels:3,depth:16,sourceDepth:d.sourceDepth,color:color(),data:owned.data},release(){try{owned.release();}catch(error){debts.add(debt);throw withRetirementOwner(error,debt,error);}}};
    }catch(error){if(error?.cleanupOwner&&error.cleanupOwner!==debt)child=error.cleanupOwner;if(refused||child)throw withRetirementOwner(error,debt,error);try{await debt.dispose();}catch(cleanup){throw withRetirementOwner(error,debt,cleanup);}throw error;}
   });},
   readColorProfile(hash,call={}){return readOutputProfile(hash,call);},
   dispose(){retired=true;return Promise.allSettled([...reads]).then(()=>{views.delete(result);});}
  };
  async function fill(r,target,call){
   requireValue(target instanceof Uint16Array&&target.length>=r.width*r.height*3,'Working RGB16 target is too small.');let input,child,refused=false;
   const debt={async dispose(){if(child){await ack(()=>child.dispose());child=null;}if(input){await ack(()=>input.release());input=null;}debts.delete(debt);}};debts.add(debt);
   try{const selected=target.subarray(0,r.width*r.height*3);
    if(typeof source.readWindowInto==='function'){input=await source.readWindowInto(r,selected,call);requireValue(input?.pixels?.data instanceof Uint16Array&&input.pixels.data.buffer===selected.buffer&&input.pixels.data.byteOffset===selected.byteOffset&&input.pixels.data.length===selected.length,'The Source Into reader returned another target.');}
    else{input=await source.readWindow(r,call);requireValue(input?.pixels?.data instanceof Uint16Array&&input.pixels.data.length===selected.length,'The Source window returned another extent.');selected.set(input.pixels.data);}
    sourceReads++;try{await ack(()=>input.release());input=null;}catch(error){refused=true;throw error;}
    await map(selected,r.width*r.height,call.signal);alive(call.signal);debts.delete(debt);return{origin:[r.x,r.y],pixels:{width:r.width,height:r.height,format:'rgb16',space:'RGB',channels:3,depth:16,sourceDepth:d.sourceDepth,color:color(),data:selected},release(){}};
   }catch(error){if(error?.cleanupOwner&&error.cleanupOwner!==debt)child=error.cleanupOwner;if(refused||child)throw withRetirementOwner(error,debt,error);try{await debt.dispose();}catch(cleanup){throw withRetirementOwner(error,debt,cleanup);}throw error;}
  }
  const result={get surface(){requireValue(mode!=='uninspected'&&(mode==='passthrough'||outputProfile?.data),'The working profile must be prepared before its actual view is used.');return mode==='passthrough'?source:surface;},colorContext(){if(mode==='passthrough')return{nativeSource:profileSource,sourceBinding:binding,isCurrent:()=>!closed&&isCurrent(binding)===true&&profileSource.descriptor.id===original.id&&profileSource.descriptor.revision===original.revision};return grayColorContext(result.surface.descriptor);},dispose:()=>surface.dispose()};views.add(result);return result;
 }
 function readOutputProfile(hash,{signal,reserve=bytes=>budget.reserve(bytes)}={}){check(signal);requireValue(outputProfile?.data&&hash===outputProfileInfo?.sha256,'This exact RGB working profile is unavailable.');const owned=createGpuAttemptArray(Uint8Array,outputProfile.data.length,{budget:{...budget,reserve,registerBacking:budget.registerBacking?.bind(budget),notifyBackingRelease:budget.notifyBackingRelease?.bind(budget)},owner:'native16-rgb-working',label:'working-profile-read'});try{owned.allocate();owned.data.set(outputProfile.data);return{data:owned.data,release:()=>owned.release()};}catch(error){try{owned.release();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:()=>owned.release()},cleanup);}throw error;}}
 const api={inspectProfile,prepare,plan,view,snapshot(){return{mode,signature,ready:!!lut?.data,closed,closing:!!closing,preparations,sourceReads,lookupPixels,reclaims,lutBytes:lut?.bytes??0,workingProfile:outputProfileInfo??null,retainedBytes:metaBytes+(heldProfile?.data?.byteLength??0)+(lut?.bytes??0)+(outputProfile?.bytes??0),pending:pending.size,views:views.size,debts:debts.size,originalNativeSurfaceId:original.id};},async reclaim(){if(preparation||pending.size||debts.size||views.size||closed||closing)return 0;if(!lut)return 0;const bytes=lut.bytes;lut.release();lut=null;reclaims++;return bytes;},dispose(){if(closing)return closing;const task=(async()=>{stop.abort();await Promise.allSettled([...pending]);await drain();if(setup)await setup.dispose();await releaseProfile();if(lut){lut.release();lut=null;}if(outputProfile){outputProfile.release();outputProfile=null;}metadataOwner.release();unregister?.();closed=true;})();closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;}};
 hooks.onOwner?.(api);try{metadataOwner.free=budget.reserve(metaBytes);unregister=budget.registerAsyncReclaimer?.(()=>api.reclaim(),{owner:'native16-rgb-working',label:'idle-gray16-rgb16-lut'});}catch(error){throw gpuRetirementFailure(error,api,error);}return api;
}
