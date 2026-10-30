import "../../runtime-context.js?v=0.30.0";
import {planDocTamperStrictContexts} from './doctamper-strict-plan.js';
import {createGenerationContextImage} from './source-region-generation.js';
import {sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';

export async function createDocTamperNativeSourceImage({original,view,domain,budget,signal}){
 requireValue(original.sha256===domain.sourceSha256&&view?.domain?.fingerprint===domain.fingerprint,'DTD source belongs to another native domain.');
 if(domain.empty||!domain.countIncluded)throw new EngineError('SOURCE_SCOPE_EMPTY','No native DTD observations are admitted.');
 const encoded=original.bytes??original.source,orientation=original.provenance?.orientation??1;let sourceFormat=String(original.provenance?.format??'').toUpperCase();
 // The native libjpeg provenance identifies decoder/orientation, not format.
 // Capture the same Original header decision as the existing full-frame DTD
 // bridge; never replace it with the RGB carrier's presentation format.
 if(!sourceFormat&&encoded){let signature,part;try{if(encoded instanceof Uint8Array)signature=encoded;else if(typeof encoded.read==='function'){part=await encoded.read(0,Math.min(2,encoded.byteLength),{signal});signature=part.bytes;}if(signature?.[0]===255&&signature?.[1]===216)sourceFormat='JPEG';}finally{await part?.release?.();}checkAbort(signal);}
 const plan=await planDocTamperStrictContexts(domain,{sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight,sourceFormat,orientation,hasEncodedSource:Boolean(encoded)},{budget,signal}),contexts=[],cooperate=createCooperator(signal);let success=false,releaseMetadata;
 try{
  releaseMetadata=budget.reserve(65536+sourceRegionTransportBytes([original.provenance??null,plan.contexts],{allowUndefined:true,allowAliases:true})*2);
  for(const c of plan.contexts){await cooperate();const rect={x:c.bounds[0]-domain.origin[0],y:c.bounds[1]-domain.origin[1],width:c.width,height:c.height};requireValue(view.includesRectangle(rect),'DTD complete block context must contain admitted RGB only.');const image=c.evaluable?createGenerationContextImage({original,view,domain,rect,budget}):null;contexts.push({...c,x:rect.x,y:rect.y,...(image?{readWindow:image.surface.readWindow}:{})});}
  let references=1,closed=false;const drop=()=>{if(--references===0){closed=true;releaseMetadata();plan.release();}};
  const retainAnalysisSource=()=>{requireValue(!closed,'DTD native source is retired.');references++;let done=false;return()=>{if(done)return;done=true;drop();};};let released=false;
  const provenance={format:'RGB8',orientation:1,originalDecode:structuredClone(original.provenance??null),nativeDocTamperContexts:{schema:plan.schema,originalSourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,mode:plan.mode,sourceOrigin:[...domain.origin],contexts:contexts.map(({originalBounds,width,height,evaluable,reason})=>({originalBounds:[...originalBounds],width,height,evaluable,reason:reason??null})),selectedPixels:plan.selectedPixels,evaluatedPixels:plan.evaluatedPixels,contextObservedPixels:plan.contextObservedPixels,coverage:plan.coverage,overlapOwnership:plan.overlapOwnership,partialStoredBlockPixels:plan.partialStoredBlockPixels,smallContextPixels:plan.smallContextPixels,nativeBorderPixels:plan.nativeBorderPixels}};
  const image={sha256:domain.sourceSha256,provenance,doctamperNativeContexts:contexts,doctamperOriginal:{sourceSha256:domain.sourceSha256,width:domain.sourceWidth,height:domain.sourceHeight,mode:plan.mode,...(plan.mode==='native-original-JPEG'?{encoded}:{})},retainAnalysisSource,surface:{descriptor:{id:'doctamper-contexts/'+domain.fingerprint,revision:1,width:domain.width,height:domain.height,format:'rgb8'},readWindow(){throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','The DTD presentation envelope is not a model RGB context.');}},get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession?.bind(original)};
  Object.defineProperty(image,'release',{value:()=>{if(released)return;released=true;drop();}});success=true;return image;
 }finally{if(!success){releaseMetadata?.();plan.release();}}
}

export async function sourceRegionDocTamper(context){
 const{task,original,view,domain,budget,signal,onProgress,runNative}=context;
 requireValue(task.operation==='ai.text.doctamper'&&typeof runNative==='function','A native DTD context runner is required.');
 const unlocalized=sourceRegionUnlocalizedInput(task);if(unlocalized)throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind DTD geometry before native preprocessing.',{details:{unlocalizedInput:unlocalized}});
 if([task,task.params].some(owner=>Array.isArray(owner?.exclusions)&&owner.exclusions.length))throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind DTD exclusions before inference.');
 const release=budget.reserve(sourceRegionTransportBytes([task,domain.descriptor],{allowUndefined:true,allowAliases:true})*2+65536);let image,result,complete=false;
 try{
  const captured=structuredClone(task);image=await createDocTamperNativeSourceImage({original,view,domain,budget,signal});checkAbort(signal);captured.sourceRegionDomain=undefined;captured.regions=undefined;
  result=await runNative(captured,image,{signal,onProgress});checkAbort(signal);if(result?.status!=='ok')throw new EngineError(result?.error?.code??'MODEL_FAILED',result?.error?.message??'Native DTD context execution failed.');
  const p=image.provenance.nativeDocTamperContexts;requireValue(result.data?.preprocessing?.native_contexts===true&&result.data?.preprocessing?.contexts?.length===image.doctamperNativeContexts.length&&result.data?.scores?.valid_pixel_count===p.evaluatedPixels,'DTD result lost its native context identity or evaluated pixel count.');
  complete=true;return{...result,metrics:{...result.metrics,selectedPixels:p.selectedPixels,analysedPixels:p.evaluatedPixels,nativeContextObservedPixels:p.contextObservedPixels,nativeUnanalysedPixels:p.selectedPixels-p.evaluatedPixels,partialStoredBlockPixels:p.partialStoredBlockPixels,smallContextPixels:p.smallContextPixels,nativeBorderPixels:p.nativeBorderPixels,nativeContextCount:p.contexts.length,sourceRegionEvaluation:p.selectedPixels===p.evaluatedPixels?'native-evaluable':p.evaluatedPixels?'partially-evaluable':'native-not-evaluable',sourceRegionPolicy:'native-doctamper-contexts-original-block-phase'},provenance:{...result.provenance,sourceRegionDomain:domain.descriptor,originalSha256:domain.sourceSha256,originalPreprocessingMode:image.doctamperOriginal.mode,excludedParticipation:'No excluded RGB reaches native preprocessing or inference; stored DCT/QT are taken only from certified complete Original block support.',nativeFootprintCoverage:p.coverage,overlapOwnership:p.overlapOwnership,coverage:'Complete admitted Original8x8 support and native512 footprint are evaluated; in nativeJPEG mode every pixel belonging to any admissible512 window is covered. Missing native support has no score, not score zero. No global forgery verdict is inferred.'}};
 }finally{release();image?.release();if(!complete&&result?.surface){const id=typeof result.surface==='string'?result.surface:result.surface.id??result.surface.descriptor?.id;if(id)await context.releaseResult?.(id);}}
}
