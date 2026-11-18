import {payloadBytes} from './pixel-operations.js';
import {requireValue} from './errors.js';
import {nativeEqualizationProgramPlan} from './equalization-native-program.js';
import {native16EqualizationGpuProgramDescriptor,native16EqualizationGpuProgramPlan} from './equalization-native-gpu.js';
import {native16DisplayCompositionContext,native16DisplayPlan} from './native16-display-owner.js';
import {separationGpuSequenceAdmission} from './separation-gpu-session.js';
import {MAX_DISPLAY_PIXELS} from './display-sampling.js';

// Optional final residency uses the same typed program and GPU layouts as
// production. Source/input-bank residency belongs to the enclosing operation.
// A descriptor is the ACTUAL intermediate domain (e.g. normalized sRGB PCA),
// not necessarily the Original's colour profile or pixel extent.
export function nativeEqualizationSurfaceAdmissionPlan(source,plan,{budget,backend='auto',runtimeBytes=0,storageOverheadBytes=4*1024**2,
 sourceWindowAdditionalBytes,colorBackend='auto',displayAssumption,maximumMemoryBytes,displayMemoryBytes}={}){
 try{
  const d=source?.descriptor??source;
  requireValue(budget?.reserve&&[runtimeBytes,storageOverheadBytes].every(v=>Number.isSafeInteger(v)&&v>=0)&&['cpu','auto','webgpu'].includes(backend),'Invalid native post-equalization admission context.');
  const program=nativeEqualizationProgramPlan(source,plan);if(!program.known)return program;
  if(sourceWindowAdditionalBytes!==undefined)requireValue(Number.isSafeInteger(sourceWindowAdditionalBytes)&&sourceWindowAdditionalBytes>=0,'Source read scratch must be an actual nonnegative byte extent.');
  const context=source?.descriptor?native16DisplayCompositionContext(source):null;
  const color=native16DisplayPlan(context?.nativeSource.descriptor??d,{totalPixels:d.width*d.height,backend:context?.backend??colorBackend,displayAssumption:context?.displayAssumption??displayAssumption,
   ...(context?{maximumPixels:context.maximumPixels,maximumMemoryBytes:context.maximumMemoryBytes,displayMemoryBytes:context.displayMemoryBytes}:
    {...(maximumMemoryBytes===undefined?{}:{maximumMemoryBytes}),...(displayMemoryBytes===undefined?{}:{displayMemoryBytes})})});
  if(!color.known)return{known:false,reason:color.limitation?.code??'native-equalization-color-plan-unknown'};
  const descriptor=native16EqualizationGpuProgramDescriptor(program),hostTable=native16EqualizationGpuProgramPlan(program).hostTableBytes;
  const gpu=separationGpuSequenceAdmission([{width:d.width,height:Math.min(d.height,program.rows),rows:Math.min(d.height,program.rows),params:{mode:2,radius:1,grayscale:false,nativeProgram:true},nativeProgram:descriptor}],{budget,backend,priorBytes:runtimeBytes});
  if(!gpu.known)return gpu;
  const gpuUsed=gpu.available,outputBytes=d.width*d.height*6,metadataBytes=2*payloadBytes({color:d.color,provenance:d.provenance})+4096,
   presentationHeadroom=color.bytes+Math.min(d.width*d.height,MAX_DISPLAY_PIXELS)*9,
   sourceBytes=d.width*Math.min(d.height,program.rows)*6+(sourceWindowAdditionalBytes??program.sourceAdditionalBytes),
   opening=program.retainedBytes+(gpu.openingBytes??0),
   mapping=program.retainedBytes+outputBytes+metadataBytes+presentationHeadroom+sourceBytes+4*1024**2+(gpuUsed?hostTable+gpu.missingResidentBytes+gpu.hostBytes:0),
   display=outputBytes+metadataBytes+presentationHeadroom,
   bytes=runtimeBytes+Math.max(program.preparationBytes,opening,mapping,display)+storageOverheadBytes;
  requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Unsafe native post-equalization admission bound.');
  return{known:true,bytes,completeResidentAlternative:true,outputBytes,retainedResultBytes:outputBytes+metadataBytes,rows:Math.min(d.height,program.rows),parallelWorkers:1,
   nativeEqualization:{levels:65536,method:plan.method.id,programPreparationBytes:program.preparationBytes,programRetainedBytes:program.retainedBytes,
    sourceWindowBytes:sourceBytes,gpuUsed,gpuOpeningBytes:gpu.openingBytes??0,packedHostTableBytes:gpuUsed?hostTable:0,mappingBytes:mapping,displayBytes:display,nativeColorAdmission:color}};
 }catch(error){return{known:false,reason:'native16-post-equalization-plan-uninspectable',detail:error?.message};}
}
