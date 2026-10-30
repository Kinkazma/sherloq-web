import "../../runtime-context.js?v=0.30.0";
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {payloadBytes} from './pixel-operations.js';
import {sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {createGenerationContextImage} from './source-region-generation.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';

const VERSION='spai-original224-grid224-exactmask16-realfft-v1',N=224;
export function nativeSpaiContextAdmission(operation,rect){
 requireValue(operation==='ai.generation.spai','No qualified SPAI context definition for this operation.');
 requireValue(rect&&Number.isSafeInteger(rect.width)&&Number.isSafeInteger(rect.height)&&rect.width>0&&rect.height>0&&Number.isSafeInteger(rect.width*rect.height),'Positive native SPAI dimensions are required.');
 const rows=Math.floor(Math.max(N,rect.height)/N),columns=Math.floor(Math.max(N,rect.width)/N),grid=rows*columns;
 requireValue(Number.isSafeInteger(grid),'SPAI grid exceeds exact integer geometry.');
 return{evaluable:true,reason:null,nativeMinimum:[1,1],windowCount:grid<4?5:grid};
}
const roundEven=v=>{const f=Math.floor(v);return v-f===.5?(f%2?f+1:f):Math.round(v);};

/** Describes the native sampler, not a replacement for SPAI preprocessing. */
export function nativeSpaiSampling(width,height){
 const admission=nativeSpaiContextAdmission('ai.generation.spai',{width,height}),h=Math.max(height,N),w=Math.max(width,N),rows=Math.floor(h/N),columns=Math.floor(w/N),padding=[Math.floor((h-height)/2),Math.floor((w-width)/2)],five=rows*columns<4,origins=[];
 if(five)origins.push([0,0],[0,w-N],[h-N,0],[h-N,w-N],[roundEven((h-N)/2),roundEven((w-N)/2)]);
 else for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)origins.push([y*N,x*N]);
 const windows=origins.map(([y,x],index)=>({index,originPixels:[y,x],sourceObservationBounds:[width<N?0:x,height<N?0:y,width<N?width:x+N,height<N?height:y+N]}));
 // Every reflected short-axis patch visits that complete axis; the long-axis
 // observations are unpadded224-pixel intervals. Count their union only once.
 const ys=five?[...new Set(windows.flatMap(window=>[window.sourceObservationBounds[1],window.sourceObservationBounds[3]]))].sort((a,b)=>a-b):[];let observedPixels=five?0:Math.min(width,columns*N)*Math.min(height,rows*N);
 for(let i=1;i<ys.length;i++){const top=ys[i-1],bottom=ys[i],spans=windows.map(window=>window.sourceObservationBounds).filter(b=>b[1]<bottom&&b[3]>top).map(b=>[b[0],b[2]]).sort((a,b)=>a[0]-b[0]);let left,right,total=0;for(const[a,b]of spans){if(right===undefined){left=a;right=b;}else if(a>right){total+=right-left;left=a;right=b;}else right=Math.max(right,b);}if(right!==undefined)total+=right-left;observedPixels+=total*(bottom-top);}
 return{preprocessingVersion:VERSION,nativeWindowShape:[N,N],windowCount:admission.windowCount,mode:five?'five-native-positions':'complete-native-grid',nativeGridShape:[rows,columns],reflectionPadding:padding,spectralMaskRadius:16,windows,observedPixels};
}

/** Separate native context classifications; no score is inferred for their union. */
export async function sourceRegionSpai({task,original,view,domain,budget,signal,onProgress,runNative}){
 requireValue(task.operation==='ai.generation.spai'&&typeof runNative==='function','A SPAI native context runner is required.');
 requireValue(original.sha256===domain.sourceSha256,'SPAI context belongs to another Original.');
 requireValue(view?.domain?.fingerprint===domain.fingerprint&&view.domain.sourceSha256===domain.sourceSha256,'SPAI view differs from its bound source domain.');
 if(domain.empty||domain.countIncluded===0)throw new EngineError('SOURCE_SCOPE_EMPTY','No original pixels are admitted by this SPAI selection.');
 const unlocalized=sourceRegionUnlocalizedInput(task);if(unlocalized)throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind SPAI geometry into its native source domain before analysis.',{details:{unlocalizedInput:unlocalized}});
 if([task,task.params].some(owner=>Array.isArray(owner?.exclusions)&&owner.exclusions.length))throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind SPAI exclusions into its native source domain before analysis.');
 let count=0,windows=0;for(const rect of view.admittedRectangles()){windows+=nativeSpaiContextAdmission(task.operation,rect).windowCount;requireValue(Number.isSafeInteger(windows),'SPAI context plans exceed exact integer geometry.');if(++count%128===0)await controlCheckpoint(signal);}
 const leases=[],fragments=[];let selected=0,observed=0;
 try{
  const taskBytes=sourceRegionTransportBytes(task,{allowUndefined:true,allowAliases:true}),decodeBytes=sourceRegionTransportBytes(original.provenance??null,{allowUndefined:true,allowAliases:true});
  // Admit every variable-length plan before constructing it or reading RGB.
  leases.push(budget.reserve(65536+count*(16384+decodeBytes*2)+windows*2048+sourceRegionTransportBytes(domain.descriptor,{allowAliases:true})*2+taskBytes*2));
  const capturedTask=structuredClone(task);
  for(const rect of view.admittedRectangles()){
   await controlCheckpoint(signal);const index=fragments.length,bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],originalBounds=bounds.map((v,i)=>v+domain.origin[i%2]),admission=nativeSpaiContextAdmission(task.operation,rect),sampling=nativeSpaiSampling(rect.width,rect.height),metadata={id:'spai-context-'+index,bounds,originalBounds,nativeDimensions:[rect.width,rect.height],evaluable:true,nativeMinimum:admission.nativeMinimum,nativeSampling:{...sampling,windows:sampling.windows.map(window=>({...window,originalObservationBounds:window.sourceObservationBounds.map((v,i)=>v+originalBounds[i%2])}))},nativeObservedPixels:sampling.observedPixels};
   const image=createGenerationContextImage({original,view,domain,rect,budget}),copy=budget.reserve(taskBytes*2);let result;
   try{const nativeTask=structuredClone(capturedTask);nativeTask.id=capturedTask.id+'/context/'+index;nativeTask.sourceRegionDomain=undefined;nativeTask.regions=undefined;result=await runNative(nativeTask,image,{signal,onProgress:event=>{checkAbort(signal);onProgress?.({...event,fragmentIndex:index,fragments:count});checkAbort(signal);}});}finally{copy();}
   checkAbort(signal);if(result?.status!=='ok')throw new EngineError(result?.error?.code??'MODEL_FAILED',result?.error?.message??'Native SPAI context failed.',{details:result?.error?.details});
   requireValue(result.operation===task.operation&&!result.surface,'Unexpected native SPAI result.');
   requireValue(result.data?.method==='spai'&&result.data.patch_count===sampling.windowCount&&Number.isFinite(result.data.scores?.global_logit)&&Number.isFinite(result.data.scores?.sigmoid_score_uncalibrated),'SPAI must retain the native patch count and finite learned-aggregator score.');
   leases.push(budget.reserve(2048+payloadBytes(result.data)*2+payloadBytes(result.provenance)*2+payloadBytes(result.metrics)*2));
   fragments.push({...metadata,status:'analysed',data:structuredClone(result.data),nativeProvenance:structuredClone(result.provenance),nativeMetrics:structuredClone(result.metrics)});selected+=rect.width*rect.height;observed+=sampling.observedPixels;
  }
  requireValue(selected===domain.countIncluded,'SPAI contexts must cover every admitted observation.');checkAbort(signal);
  return{id:capturedTask.id,imageId:capturedTask.imageId,operation:capturedTask.operation,status:'ok',data:{independentNativeContexts:true,sourceRegionEvaluation:'evaluated',fragments},layers:[],metrics:{selectedPixels:selected,analysedPixels:observed,nativeObservedPixels:observed,evaluatedContextPixels:selected,nativeUnobservedPixels:selected-observed,unclassifiedContextPixels:0,unanalysablePixels:0,fragmentCount:count,evaluatedContexts:count},provenance:{params:structuredClone(capturedTask.params??{}),sourceRegionDomain:domain.descriptor,originalSha256:original.sha256,excludedParticipation:'absent-before-native-preprocessing-and-model',aggregation:'none across contexts; each unchanged SPAI learned aggregator receives its native feature rows',coverage:'analysedPixels counts distinct Original observations contributing to native224 windows. Reflection and overlaps count once. Native grid remainders or sampling gaps have no local score and are not failed inferences.'},semantics:'Each admitted RGB context uses the unchanged SPAI224 sampler, real FFT radius16 spectral branches, encoder and learned aggregator. Native sampling classifies a context; it is not pixel-wise localization or exhaustive coverage. No score or verdict for the union is fabricated.'};
 }finally{for(const release of leases)release();}
}
