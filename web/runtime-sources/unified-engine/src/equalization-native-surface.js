import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgb16Surface} from './rgb16-surface.js';
import {payloadBytes} from './pixel-operations.js';
import {native16DisplayCompositionContext,createNative16DisplayOwner,native16DisplayPlan} from './native16-display-owner.js';
import {MAX_DISPLAY_PIXELS} from './display-sampling.js';
import {openSeparationGpu} from './separation-gpu-session.js';
import {createNativeEqualizationScope} from './equalization-native-owner.js';
import {prepareNativeEqualization} from './equalization-native-program.js';
import {applyNativeEqualizationBands} from './equalization-native-bands.js';

// A post equalizer consumes the actual preceding scientific surface. Its
// profile authority can outlive that intermediate; its pixel data cannot be
// silently replaced by the Original, an SDR rendering, or a second gain map.
export async function equalizationNativeSurface(source,plan,{budget,signal,onProgress,contains,temporarySession,getTemporarySession,backend='cpu',gpu:borrowedGpu,nativeGpuRetirement,retirementCacheOwner,retirementOwner,retirementPort='base-gpu'}={}){
 const d=source?.descriptor;requireValue(d?.format==='rgb16'&&d.depth===16&&budget?.reserve&&['cpu','auto','webgpu'].includes(backend),'An admitted RGB16 post-equalization surface is required.');
 const scope=createNativeEqualizationScope(),started=performance.now(),colorContext=native16DisplayCompositionContext(source);
 const plainSrgb=!d.color?.iccProfile&&!d.color?.profile&&String(d.color?.primaries).toLowerCase()==='srgb'&&['srgb','iec61966-2-1'].includes(String(d.color?.transfer).toLowerCase());
 requireValue(colorContext||plainSrgb,'Native post-equalization requires the captured working-color authority.');
 if(colorContext)requireValue(colorContext.budget===budget&&colorContext.isCurrent(colorContext.sourceBinding),'Native post-equalization lost its Original/profile authority.');
 const colorPlan=native16DisplayPlan(colorContext?.nativeSource.descriptor??d,{totalPixels:d.width*d.height,backend:colorContext?.backend??'auto',displayAssumption:colorContext?.displayAssumption,
  ...(colorContext?{maximumPixels:colorContext.maximumPixels,maximumMemoryBytes:colorContext.maximumMemoryBytes,displayMemoryBytes:colorContext.displayMemoryBytes}:{})});
 if(!colorPlan.known)throw new EngineError(colorPlan.limitation.code,colorPlan.limitation.message);
 let program,gpu=borrowedGpu,store,storeEntry,finalSurface,finalEntry,metadataEntry,color,headroomEntry;
 try{
  program=await prepareNativeEqualization(source,plan,{budget,signal,onProgress,contains});scope.adopt(program);
  if(!gpu&&backend!=='cpu'&&!contains)gpu=await openSeparationGpu({budget,backend,signal,sampleDepth:16,native16GaussianRadius:25,nativeGpuRetirement,
   retirementTicket:nativeGpuRetirement?.expect(retirementPort,retirementOwner,'equalization16-open'),retirementCacheOwner,onOwner:value=>scope.adopt(value)});
  const metadataBytes=2*payloadBytes({color:d.color,provenance:d.provenance})+4096;
  metadataEntry=scope.adopt(budget.reserve(metadataBytes));
  // This is temporary headroom, not a second CMM. It keeps an optional RAM
  // final from consuming the capacity needed by its real presentation reader.
  headroomEntry=scope.adopt(budget.reserve(colorPlan.bytes+Math.min(d.width*d.height,MAX_DISPLAY_PIXELS)*9));
  store=await createSegmentedBytes(d.width*d.height*6,{budget,temporarySession,getTemporarySession,signal,owner:'native-equalization',label:'native16-post-equalization'});storeEntry=scope.adopt(store);
  const mapped=await applyNativeEqualizationBands(source,program,store,{budget,signal,gpu,containsAll:!contains,onProgress,nativeGpuRetirement,retirementCacheOwner,retirementOwner,retirementPort});
  checkAbort(signal);if(colorContext)requireValue(colorContext.isCurrent(colorContext.sourceBinding),'Native post-equalization Original changed before publication.');
  if(colorContext)color=createNative16DisplayOwner({...colorContext,totalPixels:d.width*d.height});
  const colorEntry=color?scope.adopt(color):null;
  finalSurface=createRgb16Surface(store,{width:d.width,height:d.height,budget,sourceDepth:d.sourceDepth,color:d.color,provenance:d.provenance,displayTransform:color?.displayTransform});finalEntry=scope.adopt(finalSurface);
  scope.forget(storeEntry);storeEntry=null;store=null;
  if(color){color.attach(finalSurface);scope.forget(colorEntry);}
  const dispose=finalSurface.dispose.bind(finalSurface),credit=metadataEntry.value;let flight,done=false;
  finalSurface.dispose=()=>{if(done)return Promise.resolve();if(flight)return flight;const task=(async()=>{try{await dispose();const ack=await credit();if(ack===false||ack===0)throw ack;done=true;}catch(error){throw withRetirementOwner(error,finalSurface,error);}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;};
  scope.forget(metadataEntry);metadataEntry=null;
  await scope.drop(headroomEntry);headroomEntry=null;scope.forget(finalEntry);finalEntry=null;
  try{await scope.dispose();}catch(error){scope.adopt(finalSurface);throw error;}
  return{surface:finalSurface,metrics:{equalization:{method:plan.method.id,value:plan.value,inputDepth:16,outputDepth:16,levels:65536,
   domain:'actual-native16-intermediate',channels:plan.channels?'RGB':'HSV-V',boundedWindows:true,statistics:program.metrics,mapping:mapped,backend:mapped.backend,elapsedMs:performance.now()-started},retainedResultBytes:d.width*d.height*6+metadataBytes},dispose:()=>finalSurface.dispose()};
 }catch(error){scope.adoptFailure(error);if(gpuRetirementBlocked(error))throw withRetirementOwner(error,scope,error);try{await scope.dispose();}catch(cleanup){throw withRetirementOwner(error,scope,cleanup);}throw error;}
}
