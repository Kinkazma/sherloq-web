import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {SparseCopyEngine,sparseCopyParams} from './sparse-copy.js';
import {prepareSparseNativeWindow,sparseNativeWindowParameters} from './sparse-native-window-source.js';
import {createStrictSparseNativeFeatures} from './sparse-strict-native-features.js';
import {createStrictPanelsPreparation} from './sparse-panels-strict-preparation.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';

const PANELS='SIFT + G2NN + RANSAC + Panels + Text';
export const SIFT_NATIVE_WINDOW_ALGORITHMS=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB','SIFT + G2NN + RANSAC','SIFT + LightGlue',PANELS]);
const shift=(polygons,[x,y])=>polygons.map(p=>p.map(([a,b])=>[a+x,b+y]));
const key=(mode,window)=>JSON.stringify([mode,window.id,window.fingerprint]);

// OCR exclusions further restrict THIS window's canonical candidate/context.
// No RGB, feature bank or search polygon is imported from another window.
async function withTextContext(prepared,polygons,{budget,signal}){
 const original=shift(polygons,prepared.origin),release=budget.reserve(65536+8*sourceRegionTransportBytes(original)),context=prepared.contextDomain;
 let complete=false;
 try{
  const state=await createOriginalSourceRegionsState({sourceSha256:context.sourceSha256,width:context.sourceWidth,height:context.sourceHeight});
  await state.replaceZones(original.map((polygon,index)=>{const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);return{id:'window-text-'+index,kind:'exclusion',enabled:true,polygon,x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};}),{positiveMode:'whole',enabled:true});
  const contextDomain=await compileOriginalSourceRegions(state.snapshot(),{ceiling:context}),candidateDomain=await compileOriginalSourceRegions(state.snapshot(),{ceiling:prepared.candidateDomain});checkAbort(signal);complete=true;
  return{contextDomain,candidateDomain,release};
 }finally{if(!complete)release();}
}

/** Native classical, SIFT/LightGlue or Panels+Text inside one canonical window. The cache
 * parent owns each composite (upstream -> engine/native -> source), while the
 * carrier holds an explicit loan through copies/render/retirement. Warm runs
 * call the SAME native engine and return a fresh native output; transferred
 * raw tables are never used as cache entries. retainWindows prunes the cache
 * to the current plan, avoiding an unbounded A/B/A history. */
export function createSiftNativeWindowCallback({original,budget,profile,hooks={},engineFactory=(...args)=>new SparseCopyEngine(...args),nativeFactory,panelsFactory=createStrictPanelsPreparation,testTextEngine,ocrAuthorization,nativeAcquisitionPreparation=false}={}){
 requireValue(original&&budget?.reserve&&profile&&typeof engineFactory==='function','SIFT windows require the original owner, shared budget and native profile.');requireValue(typeof nativeAcquisitionPreparation==='boolean','Explicit native acquisition preparation option required.');
 const entries=new Map(),retiredCounts={detections:0,matchings:0,groupings:0,ocr:0};let closed=false,closing;
 const countsFor=r=>r.engine?.counts;
 const addCounts=(target,counts)=>{for(const[name,value]of Object.entries(counts??{}))target[name]=(target[name]??0)+value;return target;};
 function resource(mode,window){
  const id=key(mode,window);let r=entries.get(id);if(r)return r;
  r={mode,window,loans:0,receipts:new Set(),contexts:new Set(),closing:null,initialized:null,closed:false};entries.set(id,r);
  r.retire=()=>{if(r.closing)return r.closing;r.closed=true;r.closing=(async()=>{
   await r.initialized?.catch(()=>{});requireValue(r.loans===0,'A native window carrier still owns this source.');
   await retireCompositeOwners([...r.receipts].map(value=>async()=>{await value.release();r.receipts.delete(value);}));
   await r.panels?.dispose();await r.engine?.dispose();await r.native?.dispose();
   await retireCompositeOwners([...r.contexts].map(value=>async()=>{await value.release();r.contexts.delete(value);}));
   await r.compiled?.dispose();if(!r.countsRecorded){addCounts(retiredCounts,countsFor(r));r.countsRecorded=true;}entries.delete(id);
  })();void r.closing.finally(()=>{r.closing=null;}).catch(()=>{});return r.closing;};
  return r;
 }
 async function run({window,task,signal,onOwner,sourceContextIdentity},mode,featureSettings){
  requireValue(!closed&&typeof onOwner==='function'&&SIFT_NATIVE_WINDOW_ALGORITHMS.includes(task.params?.algorithm??'SIFT + G2NN + RANSAC'),'A supported native SIFT window and retaining parent are required.');checkAbort(signal);
  const r=resource(mode,window);requireValue(!r.closed&&!r.busy,'Native window is busy or retiring.');r.loans++;let loanReleased=false;
  try{onOwner({async dispose(){if(!loanReleased){loanReleased=true;r.loans--;}}});}catch(error){r.loans--;throw error;}
  r.busy=true;let output,returned=false,failed=false,primary,receipt,textContext;
  try{
   if(!r.initialized)r.initialized=(async()=>{
    // The composite is retained in entries before construction can await.
    r.prepared=await prepareSparseNativeWindow({original,window,task},{budget,onOwner:owner=>r.compiled=owner});
    r.engine=engineFactory(r.prepared.image,budget,profile);requireValue(r.engine?.features&&typeof r.engine.analyze==='function'&&typeof r.engine.dispose==='function','Existing native SparseCopyEngine required.');
    const ordinary=r.engine.features;r.native=createStrictSparseNativeFeatures({budget,profile,...(nativeFactory?{nativeFactory}:{})});
    r.engine.features={extract(image,settings){if(r.prepared.fullRectangle&&!r.featureContext)return ordinary.extract(image,settings);const context=r.featureContext??{source:r.prepared.compiled.source.original.surface,candidateDomain:r.prepared.candidateDomain,contextDomain:r.prepared.contextDomain,origin:r.prepared.origin,width:r.prepared.image.width,height:r.prepared.image.height};return r.native.extract(context,{...settings,regions:shift(settings.regions,r.prepared.origin),excluded:shift(settings.excluded,r.prepared.origin)});},clearCheckpoint:key=>ordinary.clearCheckpoint?.(key),async dispose(){await r.native.dispose();await ordinary.dispose();}};
   })();
   await r.initialized;checkAbort(signal);
   await r.native.retirePending();
   await retireCompositeOwners([...r.receipts].map(value=>async()=>{await value.release();r.receipts.delete(value);}));
   await retireCompositeOwners([...r.contexts].map(value=>async()=>{await value.release();r.contexts.delete(value);}));checkAbort(signal);
   // Re-translate current native options without replanning source geometry.
   const p=r.prepared,origin=p.origin,scope=task.params?.scientificScope??task.scientificScope;
   const {input,nativeRegionPolicy}=sparseNativeWindowParameters(task,origin,{analysisWindowMode:mode==='global-feature'?'global':mode});r.task=task;r.sourceContextIdentity=sourceContextIdentity;
   const joint=mode==='global'||mode==='global-feature';if(joint&&input.compare!==true)input.regions=[];
   if(input.algorithm===PANELS){
    const acquisitionsOnly=nativeAcquisitionPreparation||scope?.nativePreparation==='acquisitions-only'&&!!scope.nativeSourceRegions;
    if(scope&&!acquisitionsOnly){
     compileForgeryscopeScientificScope(scope,{width:p.contextDomain.sourceWidth,height:p.contextDomain.sourceHeight,sourceSha256:p.contextDomain.sourceSha256});
     requireValue(scope.status==='ready'&&scope.text?.status==='complete'&&scope.regions.length>0,'Scientific preparation is incomplete; no OCR/model substitute or whole fallback is permitted.');
     const free=budget.reserve(65536+4*sourceRegionTransportBytes(scope,{allowUndefined:true,allowAliases:true}));let made=false;
     try{
      const text=(scope.text.polygons??[]).map(poly=>poly.map(([x,y])=>[x-origin[0],y-origin[1]]));let released=false;
      receipt={status:'ok',regions:input.regions,excluded:input.excluded,preprocessing:{version:3,reflections:!!input.reflections,automatic_panels:false,panels:input.regions,envelope:null,text_engine:scope.text.metadata?.model?.id??'PP-OCRv6_small_det',text_exclusions:text,graph_exclusion:true,scientific_scope:{schema:scope.schema,fingerprint:scope.fingerprint,models:structuredClone(scope.models),coordinates:scope.coordinates,policy:'original-pixel feature exclusions; no source painting'},ocr:structuredClone(scope.text.metadata)},release(){if(!released){released=true;free();}}};made=true;
     }finally{if(!made)free();}
    }else{
     r.panels??=panelsFactory(budget,profile,{textEngine:r.engine.ocr,testTextEngine,ocrAuthorization});
     receipt=await r.panels.prepare({sha256:p.contextDomain.sourceSha256},input,{...hooks,signal,scientificScope:undefined,language:hooks.language,nativeWindowContext:{sourceDomain:p.contextDomain,source:p.compiled.source.original.surface}});
    }
    r.receipts.add(receipt);checkAbort(signal);
    const text=receipt.preprocessing?.text_exclusions??[];
    if(text.length){textContext=await withTextContext(p,text,{budget,signal});r.contexts.add(textContext);r.featureContext={source:p.compiled.source.original.surface,...textContext,origin,width:p.image.width,height:p.image.height};}
   }
   hooks.onStage?.('descriptors',receipt,{contextDomain:r.featureContext?.contextDomain??p.contextDomain});
   if(featureSettings){const localRegions=receipt?.regions??input.regions,localExcluded=receipt?.excluded??input.excluded;if(receipt?.status==='no-regions')output={points:new Float64Array(0),descriptors:new Float32Array(0),members:new Uint8Array(0),zoneCount:Math.max(1,localRegions.length),descriptorSize:128,totalFeatures:0,metadata:{family:featureSettings.family,provider:'cpu',nativeStatus:'no-regions'},release(){}};else{if(r.engine.counts)r.engine.counts.detections++;output=await r.engine.features.extract(p.image,{...featureSettings,regions:localRegions,excluded:localExcluded,signal});}output.metadata={...output.metadata,windowPreparation:receipt?.preprocessing??null};}
   else output=await r.engine.analyze(input,{...hooks,backend:task.backend??hooks.backend??'auto',signal,scientificScope:undefined,sourceSha256:p.contextDomain.sourceSha256,sourceContextFingerprint:mode==='global'&&input.algorithm===PANELS?JSON.stringify([sourceContextIdentity,'native-panels-union',scope?.fingerprint??null]):sourceContextIdentity,...(receipt?{strictPanelsPreparation:receipt}:{})});checkAbort(signal);
   const analysisWindow={id:window.id,kind:window.kind,mode:mode==='global-feature'?'global':mode,featureOnly:!!featureSettings,contextFingerprint:r.featureContext?.contextDomain.fingerprint??p.contextDomain.fingerprint,candidateFingerprint:r.featureContext?.candidateDomain.fingerprint??p.candidateDomain.fingerprint,sourceContextIdentity,origin:[...origin],bounds:[...window.bounds],width:p.image.width,height:p.image.height,scientificScopeFingerprint:scope?.fingerprint??null,...(mode==='global'?{sourceObservationPolicy:'declared-window-union-single-observation'}:{}),nativeWholeRectangle:p.fullRectangle&&!textContext,coordinates:'window-native-pixel-centres',matching:featureSettings?'native feature-only window, no local matcher/grouping/fit':mode==='global'?'unchanged native SparseCopyEngine on the canonical union':'unchanged native SparseCopyEngine within this analysis only'};
   const free=budget.reserve(65536+4*sourceRegionTransportBytes(analysisWindow,{allowUndefined:true})),nativeRelease=output.release;let released=false,pending;
   output.cloneWindowMode=mode==='global-feature'?'global':mode;output.provenance={...output.provenance,cloneWindowMode:output.cloneWindowMode,params:task.params,requestedParameters:task.params,nativeParameters:featureSettings?{...sparseCopyParams(input),regions:receipt?.regions??input.regions,excluded:receipt?.excluded??input.excluded}:output.params??input,cloneWindowIds:mode==='global'?window.declaredWindowIds:[window.id],nativeRegionPolicy:joint&&input.compare!==true?'one-search-context-over-union-before-native-input':nativeRegionPolicy,requestedParameterCoordinates:'original-pixels',nativeParameterCoordinates:'window-context-local-pixels',nativeContextPolicy:mode==='global'?'declared-window-union-single-observation':'one-declared-window'};output.metadata={...output.metadata,analysisWindow};
   output.release=()=>{if(released||pending)return pending;pending=Promise.resolve().then(()=>nativeRelease()).then(()=>{free();released=true;},error=>{pending=undefined;throw error;});return pending;};
   returned=true;return output;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   try{await retireCompositeOwners([
    ...(!returned&&output?[()=>output.release()]:[]),
    async()=>{await r.native?.retirePending();await retireCompositeOwners([
     ...[...r.receipts].map(value=>async()=>{await value.release();r.receipts.delete(value);}),
     ...[...r.contexts].map(value=>async()=>{await value.release();r.contexts.delete(value);})
    ]);}
   ],failed?{primary}:{});}
   catch(error){if(returned&&output)r.receipts.add(output);throw error;}
   finally{r.featureContext=null;r.busy=false;}
  }
 }
 function globalWindow(plan){const g=plan?.global;requireValue(plan?.mode==='global'&&g?.contextPolicy==='declared-window-context-union'&&g.candidateDomain&&g.contextDomain,'Explicit declared-window global context required.');const d=g.contextDomain;return{id:'global-analysis',kind:'global',declaredWindowIds:[...g.windowIds],bounds:[d.rect.x0,d.rect.y0,d.rect.x1,d.rect.y1],...g,fingerprint:JSON.stringify(['union-before-native-input/1',g.fingerprint]),status:g.candidateDomain.empty?'empty':'ready'};}
 const callback=job=>run(job,'independent');
 callback.runGlobal=({plan,...job})=>run({...job,window:globalWindow(plan)},'global');
 callback.retainWindows=async plan=>{requireValue(!closed&&['independent','global'].includes(plan?.mode),'A live canonical native plan is required.');const keep=new Set();if(plan.mode==='global'&&plan.windows.some(w=>w.status!=='empty')){const window=globalWindow(plan);keep.add(key('global',window));}else for(const w of plan.windows)if(w.status!=='empty')keep.add(key('independent',w));await retireCompositeOwners([...entries].filter(([id])=>!keep.has(id)).map(([,r])=>()=>r.retire()));};
 callback.dispose=()=>{closed=true;if(closing)return closing;closing=retireCompositeOwners([...entries.values()].map(r=>()=>r.retire()));void closing.finally(()=>{closing=null;}).catch(()=>{});return closing;};
 callback.clearCheckpoint=checkpoint=>retireCompositeOwners([...entries.values()].map(r=>()=>r.engine?.clearCheckpoint?.(checkpoint)));
 Object.defineProperty(callback,'counts',{get(){const counts={...retiredCounts};for(const r of entries.values())if(!r.countsRecorded)addCounts(counts,countsFor(r));return counts;}});
 callback.state=()=>({closed,entries:entries.size,loans:[...entries.values()].reduce((n,r)=>n+r.loans,0)});
 return callback;
}
