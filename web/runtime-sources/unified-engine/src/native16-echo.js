import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {segmentedEcho} from './segmented-echo.js';
import {native16Descriptor} from './rgb16-surface.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionDerivatives} from './source-region-general-derivatives.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {deferEchoDebt} from './echo-retirement.js';
import {native16EchoParams,NATIVE16_ECHO_UNITS} from './native16-echo-contract.js';

/** One typed consumer of the existing Echo kernel/storage owners.
 * The Original remains separate from any sampled grid or diagnostic output. */
export async function runNative16Echo(surface,params={},options={}){
 const p=native16EchoParams(params),{budget,signal,onProgress}=options;
 const source=options.sourceSurface??surface,sd=source?.descriptor,d=surface?.descriptor,binding=options.sourceBinding;
 requireValue(budget&&sd?.format==='rgb16'&&d?.format==='rgb16'&&typeof surface.readWindow==='function','Native Echo needs a real RGB16 surface.');
 requireValue(binding&&typeof binding.imageId==='string'&&binding.imageId.length>0&&typeof binding.sourceSurfaceId==='string'&&Number.isSafeInteger(binding.sourceRevision)&&binding.sourceRevision>0
  &&/^[0-9a-f]{64}$/i.test(binding.sourceSha256??'')&&binding.nativeSurfaceId===sd.id&&binding.nativeRevision===sd.revision
  &&binding.profileIdentity===JSON.stringify([sd.color,sd.provenance])&&typeof options.isSourceCurrent==='function','Native Echo lost its Original authority.');
 requireValue(['auto','cpu'].includes(options.backend??'auto'),'Native Echo has no admitted GPU convolution.');
 const sourceBinding=structuredClone(binding),inputId=d.id,inputRevision=d.revision,sourceId=sd.id,sourceRevision=sd.revision;
 const assertCurrent=()=>{
  checkAbort(signal);
  if(!options.isSourceCurrent()||surface.descriptor.id!==inputId||surface.descriptor.revision!==inputRevision
   ||source.descriptor.id!==sourceId||source.descriptor.revision!==sourceRevision
   ||JSON.stringify([source.descriptor.color,source.descriptor.provenance])!==sourceBinding.profileIdentity)
   throw new EngineError('SOURCE_CHANGED','Native Echo Original or sampling grid changed before publication.');
 };
 assertCurrent();
 const domain=options.domain&&sourceRegionDomainShape(options.domain)!=='identity'?options.domain:null;
 let view,record,transferred=false;
 const disposeRecord=()=>record?retireCompositeOwners([()=>record.surface.dispose(),...Object.values(record.maskRecords??{}).map(value=>()=>value.surface.dispose())],{requireAck:true}):undefined;
 try{
  if(domain){
   const presentation=options.presentationSurface;
   requireValue(presentation?.descriptor?.format==='rgb8'&&presentation.descriptor.width===d.width&&presentation.descriptor.height===d.height
    &&domain.sourceWidth===d.width&&domain.sourceHeight===d.height&&domain.sourceSha256===sourceBinding.sourceSha256,'Native Echo regional grid and canonical presentation disagree.');
   if(sourceRegionDomainShape(domain)==='rectangle'){
    requireValue(typeof options.echoSourceOwner?.rectangle==='function','Native Echo rectangle needs its Original-owned borrowed reader.');
    const rectangle=await options.echoSourceOwner.rectangle(surface,domain,{signal});assertCurrent();
    record=await segmentedEcho({surface:rectangle,session:options.temporarySession,ensureTemporarySession:options.getTemporarySession},p,{
     ...options,sourceSurface:source,sourceBinding,isSourceCurrent:()=>{assertCurrent();return true;},
     cacheKey:(options.cacheKey??sourceBinding.imageId+'\0native16/echo/')+'rectangle/'+domain.fingerprint+'/'
    });
   }else{
    view=await createSourceRegionView(surface,domain,{budget,signal});assertCurrent();
    const task={id:'native-echo-region',imageId:sourceBinding.imageId,operation:'detail.echo',params:p,workingDepth:16};
    const original={surface:presentation,nativeSurface:surface,sha256:sourceBinding.sourceSha256,session:options.temporarySession,ensureTemporarySession:options.getTemporarySession};
    record=await sourceRegionDerivatives({task,original,domain,budget,signal,onProgress,nativeEcho:{
     depth:16,returnRecord:true,view,assertCurrent,
     cacheIdentity:JSON.stringify([sourceBinding,inputId,inputRevision,options.presentationGrid?.step??1])
    }});
   }
  }else{
   record=await segmentedEcho({surface,session:options.temporarySession,ensureTemporarySession:options.getTemporarySession},p,{
    ...options,sourceSurface:source,sourceBinding,isSourceCurrent:()=>{assertCurrent();return true;},
    cacheKey:options.cacheKey??sourceBinding.imageId+'\0native16/echo/'
   });
  }
  assertCurrent();
  // Reads have ACKed before success. If this retirement refuses, the output
  // stays with the retry owner; it is not published or silently refunded.
  await retireCompositeOwners([async()=>{await view?.dispose();view=null;}],{requireAck:true});
  let closing;
  const answer={...record,provenance:{...record.provenance,schema:'sherloq.native-input/1',...native16Descriptor(source),
   operation:'detail.echo',numericalInputDepth:16,presentationOutputDepth:8,sourceBinding,units:NATIVE16_ECHO_UNITS,
   profileConversion:'none-coded-channel-derivatives',diagnosticColorDomain:'normalized-Echo-RGB8',
   ...(domain?{sourceRegionDomain:domain.descriptor}:{})},
   metrics:{...record.metrics,inputDepth:16,sampleMaximum:65535,nativeCoordinateStep:options.presentationGrid?.step??1,backend:'cpu'},
   dispose(){
    if(closing)return closing;
    const task=disposeRecord();closing=task;
    void task.catch(()=>{if(closing===task)closing=null;});return task;
   }
  };
  transferred=true;return answer;
 }catch(error){
  const owners=[...(!transferred&&record?[disposeRecord]:[]),...(view?[()=>view.dispose()]:[])];
  if(error?.cleanupOwner)throw deferEchoDebt(error,owners);
  await retireCompositeOwners(owners,{primary:error,requireAck:true});throw error;
 }
}
