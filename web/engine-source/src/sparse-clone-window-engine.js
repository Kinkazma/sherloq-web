import {verifyEfficientLoFtrRoleGeometry} from './efficient-loftr-role-geometry.js';
import {createSiftNativeWindowCallback} from './sift-native-windows.js';
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {prepareCloneAnalysisWindows} from './clone-analysis-windows.js';
import {createNeuralCloneWindowRun} from './clone-neural-window-runner.js';
import {combineSparseWindowPresentation} from './sparse-window-presentation.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';

const identity=record=>JSON.stringify([record.sha256,record.sourceRegionDomain?.fingerprint??null,record.surface.descriptor.width,record.surface.descriptor.height,record.sourceRegionOrigin??[0,0]]);
/** Product owner around the shared canonical planner/carrier and a native
 * per-window callback. Admissions are explicit; this module opens no gate.
 * Native engines survive fresh result carriers and remain bounded to the
 * current plan. The caller owns the returned carrier through presentation and
 * transport ACK, then release() retires raw outputs/loans before copy leases.
 * clearImages/dispose subsequently retires engines before their source views. */
export function createSparseCloneWindowEngine(initialRecord,budget,profile,{callbackFactory=createSiftNativeWindowCallback,admitIndependent,admitGlobal,prepareWindows=prepareCloneAnalysisWindows,callbackOptions={},presentationFactory=combineSparseWindowPresentation}={}){
 let record=sparseStrictImageRecord(initialRecord,budget),sourceKey=identity(record),callback,active=false,closed=false,finished=Promise.resolve(),closing;
 const hooksForRun={},lifetime=new AbortController(),held=new Set();
 const retireHeld=()=>retireCompositeOwners([...held].map(owner=>()=>owner.release()));
 const execute=async(input,hooks={},retainedOnly=false)=>{
   requireValue(!closed&&!active&&record,'Native clone-window analysis is closed, detached or busy.');if(retainedOnly&&(!callback||typeof callback.localizeRetained!=='function'||typeof callback.localizeGlobal!=='function'))return null;checkAbort(hooks.signal);active=true;let finish;finished=new Promise(resolve=>finish=resolve);
   const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;let carrier,presentation,globalFrame,returned=false,failed=false,primary;
   let owner;owner={async release(){await carrier?.dispose();await presentation?.release();held.delete(owner);}};held.add(owner);
   try{
    await retireCompositeOwners([...held].filter(x=>x!==owner).map(value=>()=>value.release()));checkAbort(signal);
    const task={...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:input,...(hooks.scientificScope?{scientificScope:hooks.scientificScope}:{})};
    const comparison=task.params?.algorithm==='EfficientLoFTR'?await verifyEfficientLoFtrRoleGeometry(task.efficientLoFtrComparison):null;const original=record.originalSource??record,d=original.surface.descriptor;
    if(comparison)requireValue(comparison.sourceSha256===original.sha256&&comparison.sourceGrid[0]===d.width&&comparison.sourceGrid[1]===d.height,'Native comparison Original source grid or SHA differs from the current source.');
    const domain=record.sourceRegionDomain?await compileOriginalSourceRegions(record.sourceRegionDomain):await compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:record.sha256,width:d.width,height:d.height})).snapshot());checkAbort(signal);
    for(const name of Object.keys(hooksForRun))delete hooksForRun[name];Object.assign(hooksForRun,hooks);
    callback??=callbackFactory({original:record,budget,profile,hooks:hooksForRun,...callbackOptions});requireValue(typeof callback==='function'&&typeof callback.dispose==='function'&&typeof callback.retainWindows==='function','Native callback must retain and prune its source-owned engine cache.');
    carrier=createNeuralCloneWindowRun({domain,task},{budget,signal,runWindow:retainedOnly?callback.localizeRetained:callback,runGlobal:retainedOnly?callback.localizeGlobal:callback.runGlobal,admitIndependent,admitGlobal,prepareWindows:async(...args)=>{
     const plan=await prepareWindows(...args);try{if(plan.mode==='global'&&plan.global){const d=plan.global.contextDomain;if(!d.empty&&d.rect)globalFrame={origin:[...d.origin],bounds:[d.rect.x0,d.rect.y0,d.rect.x1,d.rect.y1]};}await callback.retainWindows(plan,{retainedOnly});checkAbort(signal);return plan;}catch(primary){await retireCompositeOwners([()=>plan.release()],{primary});throw primary;}
    }});
    const answer=await carrier.execute();checkAbort(signal);const presentationOrigin=[...(record.sourceRegionDomain?.origin??[0,0])];
    const presentationOptions={budget,signal,presentationOrigin,params:input,width:record.surface.descriptor.width,height:record.surface.descriptor.height,sourceSha256:record.sha256,preview:retainedOnly?hooks.preview:undefined,globalFrame};
    if(retainedOnly&&hooks.preview)presentation=await presentationFactory(answer,presentationOptions);
    else if(answer.mode==='independent')presentation=await presentationFactory(answer,presentationOptions);
    else{
     // The single global native bank needs only a coordinate presentation.
     // No original window receives a fabricated independent native result.
     const raw=answer.globalResult,origin=globalFrame?.origin;
     const windows=raw?[{id:'global-analysis',kind:'region',bounds:globalFrame.bounds,origin,polygon:[],fingerprint:answer.fingerprint,sourceContextIdentity:raw.metadata?.analysisWindow?.sourceContextIdentity??JSON.stringify(['global',answer.fingerprint]),status:'complete',output:raw}]:answer.windowResults;
     presentation=await presentationFactory({...answer,mode:'independent',windowResults:windows},presentationOptions);
     const data=presentation.data;data.globalResult=raw?data.windowResults[0]:null;if(raw)data.windowResults=[];data.cloneWindowMode='global';data.feature_policy=raw?.feature_policy??'global';data.metadata.cloneWindowMode='global';data.feature_policy=raw?.feature_policy??'global';Object.assign(data.metadata.cloneAnalysisWindows,{mode:'global',matchingAcrossWindows:true,normalizationAcrossWindows:raw?.metadata?.extraction?.normalization??'native single bank',nativeData:'globalResult.dataNatif is the complete native shared-bank result',overlaps:raw?.metadata?.extraction?.duplicates??'native global mode',envelope:'included only when separately declared'});
    }
    if(comparison){const native=answer.mode==='global'?[answer.globalResult]:(answer.windowResults??[]).filter(w=>w.status==='complete').map(w=>w.output);for(const raw of native.filter(Boolean))requireValue(JSON.stringify(raw.metadata?.efficientLoFtrComparison)===JSON.stringify(comparison),'Native comparison geometry receipt differs from the actual windows.');presentation.data.metadata.efficientLoFtrComparison=comparison;}presentation.data.metadata.qualificationScope=answer.qualificationScope;checkAbort(signal);returned=true;
    return{...presentation.data,release:()=>owner.release()};
   }catch(error){failed=true;primary=error;throw error;}finally{
    try{if(!returned)await retireCompositeOwners([()=>owner.release()],failed?{primary}:{});}finally{active=false;finish();}
   }
 };
 return{
  get image(){return record;},set image(value){if(value===null){requireValue(!active,'Cannot detach an active native window reader.');record=null;return;}value=sparseStrictImageRecord(value,budget);requireValue(!active&&identity(value)===sourceKey,'Native clone windows cannot reuse another source or domain.');record=value;},
  clearCheckpoint(checkpoint){return callback?.clearCheckpoint?.(checkpoint);},
  get counts(){return{...callback?.counts};},
  analyze:(input,hooks={})=>execute(input,hooks,false),
  async localizeRetained(input,hooks={}){try{return await execute(input,hooks,true);}catch(error){if(error?.code==='SSG_RETAINED_UNAVAILABLE'&&held.size===0)return null;throw error;}},
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;await retireHeld();await callback?.dispose();})();void closing.finally(()=>{closing=null;}).catch(()=>{});return closing;},
  get state(){return{closed,active,pendingResults:held.size,native:callback?.state?.()??null};}
 };
}
