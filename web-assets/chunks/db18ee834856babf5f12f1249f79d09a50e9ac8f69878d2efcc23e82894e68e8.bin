import "../../runtime-context.js?v=0.30.0";
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {nativeAutomaticPanels} from './automatic-unprepared-clones.js';
import {requireValue,checkAbort} from './errors.js';
import {SIFT_SOURCE} from './clone-relations.js';

const shift=(polygons,origin)=>(polygons??[]).map(p=>p.map(([x,y])=>[x+origin[0],y+origin[1]]));

/** The aggregate lends its verified Original/context to the same native window
 * producer as the individual tool. Only polygons cross the local/Original
 * boundary here, once. No matching, feature bank or fitted model is combined
 * between windows in independent mode. The presentation owner retains every
 * complete native result until its consumer has retired it. */
export function createAutomaticPreparedSparse(image,budget,profile,{getContext,windowEngineFactory=createSparseCloneWindowEngine,nativeFactory}={}){
 requireValue(typeof getContext==='function'&&image?.surface?.descriptor,'Prepared aggregate Sparse needs its retained source and strict-context getter.');
 const d=image.surface.descriptor,lifetime=new AbortController();let engine,active=false,closed=false,finished=Promise.resolve(),closing;
 const qualified=({task})=>task.params?.algorithm===SIFT_SOURCE&&task.params.scientificScope?.status==='ready'&&task.params.scientificScope.text?.status==='complete';
 return{
  clearCheckpoint(key){return engine?.clearCheckpoint?.(key);},
  get counts(){return {...engine?.counts};},
  async analyze(params,hooks={}){
   requireValue(!closed&&!active,'Prepared aggregate Sparse is busy or disposed.');checkAbort(hooks.signal);
   const scope=hooks.scientificScope;
   requireValue(params?.algorithm===SIFT_SOURCE&&scope?.status==='ready'&&scope.text?.status==='complete','The native Panels + Text preparation must be complete; no OCR or method substitution is implied.');
   active=true;let finish;finished=new Promise(resolve=>finish=resolve);
   const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;
   try{
    const context=await getContext({...hooks,signal});checkAbort(signal);
    requireValue(context?.width===d.width&&context.height===d.height&&context.sourceDomain?.sourceSha256===image.sha256&&context.inputScopeFingerprint===scope.fingerprint&&Array.isArray(context.origin)&&context.origin[0]===(image.sourceRegionOrigin?.[0]??0)&&context.origin[1]===(image.sourceRegionOrigin?.[1]??0),'Prepared aggregate context differs from the source or scientific preparation.');
    const original=context.originalTask,originalScope=original?.params?.scientificScope??original?.scientificScope;
    requireValue(originalScope?.status==='ready'&&originalScope.text?.status==='complete','Original scientific preparation is required; a local scope cannot silently become an image-wide analysis.');
    const mode=hooks.cloneWindowMode??original.cloneWindowMode??'independent';
    requireValue(['independent','global'].includes(mode),'Invalid automatic clone window mode.');
    const input={...params,regions:shift(params.regions,context.origin),excluded:shift(params.excluded,context.origin),guides:shift(params.guides,context.origin),scientificScope:originalScope};
    const task={...original,operation:'tampering.copyMove.sparse',cloneWindowMode:mode,backend:hooks.backend??original.backend??'auto',params:input};
    // originalTask has already undone the verified crop localization. Passing
    // its old receipt would translate these native coordinates a second time.
    delete task.sourceRegionLocalization;delete task.scientificScope;
    // Original geometry certifies the domain, not Panels' native text preparation.
    const nativeAcquisitionsOnly=originalScope.version==='original-source-regions-batch-1'&&(originalScope.text.skipped===true||originalScope.text.disabled===true);
    engine??=windowEngineFactory(image,budget,profile,{admitIndependent:qualified,admitGlobal:qualified,callbackOptions:{...(nativeFactory?{nativeFactory}:{}),...(nativeAcquisitionsOnly?{nativeAcquisitionPreparation:true,panelsFactory:nativeAutomaticPanels}:{})}});
    return await engine.analyze(input,{...hooks,signal,scientificScope:undefined,sourceRegionTask:task});
   }finally{active=false;finish();}
  },
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;await engine?.dispose();})();void closing.finally(()=>closing=null).catch(()=>{});return closing;}
 };
}
