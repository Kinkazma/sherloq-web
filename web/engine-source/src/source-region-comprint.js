import {createGenerationContextImage} from './source-region-generation.js';
import {sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';

/** RGB readers are independently certified against the bound membership.
 * Their common descriptor is presentation geometry, never a CNN input image. */
export async function createComprintNativeSourceImage({original,view,domain,budget,signal}){
 requireValue(original.sha256===domain.sourceSha256&&view?.domain?.fingerprint===domain.fingerprint,'Comprint source belongs to another native domain.');
 if(domain.empty||!domain.countIncluded)throw new EngineError('SOURCE_SCOPE_EMPTY','No native Comprint observations are admitted.');
 const contexts=[],cooperate=createCooperator(signal);let pixels=0,count=0;
 for(const rect of view.admittedRectangles()){await cooperate();count++;}
 const metadataRelease=budget.reserve(65536+count*(4096+sourceRegionTransportBytes(original.provenance??null,{allowUndefined:true,allowAliases:true})*2));let success=false;
 try{for(const rect of view.admittedRectangles()){
  await cooperate();const image=createGenerationContextImage({original,view,domain,rect,budget});
  contexts.push({x:rect.x,y:rect.y,width:rect.width,height:rect.height,originalBounds:image.provenance.nativeContext.originalBounds,readWindow:image.surface.readWindow});pixels+=rect.width*rect.height;
 }
 requireValue(pixels===domain.countIncluded,'Comprint context readers must cover exactly the admitted native population.');
 const provenance={format:'RGB8',orientation:1,originalDecode:structuredClone(original.provenance??null),nativeComprintPopulation:{schema:'sherloq.comprint-native-context-population/1',originalSourceSha256:domain.sourceSha256,sourceRegionFingerprint:domain.fingerprint,sourceOrigin:[...domain.origin],contexts:contexts.map(({x,y,width,height,originalBounds})=>({x,y,width,height,originalBounds}))}};
 let references=1,closed=false;const drop=()=>{if(--references===0){closed=true;metadataRelease();}};
 const retainAnalysisSource=()=>{requireValue(!closed,'Comprint native context metadata is retired.');references++;let done=false;return()=>{if(done)return;done=true;drop();};};let released=false;
 const image={sha256:domain.sourceSha256,provenance,comprintNativeContexts:contexts,retainAnalysisSource,surface:{descriptor:{id:'comprint-population/'+domain.fingerprint,revision:1,width:domain.width,height:domain.height,format:'rgb8'},readWindow(){throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A Comprint bounding envelope is not a native RGB context.');}},get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession?.bind(original)};
 Object.defineProperty(image,'release',{value:()=>{if(released)return;released=true;drop();}});success=true;return image;
 }finally{if(!success)metadataRelease();}
}

export async function sourceRegionComprint(context){
 const{task,original,view,domain,budget,signal,onProgress,runNative}=context;
 requireValue(task.operation==='jpeg.comprint'&&typeof runNative==='function','A native Comprint population runner is required.');
 const unlocalized=sourceRegionUnlocalizedInput(task);if(unlocalized)throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind Comprint geometry into its native source domain.',{details:{unlocalizedInput:unlocalized}});
 if([task,task.params].some(owner=>Array.isArray(owner?.exclusions)&&owner.exclusions.length))throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind Comprint exclusions before inference.');
 const reserve=budget.reserve(sourceRegionTransportBytes([task,domain.descriptor,original.provenance??null],{allowUndefined:true,allowAliases:true})*2+65536);let result,image,complete=false;
 try{
  const captured=structuredClone(task);image=await createComprintNativeSourceImage({original,view,domain,budget,signal});checkAbort(signal);
  captured.sourceRegionDomain=undefined;captured.regions=undefined;
  result=await runNative(captured,image,{signal,onProgress});checkAbort(signal);
  if(result?.status!=='ok')throw new EngineError(result?.error?.code??'MODEL_FAILED',result?.error?.message??'Native Comprint population failed.');
  const grids=result.data?.statistics?.native_context_grids;requireValue(Array.isArray(grids)&&grids.length===image.comprintNativeContexts.length,'Comprint must preserve every native context grid.');
  const fragments=grids.map((g,index)=>{const c=image.comprintNativeContexts[index];requireValue(g.index===index&&g.width===c.width&&g.height===c.height&&Number.isSafeInteger(g.cells)&&g.cells>=0,'Comprint native context identity changed.');return{index,originalBounds:[...c.originalBounds],nativeDimensions:[c.width,c.height],status:g.cells?'native':'not-evaluable',evaluable:g.cells>0,nativeGridShape:[g.rows,g.columns],nativeGridCells:g.cells,...(!g.cells?{reason:'The native SPAM definition requires both context dimensions >=100; no grid or zero score was invented.'}:{})};});
  const unavailable=fragments.filter(f=>!f.evaluable).length,mapEvaluatedPixels=grids.reduce((n,g)=>n+(g.cells?g.width*g.height:0),0),evaluation=unavailable?'partially-evaluable':'native-evaluable';
  const output={...result,nativeContexts:{kind:'native-comprint-contexts-global-statistics',fragments},nativeContextEvaluation:{total:grids.length,evaluable:grids.length-unavailable,unavailable},warnings:[...(result.warnings??[]),...(unavailable?[{code:'NATIVE_CONTEXT_NOT_EVALUABLE',count:unavailable,allContexts:unavailable===grids.length}]:[])],provenance:{...result.provenance,sourceRegionDomain:domain.descriptor,originalSha256:domain.sourceSha256,excludedParticipation:'Absent before native CNN, normalization, SPAM, covariance/PCA and global EM; no artificial cross-context spatial neighbours.',coverage:'All admitted RGB contributes to native CNN/fingerprint normalization. Native SPAM grids stay separate and are extrapolated only within their context; a context lacking a grid has no map, not a zero score.'},metrics:{...result.metrics,selectedPixels:domain.countIncluded,analysedPixels:domain.countIncluded,cnnObservedPixels:domain.countIncluded,mapEvaluatedPixels,nativeUnmappedPixels:domain.countIncluded-mapEvaluatedPixels,nativeContextCount:image.comprintNativeContexts.length,sourceRegionEvaluation:evaluation,sourceRegionPolicy:'native-comprint-contexts-global-statistics'}};
  complete=true;return output;
 }finally{reserve();image?.release();if(!complete&&result?.surface){const id=typeof result.surface==='string'?result.surface:result.surface.id??result.surface.descriptor?.id;if(id)await context.releaseResult?.(id);}}
}
