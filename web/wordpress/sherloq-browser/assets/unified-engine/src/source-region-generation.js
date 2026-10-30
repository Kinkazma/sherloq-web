import "../../runtime-context.js?v=0.30.0";
import {allocateOwnedTypedArray} from './allocation.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {payloadBytes} from './pixel-operations.js';
import {sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {requireValue,checkAbort,controlCheckpoint,createCooperator,EngineError} from './errors.js';

// This admission is deliberately method-specific. SPAI and spatial extension
// models require their own review and are not enabled by this B-Free adapter.
export function nativeGenerationContextAdmission(operation,rect){
 requireValue(operation==='ai.generation.bfree','No qualified native context definition for this generation method.');
 requireValue(rect&&Number.isSafeInteger(rect.width)&&Number.isSafeInteger(rect.height)&&rect.width>0&&rect.height>0,'A positive native generation context is required.');
 const evaluable=rect.width>=14&&rect.height>=14;
 return{evaluable,reason:evaluable?null:'native-14-pixel-embedding-grid',nativeMinimum:[14,14]};
}

/** Describes the existing five-window algorithm; never supplies model pixels. */
export function nativeGenerationSampling(width,height){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Positive native B-Free dimensions required.');
 const gh=Math.floor(height/14),gw=Math.floor(width/14),short=gh<36||gw<36;
 if(!gh||!gw)return{preprocessingVersion:'bfree-official-grid14-five504-v1',embeddingGrid:[gh,gw],nativeWindowShape:[504,504],repeatWrap:short,windows:[],observedPixels:0};
 const eh=short?36:gh,ew=short?36:gw,cy=Math.max(Math.floor((eh-36)/2),0),cx=Math.max(Math.floor((ew-36)/2),0),origins=[[cy,cx],[0,0],[eh-36,0],[eh-36,ew-36],[0,ew-36]],windows=origins.map(([y,x],index)=>({index,originEmbeddingGrid:[y,x],sourceObservationBounds:short?[0,0,Math.min(gw,36)*14,Math.min(gh,36)*14]:[x*14,y*14,x*14+504,y*14+504]}));
 const ys=[...new Set(windows.flatMap(w=>[w.sourceObservationBounds[1],w.sourceObservationBounds[3]]))].sort((a,b)=>a-b);let observedPixels=0;
 for(let i=1;i<ys.length;i++){const top=ys[i-1],bottom=ys[i],spans=windows.map(w=>w.sourceObservationBounds).filter(b=>b[1]<bottom&&b[3]>top).map(b=>[b[0],b[2]]).sort((a,b)=>a[0]-b[0]);let left,right,total=0;for(const[a,b]of spans){if(right===undefined){left=a;right=b;}else if(a>right){total+=right-left;left=a;right=b;}else right=Math.max(right,b);}if(right!==undefined)total+=right-left;observedPixels+=total*(bottom-top);}
 return{preprocessingVersion:'bfree-official-grid14-five504-v1',embeddingGrid:[gh,gw],nativeWindowShape:[504,504],repeatWrap:short,windows,observedPixels};
}

export function createGenerationContextImage({original,view,domain,rect,budget}){
 requireValue(view?.domain?.fingerprint===domain.fingerprint&&view.domain.sourceSha256===domain.sourceSha256,'Generation view differs from its bound source domain.');
 requireValue(view.includesRectangle(rect),'Generation context must contain admitted RGB observations only.');
 const bounds=[rect.x+domain.origin[0],rect.y+domain.origin[1],rect.x+domain.origin[0]+rect.width,rect.y+domain.origin[1]+rect.height];
 const provenance={originalDecode:structuredClone(original.provenance??null),format:'RGB8',orientation:1,nativeContext:{schema:'sherloq.generation-native-context/1',originalSourceSha256:domain.sourceSha256,sourceRegionFingerprint:domain.fingerprint,originalBounds:bounds,nativeDimensions:[rect.width,rect.height]}};
 const surface={descriptor:{id:'generation-context/'+domain.fingerprint+'/'+bounds.join('/'),revision:1,width:rect.width,height:rect.height,format:'rgb8'},async readWindow(part,{signal}={}){
  checkAbort(signal);requireValue(part&&[part.x,part.y,part.width,part.height].every(Number.isSafeInteger)&&part.x>=0&&part.y>=0&&part.width>0&&part.height>0&&part.x+part.width<=rect.width&&part.y+part.height<=rect.height,'Generation read exceeds its exact admitted context.');
  const cap=view.maxReadPixels??1024*1024;requireValue(Number.isSafeInteger(cap)&&cap>0,'Generation source requires a finite native window limit.');
  const owned=allocateOwnedTypedArray(Uint8Array,part.width*part.height*3,{budget,label:'generation-native-context-rgb'});let published=false;
  const cooperate=createCooperator(signal),columns=Math.min(8192,part.width,cap),rows=Math.max(1,Math.min(32,Math.floor(cap/columns)));
  try{for(let y=0;y<part.height;y+=rows)for(let x=0;x<part.width;x+=columns){await cooperate();const width=Math.min(columns,part.width-x),height=Math.min(rows,part.height-y),sourceRect={x:rect.x+part.x+x,y:rect.y+part.y+y,width,height};requireValue(view.includesRectangle(sourceRect),'Generation reader cannot admit an excluded RGB observation.');const lease=await view.readWindow(sourceRect,{signal});try{for(let row=0;row<height;row++)owned.data.set(lease.pixels.data.subarray(row*width*3,(row+1)*width*3),((y+row)*part.width+x)*3);}finally{await lease.release();}}
   checkAbort(signal);published=true;return{pixels:{width:part.width,height:part.height,format:'rgb8',data:owned.data},release:owned.release};
  }finally{if(!published)owned.release();}
 }};
 // The encoded Original is not passed as a competing pixel input. Its real SHA
 // stays in provenance; scope/bounds namespace the unchanged inner model memo.
 return{sha256:domain.sourceSha256,surface,provenance,get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession?.bind(original)};
}

/** One unchanged native generation detector per genuine admitted RGB context.
 * No average, maximum or global classification is inferred across contexts. */
export async function sourceRegionGeneration({task,original,view,domain,budget,signal,onProgress,runNative}){
 requireValue(task.operation==='ai.generation.bfree'&&typeof runNative==='function','A B-Free native context runner is required.');
 requireValue(original.sha256===domain.sourceSha256,'Generation context belongs to another Original.');
 requireValue(view?.domain?.fingerprint===domain.fingerprint&&view.domain.sourceSha256===domain.sourceSha256,'Generation view differs from its bound source domain.');
 if(domain.empty||domain.countIncluded===0)throw new EngineError('SOURCE_SCOPE_EMPTY','No original pixels are admitted by this generation selection.');
 const unlocalized=sourceRegionUnlocalizedInput(task);if(unlocalized)throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind generation geometry into its native source domain before analysis.',{details:{unlocalizedInput:unlocalized}});
 if([task,task.params].some(owner=>Array.isArray(owner?.exclusions)&&owner.exclusions.length))throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind generation exclusions into its native source domain before analysis.');
 let count=0;for(const rect of view.admittedRectangles()){nativeGenerationContextAdmission(task.operation,rect);if(++count%128===0)await controlCheckpoint(signal);}
 const leases=[],fragments=[];let selected=0,analysed=0,evaluatedContextPixels=0,completed=0;
 try{
  const taskBytes=sourceRegionTransportBytes(task,{allowUndefined:true,allowAliases:true}),decodeBytes=sourceRegionTransportBytes(original.provenance??null,{allowUndefined:true,allowAliases:true});
  leases.push(budget.reserve(65536+count*(16384+decodeBytes*2)+sourceRegionTransportBytes(domain.descriptor,{allowAliases:true})*2+taskBytes*2));
  const capturedTask=structuredClone(task);
  for(const rect of view.admittedRectangles()){
   await controlCheckpoint(signal);const index=fragments.length,bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],admission=nativeGenerationContextAdmission(task.operation,rect),sampling=nativeGenerationSampling(rect.width,rect.height),originalBounds=bounds.map((v,i)=>v+domain.origin[i%2]),metadata={id:'generation-context-'+index,bounds,originalBounds,nativeDimensions:[rect.width,rect.height],...admission,nativeSampling:{...sampling,windows:sampling.windows.map(w=>({...w,originalObservationBounds:w.sourceObservationBounds.map((v,i)=>v+originalBounds[i%2])}))},nativeObservedPixels:sampling.observedPixels};selected+=rect.width*rect.height;
   if(!admission.evaluable){fragments.push({...metadata,status:'native-not-evaluable',data:null});continue;}
   const image=createGenerationContextImage({original,view,domain,rect,budget}),copy=budget.reserve(taskBytes*2);let result;
   try{const nativeTask=structuredClone(capturedTask);nativeTask.id=capturedTask.id+'/context/'+index;nativeTask.sourceRegionDomain=undefined;nativeTask.regions=undefined;result=await runNative(nativeTask,image,{signal,onProgress:event=>{checkAbort(signal);onProgress?.({...event,fragmentIndex:index,fragments:count});checkAbort(signal);}});}finally{copy();}
   checkAbort(signal);if(result?.status!=='ok')throw new EngineError(result?.error?.code??'MODEL_FAILED',result?.error?.message??'Native generation context failed.',{details:result?.error?.details});
   requireValue(result.operation===task.operation&&!result.surface,'Unexpected native generation result.');
   requireValue(result.data?.method==='bfree'&&Array.isArray(result.data.window_logits)&&result.data.window_logits.length===5&&result.data.window_logits.every(Number.isFinite),'Native generation must retain its five finite B-Free logits.');
   leases.push(budget.reserve(2048+payloadBytes(result.data)*2+payloadBytes(result.provenance)*2+payloadBytes(result.metrics)*2));
   fragments.push({...metadata,status:'analysed',data:structuredClone(result.data),nativeProvenance:structuredClone(result.provenance),nativeMetrics:structuredClone(result.metrics)});analysed+=sampling.observedPixels;evaluatedContextPixels+=rect.width*rect.height;completed++;
  }
  requireValue(selected===domain.countIncluded,'Generation contexts must cover every admitted observation.');checkAbort(signal);
  const status=completed===count?'evaluated':completed?'partially-evaluable':'native-not-evaluable';
  return{id:capturedTask.id,imageId:capturedTask.imageId,operation:capturedTask.operation,status:'ok',data:{independentNativeContexts:true,sourceRegionEvaluation:status,fragments},layers:[],metrics:{selectedPixels:selected,analysedPixels:analysed,nativeObservedPixels:analysed,evaluatedContextPixels,nativeUnobservedPixels:selected-analysed,unclassifiedContextPixels:selected-evaluatedContextPixels,unanalysablePixels:selected-evaluatedContextPixels,fragmentCount:count,evaluatedContexts:completed},provenance:{params:structuredClone(capturedTask.params??{}),sourceRegionDomain:domain.descriptor,originalSha256:original.sha256,excludedParticipation:'absent-before-native-preprocessing-and-model',aggregation:'none; native whole-context generation scores remain separate',coverage:'analysedPixels counts distinct Original pixels contributing to the unchanged five native windows; evaluatedContextPixels counts classified context area. Native remainders or gaps have no pixel score and are not failed inferences.'},semantics:'Each actual admitted RGB context uses the unchanged B-Free embedding grid, five504x504 windows and native logit reduction. Classification follows native sampling, not pixel-wise localization or exhaustive coverage. No score or verdict for the union is fabricated.'};
 }finally{for(const release of leases)release();}
}
