import "../../runtime-context.js?v=0.30.0";
import {combineDenseWindowPresentation} from './dense-window-presentation.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {createSiftNativeWindowCallback} from './sift-native-windows.js';
import {createStrictPanelsPreparation} from './sparse-panels-strict-preparation.js';
import {createDenseNativeWindowCallback} from './dense-native-windows.js';
import {combineSparseWindowPresentation} from './sparse-window-presentation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shift=(polygons,origin)=>(polygons??[]).map(poly=>poly.map(([x,y])=>[x+origin[0],y+origin[1]]));
const box=poly=>[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))];
/** Native automaticSelection stores its envelope both as a region and as an
 * alias. Only that alias is coalesced. Distinct coincident selected regions
 * remain distinct analyses; no bounding box creates a new context. */
export function automaticNativeCloneWindows(selection,origin=[0,0]){
 requireValue(selection&&Array.isArray(selection.regions)&&Array.isArray(selection.disabled)&&selection.disabled.every(i=>Number.isSafeInteger(i)&&i>=0&&i<selection.regions.length),'Explicit automatic native selection required.');
 const envelopeIndex=selection.envelope?selection.regions.findIndex(poly=>same(poly,selection.envelope)):-1;
 const windows=selection.regions.flatMap((polygon,index)=>selection.disabled.includes(index)?[]:[{id:'selection-window-'+index,kind:index===envelopeIndex?'envelope':'region',polygon:shift([polygon],origin)[0]}]);
 if(selection.regions.length&&selection.envelope&&envelopeIndex<0)windows.push({id:'selection-envelope',kind:'envelope',polygon:shift([selection.envelope],origin)[0]});
 return windows.map(window=>({...window,bounds:box(window.polygon)}));
}

/** Geometry-only handoff to the existing native callback. There is deliberately
 * no scientificScope or text-complete receipt: Panels executes its own native
 * Tesseract preparation for this declared acquisition, before descriptors.
 * The common Sparse route retains its existing per-window feature-only bank.
 */
export function acquisitionsCallback(factory,settings){
 const native=factory(settings);
 const callback=async job=>{
  const requested=job.task.params,params={...requested,regions:requested.compare===true?requested.regions:[job.window.polygon]},task={...job.task,params};
  const output=await native({...job,task});
  output.provenance={...output.provenance,params:requested,requestedParameters:requested,nativeParameters:output.provenance?.nativeParameters??output.params??params,requestedParameterCoordinates:'original-pixels',nativeParameterCoordinates:'window-context-local-pixels',nativePreparation:'acquisitions-only'};
  return output;
 };
 callback.runGlobal=async job=>{
  const requested=job.task.params,params={...requested,regions:requested.compare===true?requested.regions:[]},task={...job.task,params},output=await native.runGlobal({...job,task});
  output.provenance={...output.provenance,cloneWindowMode:'global',params:requested,requestedParameters:requested,nativeParameters:output.provenance?.nativeParameters??output.params??params,requestedParameterCoordinates:'original-pixels',nativeParameterCoordinates:'window-context-local-pixels',nativeRegionPolicy:requested.compare===true?'explicit-two-roi-comparison':'canonical-union-common-bank',nativePreparation:'acquisitions-only'};return output;
 };
 callback.retainWindows=plan=>native.retainWindows(plan);
 callback.dispose=()=>native.dispose();callback.clearCheckpoint=key=>native.clearCheckpoint?.(key);callback.state=()=>native.state?.();
 Object.defineProperty(callback,'counts',{get:()=>native.counts});return callback;
}

// Canonical acquisitions already delimit the native RGB observation domain.
// Empty native regions in explicit global mode means one union bank, not a
// request to redetect panels or to expand the per-region extraction again.
export function nativeAutomaticPanels(budget,profile,options){
 const native=createStrictPanelsPreparation(budget,profile,{...options,nativeProductOcr:true});
 return{...native,prepare(record,input,hooks){
  requireValue(hooks.nativeWindowContext?.sourceDomain?.descriptor,'Canonical native acquisition context required.');
  return native.prepare(record,input,{...hooks,nativeAcquisitionSelection:true});
 }};
}

/** Automatic clone jobs without a precomputed scientific scope use the same
 * retained native window engines as the individual tool. Original requested
 * parameters remain distinct from each translated native input. Complete raw
 * data, including opaque Dense stores, stays in the shared carrier by reference.
 */
export function createAutomaticUnpreparedClones(image,budget,profile,{kind,geometry,selection,task={},windowEngineFactory=createSparseCloneWindowEngine,callbackOptions={}}={}){
 requireValue(['dense','sparse'].includes(kind)&&image?.surface?.descriptor&&budget?.reserve,'Native automatic clone source, kind and shared budget required.');
 requireValue(!task.params?.scientificScope&&!task.scientificScope,'Unprepared automatic clones cannot replace a scientific preparation.');
 const origin=image.sourceRegionOrigin??[0,0],meta=task.sourceRegionLocalization;
 if(meta)requireValue(meta.coordinates==='source-region-native'&&meta.domainFingerprint===image.sourceRegionDomain?.fingerprint&&meta.originalSha256===image.sha256&&same(meta.origin,origin)&&meta.width===image.surface.descriptor.width&&meta.height===image.surface.descriptor.height,'Automatic native selection belongs to another source crop.');
 const release=budget.reserve(8192+8*sourceRegionTransportBytes(selection,{allowUndefined:true,allowAliases:true}));let windows;try{windows=automaticNativeCloneWindows(selection,origin);}catch(error){release();throw error;}const lifetime=new AbortController(),emptyOwners=new Set(),metadataOwners=new Set();
 let engine,closed=false,active=false,finished=Promise.resolve(),closing,freed=false,engineRetired=false;
 return{
  clearCheckpoint:key=>engine?.clearCheckpoint?.(key),get counts(){return{...engine?.counts};},
  async analyze(params,hooks={}){
   requireValue(!closed&&!active,'Native automatic clone windows are busy or disposed.');requireValue(!hooks.scientificScope&&!params?.scientificScope,'No prepared scientific scope may enter the native acquisition-only route.');checkAbort(hooks.signal);
   active=true;let finish;finished=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;
   let free;
   const retainMetadata=output=>{const credit=free;free=null;const nativeRelease=output.release;let retired=false,pending;const owner={release(){if(retired||pending)return pending;pending=Promise.resolve().then(()=>nativeRelease()).then(()=>{credit();retired=true;metadataOwners.delete(owner);},error=>{pending=null;throw error;});return pending;}};metadataOwners.add(owner);return{...output,release:()=>owner.release()};};
   try{
    const mode=hooks.cloneWindowMode??task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode),'Invalid automatic clone window mode.');
    await retireCompositeOwners([...metadataOwners].map(owner=>()=>owner.release()));checkAbort(signal);
    free=budget.reserve(8192+8*sourceRegionTransportBytes(params,{allowUndefined:true,allowAliases:true}));
    const input={...params,regions:shift(params.regions,origin),excluded:shift(params.excluded,origin),guides:shift(params.guides,origin)};
    if(!windows.length){
     const p=await combineSparseWindowPresentation({mode:'independent',fingerprint:JSON.stringify(['automatic-native-empty',mode,image.sha256]),windowResults:[]},{budget,signal,presentationOrigin:origin,params:input});
     const value=p.data;value.cloneWindowMode=mode;value.metadata.cloneWindowMode=mode;value.metadata.cloneAnalysisWindows.mode=mode;value.metadata.automaticNativeAcquisitions={status:'empty',windowCount:0,originalSelection:selection};if(mode==='global')value.globalResult=null;
     let retired=false;const owner={async release(){if(!retired){await p.release();retired=true;emptyOwners.delete(owner);}}};emptyOwners.add(owner);return retainMetadata({...value,release:()=>owner.release()});
    }
    const sourceTask={operation:'tampering.copyMove.sparse',imageId:task.imageId,cloneWindowMode:mode,backend:hooks.backend??task.backend??'auto',regions:windows,params:input};
    engine??=windowEngineFactory(image,budget,profile,{callbackFactory:settings=>acquisitionsCallback(kind==='dense'?createDenseNativeWindowCallback:createSiftNativeWindowCallback,settings),...(kind==='dense'?{presentationFactory:combineDenseWindowPresentation}:{}),callbackOptions:{...(kind==='dense'?{geometry}:{panelsFactory:nativeAutomaticPanels}),...callbackOptions},admitIndependent:()=>true,admitGlobal:()=>true});
    const output=await engine.analyze(input,{...hooks,signal,scientificScope:undefined,sourceRegionTask:sourceTask});
    output.metadata={...output.metadata,automaticNativeAcquisitions:{status:'complete',windowCount:windows.length,preparation:mode==='global'?'native union context; Panels Tesseract runs in its admitted partitions':'native acquisition selection; Panels Tesseract runs within each input',contextPolicy:mode==='global'?'canonical-union-once-per-pixel':'independent-declared-windows',requestedParameters:input,requestedParameterCoordinates:'original-pixels',selectionOrigin:[...origin]}};return retainMetadata(output);
   }finally{free?.();active=false;finish();}
  },
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;if(!engineRetired){await engine?.dispose();engineRetired=true;}await retireCompositeOwners([...metadataOwners].map(owner=>()=>owner.release()));await retireCompositeOwners([...emptyOwners].map(owner=>()=>owner.release()));if(!freed){freed=true;release();}})();void closing.finally(()=>closing=null).catch(()=>{});return closing;}
 };
}
