import {native16FinalParametersAdmitted} from './unified-engine/src/native16-parameter-contract.js';
import {sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
import {EngineError,requireValue} from './unified-engine/src/errors.js';
const operations=new Set(['detail.echo','inspection.magnifier','inspection.adjust','detail.gradient','colors.stats','noise.planes','noise.minmax','noise.separation','noise.blocking','pixels.defects','colors.space','detail.frequency','detail.wavelets','colors.pca']);
const frequencyViews=new Set(['low','high','magnitude','phase']);
function scientificView(task){
 const view=task.view??null;
 if(task.operation!=='detail.frequency'||!view||typeof view!=='object'||Array.isArray(view)||!Object.hasOwn(view,'id')||!frequencyViews.has(view.id))return view;
 // Every published frequency final owns all four views. Only their known
 // selector is presentation; preserve any other scientific view fields.
 const {id,...remaining}=view;return Object.keys(remaining).length?remaining:null;
}
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
// Snapshot metadata/handles only. Typed scientific buffers stay by reference;
// final pixel stores stay entirely behind their existing Core descriptors.
function metadata(value,seen=new WeakMap()){if(value===null||typeof value!=='object')return typeof value==='function'?undefined:value;if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return value;if(seen.has(value))return seen.get(value);const copy=Array.isArray(value)?[]:{};seen.set(value,copy);for(const [key,item]of Object.entries(value)){if(key==='parameterViews'&&Array.isArray(item)&&item.some(view=>view?.retainedParameterView))continue;const next=metadata(item,seen);if(next!==undefined)copy[key]=next;}return copy;}
function publicBuffer(value,seen=new WeakSet()){if(!value||typeof value!=='object'||seen.has(value))return false;if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer||(typeof SharedArrayBuffer==='function'&&value instanceof SharedArrayBuffer))return true;seen.add(value);return Object.values(value).some(item=>publicBuffer(item,seen));}
function pcaPrivateOutput(output){
 const model=output.tables?.pca_model,cloud=output.tables?.pca_cloud,d=output.data;
 if(model?.format!=='float64-table'||model.rowCount!==5||cloud?.format!=='float32-table'||cloud.columns?.length!==6||!Number.isSafeInteger(cloud.rowCount)||cloud.rowCount<1||cloud.rowCount>131072||d?.channelOrder!=='BGR'||cloud.rowCount!==d.cloud?.count)return null;
 const copy=metadata(output);delete copy.pixels;
 const {mean,eigenvectors,eigenvalues,cloud:observations,...modelMetadata}=copy.data,{rgb,rgb16,...cloudMetadata}=observations;
 copy.data={...modelMetadata,channelOrder:'BGR',inputDepth:d.inputDepth??8,modelTable:'pca_model',cloudTable:'pca_cloud',cloud:{...cloudMetadata,colorDomain:d.cloud.colorDomain??'canonical-sdr-rgb8'}};return copy;
}
export function snapshotFinalDepthTask(task){return{...task,params:metadata(task.params),view:metadata(task.view),regions:metadata(task.regions)};}
export function finalDepthSourceBinding(source){return{imageId:source.id,sourceSurfaceId:source.surface.id,sourceRevision:source.surface.revision,sourceSha256:source.sha256,nativeSurfaceId:source.nativeSurface?.id??null,nativeRevision:source.nativeSurface?.revision??null};}
export function finalDepthTaskIdentity(task,source,{depthBitIntent}={}){const depth=task.workingDepth??source.workingDepth??16,common={source:finalDepthSourceBinding(source),operation:task.operation,params:task.params??{},view:scientificView(task),domain:task.sourceRegionDomain?.fingerprint??null,regions:task.regions??null,backend:task.backend??'auto'},intent={...common,params:task.operation==='noise.planes'&&Number.isInteger(depthBitIntent)?{...common.params,bit:depthBitIntent}:common.params};return{depth,key:stable({...common,requestedDepth:depth,effectiveDepth:depth}),intent:stable(intent)};}
export function createFinalDepthResultBank({engine,enqueue,getSource,getResult,setResult,resources,createControl}){
 const ownerId='final-depth-'+crypto.randomUUID(),pending=new Set(),acquiring=new Set(),controls=new Map(),closingControls=new Set(),unavailableControls=new Set(),acquisitionRetirements=new Set(),aliases=new Set();let generation=0,active=null,parked=null,draining,lastIneligibleReason,currentControl,retirementRevision=0,lastRetirementFailure;
 const eligible=(task,context)=>context?.finalDepthReuse===true&&!!getSource()?.nativeSurface&&operations.has(task.operation)&&!(task.operation==='inspection.adjust'&&task.parameterUnits==='native')&&native16FinalParametersAdmitted(task.operation,task.params,getSource().precisionCapabilities,task.sourceRegionDomain?sourceRegionDomainShape(task.sourceRegionDomain):'identity')&&[8,16].includes(task.workingDepth??getSource().workingDepth??16);
 const valid=(task,context,captured)=>eligible(task,context)&&generation===captured&&!context.signal?.aborted&&context.isCurrent?.()===true;
 function dropReferences(entry){entry.output=null;entry.publicOutput=null;entry.resources={surfaces:[],tables:[]};}
 function controlUnavailable(control){
  unavailableControls.add(control);if(parked?.control===control){pending.add(parked);parked=null;}
  for(const entry of [...pending,...acquiring,...aliases])if(entry.control===control){if(acquiring.has(entry))acquisitionRetirements.add(entry);dropReferences(entry);}
  if(control.snapshot().retiring===true){generation++;active=null;const source=getSource(),binding=controls.get(control);if(source?.surface&&stable(finalDepthSourceBinding(source))===stable(binding))setResult(null);}
 }
 function capture(binding){
  if(currentControl&&!closingControls.has(currentControl)&&!unavailableControls.has(currentControl)&&stable(controls.get(currentControl))===stable(binding))return currentControl;
  if(typeof createControl!=='function')throw new EngineError('CAPTURED_CONTROL_REQUIRED','Final results require the captured local ownership control.');
  let adopted;const returned=createControl({purpose:'final-result',binding,ownerId,onOwner:owner=>{adopted=owner;controls.set(owner,metadata(binding));},onPeerUnavailable:()=>controlUnavailable(adopted)});
  requireValue(adopted&&returned===adopted,'Captured final control was not synchronously adopted.');currentControl=adopted;return adopted;
 }
 function coldEntry(entry,token,control){const next={...entry,token,control};if(entry.output?.operation==='colors.pca')next.publicOutput=null;if(unavailableControls.has(control)){dropReferences(next);pending.add(next);return null;}return next;}
 function rememberRetirementFailure(error){retirementRevision++;lastRetirementFailure=error;}
 function checkRetirementAttempt(checkpoint){if(checkpoint<retirementRevision)throw lastRetirementFailure;}
 function retireAcquisition(entry){
  if(entry.retirement)return entry.retirement;acquisitionRetirements.add(entry);
  const task=(async()=>{try{const reply=await entry.control.abandonFinalAcquisition(entry.token);
   requireValue(reply?.acknowledged===true&&reply.ownerId===ownerId&&reply.token===entry.token&&reply.retired===true,'Acquired final retirement was not acknowledged.');
   acquisitionRetirements.delete(entry);acquiring.delete(entry);dropReferences(entry);entry.finished=true;
  }catch(error){rememberRetirementFailure(error);throw error;}})();entry.retirement=task;void task.finally(()=>{if(entry.retirement===task)entry.retirement=null;}).catch(()=>{});return task;
 }
 function drain(checkpoint=retirementRevision){try{checkRetirementAttempt(checkpoint);}catch(error){return Promise.reject(error);}if(draining)return draining;const before=retirementRevision,task=(async()=>{do{
  for(const entry of [...acquisitionRetirements]){checkRetirementAttempt(checkpoint);await retireAcquisition(entry);}
  for(const entry of [...pending]){checkRetirementAttempt(checkpoint);requireValue(entry.control,'Final cache retirement lost its captured control.');const answer=await entry.control.finalResultLifetime({action:'release',token:entry.token,ownerId});requireValue(answer?.acknowledged===true&&answer.token===entry.token&&answer.ownerId===ownerId&&answer.retired===true,'Final cache owner retirement was not acknowledged.');pending.delete(entry);}
  for(const control of [...closingControls]){checkRetirementAttempt(checkpoint);await control.dispose();requireValue(control.snapshot().closed===true,'Captured final control closure was not acknowledged.');closingControls.delete(control);controls.delete(control);unavailableControls.delete(control);if(currentControl===control)currentControl=null;}
 }while(pending.size||closingControls.size||acquisitionRetirements.size);})().catch(error=>{if(retirementRevision===before)rememberRetirementFailure(error);throw error;});draining=task;void task.finally(()=>{if(draining===task)draining=null;}).catch(()=>{});return task;}
 function forget(){active=null;if(parked){pending.add(parked);parked=null;}}
 function revoke(){generation++;active=null;for(const entry of acquiring)acquisitionRetirements.add(entry);if(parked){pending.add(parked);parked=null;}for(const control of controls.keys())closingControls.add(control);currentControl=null;}
 function protectedResources(){const all=[...(parked?[parked]:[]),...pending,...acquiring],surfaces=[],tables=[];for(const entry of all){surfaces.push(...entry.resources.surfaces);tables.push(...entry.resources.tables);}return{surfaces,tables};}
 function readableSurface(display){
  const source=getSource();if(!source?.surface)return null;const binding=stable(finalDepthSourceBinding(source));
  const candidates=[...(active&&active.publicOutput===getResult()?[active]:[]),...(parked?[parked]:[]),...acquiring];
  for(const entry of candidates){
   if(entry.finished||entry.generation!==generation||acquisitionRetirements.has(entry)||stable(entry.binding)!==binding||entry.current&&!entry.current())continue;
   if(entry.control){const state=entry.control.snapshot();if(unavailableControls.has(entry.control)||state.closing||state.closed||state.retiring)continue;}
   const owned=entry.resources.surfaces.find(value=>value.id===display?.id&&value.revision===display.revision);if(owned)return owned;
  }return null;
 }
 return{
  get generation(){return generation;},get hasPendingRetirement(){return pending.size>0||closingControls.size>0||acquisitionRetirements.size>0||!!draining;},eligible,
  invalidate(reason='settings'){const checkpoint=retirementRevision;revoke();const retirement=enqueue(()=>drain(checkpoint));void retirement.catch(()=>{});return{generation,reason,retirement};},
  async retireInactive(reason='admission'){if(parked){pending.add(parked);parked=null;}await drain();return{reason,activePreserved:true};},
  get hasInactive(){return !!parked;},
  revoke,drain,protectedResources,readableSurface,retirementCheckpoint:()=>retirementRevision,
  async beforeRun(task,context,captured,checkpoint=retirementRevision){await drain(checkpoint);if(!eligible(task,context)||!valid(task,context,captured))return null;const source=getSource(),identity=finalDepthTaskIdentity(task,source,context),lookup=context.restoreDepthResult===true;
   if(active&&active.publicOutput!==getResult()){forget();await drain();return null;}
   if((active??parked)?.intent!==undefined&&(active??parked).intent!==identity.intent){forget();await drain();return null;}
   const started=performance.now();
   function restore(entry,claimed=false){
    const row=claimed?entry:{...entry,control:capture(entry.binding),alias:true};if(claimed)acquiring.add(row);else aliases.add(row);
    const original=row.output,originMetrics=original.metrics?.originMetrics??original.metrics,answer={...metadata(original),id:task.id,metrics:{backend:original.provenance?.backend??originMetrics?.backend,nativeInputDepth:identity.depth,exactNativeGrid:true,cache:{result:true,finalDepth:true},originMetrics:metadata(originMetrics),finalDepthRestoration:{cacheHit:true,numericExecutions:0,sourceResultId:original.metrics?.finalDepthRestoration?.sourceResultId??original.id,workingDepth:identity.depth,generation:captured,restoreMs:performance.now()-started}}},privateAnswer=metadata(answer);
    const current=()=>{const state=row.control.snapshot();return !row.finished&&!acquisitionRetirements.has(row)&&!unavailableControls.has(row.control)&&!state.closing&&!state.closed&&!state.retiring&&valid(task,context,captured)&&getSource()===source;};row.current=current;
    return{answer,current,accept(){
     requireValue(current(),'Restored final is no longer admitted for adoption.');if(claimed){const ack=row.control.acceptFinalAcquisition(row.token);requireValue(!ack?.then&&ack?.acknowledged===true&&ack.ownerId===ownerId&&ack.token===row.token&&ack.transferred===true,'Acquired final adoption was not synchronously acknowledged.');acquiring.delete(row);}
     active={...identity,binding:metadata(row.binding),output:privateAnswer,publicOutput:answer,resources:metadata(row.resources),generation:captured};aliases.delete(row);row.finished=true;
    },async abandon(){if(row.finished)return;if(claimed)await retireAcquisition(row);else{aliases.delete(row);dropReferences(row);row.finished=true;}}};
   }
   if(active?.depth===identity.depth)return lookup&&active.key===identity.key?restore(active):null;
   const target=lookup&&parked?.key===identity.key&&parked.generation===captured?parked:null;
   if(context.restoreDepthOnly===true&&!target)return null;
   if(parked&&!target&&(active||parked.depth===identity.depth)){pending.add(parked);parked=null;await drain();}
   let acquisition,outputOwner;
   if(active){const entry=active;requireValue(entry.publicOutput===getResult(),'Active final owner changed.');const control=capture(entry.binding),response=await control.finalResultLifetime({action:'park',ownerId,key:entry.key,binding:entry.binding,resources:entry.resources,...(target?{take:{token:target.token,key:target.key,binding:target.binding}}:{}),onlyIfTakeHit:context.restoreDepthOnly===true},{signal:context.signal});requireValue(response?.acknowledged===true&&response.ownerId===ownerId,'Final parking failed to acknowledge the owner.');acquisition=response.acquisition;outputOwner=target;if(target)pending.delete(target);if(response.parked===false){requireValue(context.restoreDepthOnly===true&&acquisition?.retired===true,'Unexpected final parking miss.');parked=null;return null;}requireValue(response.parked===true,'Final parking was not committed.');parked=coldEntry(entry,response.token,control);active=null;setResult(null);if(generation!==captured&&parked){pending.add(parked);parked=null;}
   }else if(target){acquisition=await target.control.finalResultLifetime({action:'acquire',ownerId,token:target.token,key:target.key,binding:target.binding},{signal:context.signal});parked=null;outputOwner=target;pending.delete(target);}
   if(!acquisition?.hit)return null;if(!outputOwner?.output){if(outputOwner?.control){acquiring.add(outputOwner);acquisitionRetirements.add(outputOwner);closingControls.add(outputOwner.control);}return null;}requireValue(acquisition.acknowledged===true&&acquisition.ownerId===ownerId&&acquisition.token===outputOwner.token,'Final acquisition did not acknowledge the original owner.');return restore(outputOwner,true);
  },
  createCandidate(task,output,context,captured){
   if(!valid(task,context,captured))return null;const source=getSource(),binding=finalDepthSourceBinding(source),privateTask={...snapshotFinalDepthTask(task),sourceRegionDomain:metadata(task.sourceRegionDomain)};
   const privateOutput=task.operation==='colors.pca'?pcaPrivateOutput(output):output;if(!privateOutput||publicBuffer(privateOutput))return{ineligible:'public-buffer-not-isolated',source,binding,task:privateTask,generation:captured};
   const identity=finalDepthTaskIdentity(privateTask,source,context),effective=output.provenance?.precision?.effectiveWorkingDepth??output.metrics?.nativeInputDepth??output.metrics?.inputDepth;if(effective!==identity.depth)return null;
   const owned=metadata(resources(output));if(!owned.surfaces.length&&!owned.tables.length)return null;
   return{source,binding,task:privateTask,generation:captured,entry:{...identity,binding,output:metadata(privateOutput),resources:owned,generation:captured}};
  },
  adoptCandidate(candidate,output,context,captured){
   if(!candidate||candidate.generation!==captured||candidate.source!==getSource()||getResult()!==output||!valid(candidate.task,context,captured)||stable(finalDepthSourceBinding(getSource()))!==stable(candidate.binding))return false;
   if(candidate.ineligible){forget();lastIneligibleReason=candidate.ineligible;return false;}lastIneligibleReason=null;active={...candidate.entry,publicOutput:output};return true;
  },
  remember(task,output,context,captured){return this.adoptCandidate(this.createCandidate(task,output,context,captured),output,context,captured);},
  snapshot(){return{generation,active:!!active,parked:!!parked,pending:pending.size,acquiring:acquiring.size,retiringAcquisitions:acquisitionRetirements.size,aliases:aliases.size,activeDepth:active?.depth,parkedDepth:parked?.depth,lastIneligibleReason,capturedControls:controls.size,retiringControls:closingControls.size,retirementRevision};}
 };
}
