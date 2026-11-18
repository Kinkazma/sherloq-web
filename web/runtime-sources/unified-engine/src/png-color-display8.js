import "../../runtime-context.js?v=0.33.3";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createColorTransformCache} from './color-managed-runtime.js';
import {createNativeColorDisplay} from './native-color-display.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {needsPngColorDisplay8} from './png-colorimetry.js';
const MiB=1024**2,MAX_PIXELS=Math.floor(MiB/6),MEMORY=64*MiB;
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};

function limitedPngDisplay8(header,reason,signal){
 let closed=false;return{
  async convertInPlace(bytes){requireValue(!closed,'PNG8 color owner is closed.');checkAbort(signal);return bytes;},
  provenance(){return{status:'limited',converted:false,colorimetry:'PNG gAMA/cHRM',profileOrigin:'declared-but-not-materialized',embeddedIcc:false,sourceDepth:header.depth,analysisDepth:8,displayDepth:8,reason:{...reason,policy:'existing RGB8 codes retained without claiming an sRGB projection'},declaredColorimetry:structuredClone(header.colorimetry)};},
  async dispose(){closed=true;}
 };
}
export async function createPngColorDisplay8(header,{budget,execution,signal,backend='auto',cooperate=createCooperator(signal)}={},hooks={}){
 // Ordinary PNG8 never enters the CMM, execution planner or its workers.
 if(!needsPngColorDisplay8(header))return null;
 requireValue(budget&&['auto','cpu'].includes(backend),'An admitted PNG8 color owner is required.');checkAbort(signal);
 if(execution!==undefined)requireValue(execution?.budget===budget&&Number.isInteger(execution.capacity?.cpu)&&execution.capacity.cpu>0,'The captured Core color scheduler is required.');
 const gamma=header.colorimetry.gamma;if(gamma&&1/gamma>16)return limitedPngDisplay8(header,{code:'PNG_NOMINAL_PROFILE_CAPACITY',declaredFileGamma:gamma,requiredDecodingGamma:1/gamma,maximumQualifiedDecodingGamma:16},signal);
 const stop=execution?new AbortController():null,workSignal=stop?(signal?AbortSignal.any([signal,stop.signal]):stop.signal):signal;
 // The unchanged envelope owns the local heap/profile, promoted band and
 // display output. Worker lanes and receipts take their own real admissions.
 const started=performance.now(),release=budget.reserve(MEMORY+4*MiB),colors=createColorTransformCache({maximumMemoryBytes:MEMORY,maximumBandBytes:MiB},hooks),declared=header.colorimetry,totalPixels=header.width*header.height;
 let display,displayMetrics,transform,profile,transformOptions,closing=false,closed=false,disposing,pending=Promise.resolve(),operations=0;
 let parallel,parallelReceipt,parallelMetrics,executionPlan,choice,localPreparationMs=0,pixels=0,canonicalSerialPixels=0,firstCanonicalPixels=0,firstCanonicalCpuMs=null,codes,retirementRefused=false,retirementError;
 async function retireStep(action){try{return await ack(action);}catch(error){retirementRefused=true;retirementError=error;throw withRetirementOwner(error,owner,error);}}
 async function retireResult(){if(parallelReceipt){await retireStep(()=>parallel.retireResult(parallelReceipt));parallelReceipt=null;}codes=null;}
 async function chooseExecution(observedBand){
  if(!observedBand?.eligible||executionPlan||pixels>=totalPixels)return;
  const {describeCanonicalColorLane,planCanonicalColorExecution}=await import('./canonical-color-plan.js');
  const lanePlan=describeCanonicalColorLane({inputFormat:'rgb16',outputFormat:'rgb8',profileBytes:profile.byteLength,maximumChunkPixels:Math.min(65536,MAX_PIXELS),maximumMemoryBytes:MEMORY});
  executionPlan=planCanonicalColorExecution({lanePlan,totalPixels,completedPixels:pixels,observedPixels:observedBand.canonicalPixels,
   completedCpuMs:observedBand.canonicalCpuMs,localPreparationMs,schedulerCapacity:execution.capacity.cpu,
   availableBytes:Math.max(0,budget.limit-budget.total()),workspaceBytes:0});
  if(executionPlan.workerCount){
   const {createCanonicalColorExecution}=await import('./canonical-color-execution.js');
   parallel=(hooks.createCanonicalExecution??createCanonicalColorExecution)({budget,scheduler:execution,localTransform:transform,transformOptions,maximumPixels:MAX_PIXELS,executionPlan,signal:workSignal});
  }
 }
 const owner={
  convertInPlace(bytes){const run=async()=>{requireValue(!closing&&!closed&&bytes instanceof Uint8Array&&bytes.length%3===0,'PNG8 color owner and RGB band required.');
   try{for(let at=0;at<bytes.length;at+=MAX_PIXELS*3){checkAbort(workSignal);await cooperate();const part=bytes.subarray(at,Math.min(bytes.length,at+MAX_PIXELS*3)),n=part.length/3;
    codes=new Uint16Array(part.length);for(let i=0;i<part.length;i++)codes[i]=part[i]*257;
    const canAssess=!!execution&&!parallel&&!executionPlan&&pixels+n<totalPixels,before=canAssess?display.metrics():null;let shown,observedBand;
    if(parallel){
     parallelReceipt=await parallel.convert(codes);
     if(parallelReceipt)shown=parallelReceipt.pixels;
     else{
      // Admission declined before acquiring a worker/grant. Retire that empty
      // adapter, then convert this same promoted band with the existing owner.
      await retireStep(()=>parallel.dispose());parallelMetrics=parallel.metrics();parallel=null;
     }
    }
    if(!parallelReceipt){shown=await display.convert(codes,{signal:workSignal});canonicalSerialPixels=display.metrics().canonicalCpuPixels;
     if(canAssess){const {describeCanonicalColorBand}=await import('./canonical-color-plan.js');
      observedBand=describeCanonicalColorBand({pixels:n,elapsedMs:0,displayBefore:before,displayAfter:display.metrics()});choice=observedBand;
      if(observedBand.eligible){firstCanonicalPixels=n;firstCanonicalCpuMs=observedBand.canonicalCpuMs;}
     }
    }
    requireValue(shown instanceof Uint8Array&&shown.length===part.length,'The PNG8 color result differs from its promoted band.');
    checkAbort(workSignal);part.set(shown);shown=null;
    // Consumer ACK is after the complete synchronous copy. A cancellation or
    // failed copy retains the exact receipt until this owner's retirement.
    if(parallelReceipt)await retireResult();else codes=null;
    pixels+=n;await chooseExecution(observedBand);
   }return bytes;}catch(primary){if(primary?.cleanupOwner===colors){retirementRefused=true;retirementError=primary;}if(retirementRefused)throw withRetirementOwner(primary,owner,retirementError);throw primary;}
  };operations++;const task=pending.then(run);pending=task.then(()=>{operations--;},()=>{operations--;});return task;},
  provenance(){return {status:'converted',converted:true,colorimetry:'PNG gAMA/cHRM',profileOrigin:'generated-from-png-colorimetry',embeddedIcc:false,sourceDepth:header.depth,analysisDepth:8,displayDepth:8,sourceSamples:'encoded original retained; RGB8 working pixels projected to sRGB',inputPromotion:'8-bit codes ×257 for CMM staging only',primariesAssumed:!declared.chromaticities,decodingGamma:declared.gamma?1/declared.gamma:2.2,transferAssumed:!declared.gamma,colorProjection:display?.metrics()??displayMetrics,
   ...(execution?{canonicalColorExecution:{canonicalSerialPixels,firstCanonicalBandPixels:firstCanonicalPixels,firstCanonicalBandCpuMs:firstCanonicalCpuMs,
    assessment:executionPlan?.assessment??{decision:choice?.decision??'serial-complete',selectedWorkers:0},costModel:executionPlan?.costModel??null,
    ...(parallel?parallel.metrics():parallelMetrics??{createdWorkers:0,residentWorkers:0,retiredWorkers:0,nativeCloseAcknowledged:0,capturedWorkerExits:0,browserTerminateRequested:0})}}:{})};},
  dispose(){if(closed)return Promise.resolve();if(disposing)return disposing;closing=true;
   // Only an unfinished caller needs cancellation before its pending wait.
   // A complete common owner retires through its own closing/abort sequence.
   if(operations)stop?.abort();
   const task=(async()=>{await pending;await retireResult();
    if(parallel){await retireStep(()=>parallel.dispose());parallelMetrics=parallel.metrics();parallel=null;}
    if(display){await retireStep(()=>display.dispose());displayMetrics=display.metrics();display=null;transform=null;}
    if(transform){await retireStep(()=>transform.dispose());transform=null;}
    await retireStep(()=>colors.dispose());profile=transformOptions=null;await retireStep(()=>release());closed=true;
   })();disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;},
  get retirementPending(){return retirementRefused&&!closed;}
 };
 try{profile=await colors.createRgbProfile({chromaticities:declared.chromaticities,gamma:declared.gamma?1/declared.gamma:2.2},{signal:workSignal});
  transformOptions={inputProfileBytes:profile,inputFormat:'rgb16',outputFormat:'rgb8'};transform=await colors.acquire(transformOptions,{signal:workSignal});
  localPreparationMs=Math.max(0,performance.now()-started);
  display=await createNativeColorDisplay({backend,nativeInput:{sampleType:'uint8',sourceDepth:header.depth,decodedDepth:8,promoted:true},transform,colorCache:colors,totalPixels,maximumPixels:MAX_PIXELS,maximumMemoryBytes:MEMORY,signal:workSignal},hooks.displayHooks??{});return owner;
 }catch(error){const nominalUnavailable=!profile&&['COLOR_PROFILE_REQUIRED','INVALID_INPUT'].includes(error?.code);try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(error,owner,cleanup);}if(nominalUnavailable)return limitedPngDisplay8(header,{code:'PNG_NOMINAL_PROFILE_NOT_MATERIALIZED',cause:error.code},signal);throw error;}
}
export async function projectPngColorDisplay8(pixels,header,options){
 const owner=await createPngColorDisplay8(header,options);if(!owner)return null;let primary,failed=false;
 try{await owner.convertInPlace(pixels.data);return owner.provenance();}catch(error){failed=true;primary=error;throw error;}
 finally{if(!failed||!owner.retirementPending)try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(failed?primary:cleanup,owner,cleanup);}}
}
