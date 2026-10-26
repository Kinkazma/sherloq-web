import {createBatchPreparationClient,reprojectNativeScientificPreparation} from './batch-preparation-client.js?v=0.25.0';
import {composeScientificScope,scopeFingerprint} from './batch-scientific-preparation.js?v=0.25.0';
import {createManualScopeDraft,manualDraftScope,addManualScopeZone} from './batch-scope-manual.js?v=0.25.0';
import {scientificScopeEnvelope} from './batch-scope-geometry.js?v=0.25.0';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './original-source-regions.js?v=0.25.0';
import {detectIndividualSubimages} from './individual-subimages.js?v=0.25.0';
import {subimagesSourceDomain} from './subimages-source-domain.js?v=0.25.0';
import {createToolClient} from './tool-client.js?v=0.25.0';
import {EngineError,requireValue,checkAbort,createCooperator} from './unified-engine/src/errors.js';

const clone=value=>structuredClone(value),polygonKey=polygon=>JSON.stringify(polygon);
// These are proposals for the editor's private draft, not a scientific image
// analysis or a mutation of the source owner's region state.
export function createScopeDetectionActions({getClient,computeProfile=()=> 'maximum',excludeTexts=()=>true,language=()=> 'fr',preparationClientFactory=createBatchPreparationClient,toolClientFactory=createToolClient,isCurrent=()=>true}={}){
 const value=option=>typeof option==='function'?option():option;
 async function context(request,{strictSubimages=false}={}){
  const {image,scope,draft,signal}=request;checkAbort(signal);
  requireValue(image?.blob instanceof Blob&&/^[a-f0-9]{64}$/.test(image.sourceSha256??'')&&scope?.sourceSha256===image.sourceSha256&&scope.width===image.width&&scope.height===image.height&&await scopeFingerprint(scope)===scope.fingerprint,'Detection requires a validated scope bound to the original source.');
  checkAbort(signal);const before=[image.blob,image.id,image.sourceSha256,image.width,image.height],assertCurrent=()=>{checkAbort(signal);if(!isCurrent(request)||before.some((v,i)=>v!==[image.blob,image.id,image.sourceSha256,image.width,image.height][i]))throw new EngineError('CANCELLED','The source changed during region detection.');};assertCurrent();
  const currentDraft=clone(draft??createManualScopeDraft({...image,preparation:scope}));requireValue(currentDraft.sourceSha256===image.sourceSha256&&currentDraft.width===image.width&&currentDraft.height===image.height,'The detection draft belongs to another original source.');manualDraftScope(currentDraft,scope);
  const ceiling=image.sourceRegionCeiling??image.originalSourceRegions??scope.sourceRegionCeiling;let compiledCeiling;
  if(ceiling){compiledCeiling=await compileOriginalSourceRegions(ceiling);requireValue(compiledCeiling.sourceSha256===image.sourceSha256&&compiledCeiling.sourceWidth===image.width&&compiledCeiling.sourceHeight===image.height,'Detection ceiling belongs to another original source.');if(compiledCeiling.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','The original source ceiling admits no pixels.');}
  let domain;
  if(strictSubimages){requireValue(['whole','selected'].includes(request.sourceSelectionMode??'selected'),'The geometric detector needs the explicit source-owner selection mode.');domain=await subimagesSourceDomain({image,scope,wholeImageWhenNoAcquisitions:request.sourceSelectionMode==='whole'},{signal});}
  else{let envelope=scientificScopeEnvelope({regions:scope.regions,excluded:scope.excluded,width:image.width,height:image.height,sourceSha256:image.sourceSha256,...(ceiling?{sourceRegionCeiling:ceiling}:{})});
  if(!envelope){if(scope.regions?.length)throw new EngineError('SOURCE_SCOPE_EMPTY','The current acquisitions admit no original pixels.');envelope=compiledCeiling?{x0:compiledCeiling.origin[0],y0:compiledCeiling.origin[1],x1:compiledCeiling.origin[0]+compiledCeiling.width,y1:compiledCeiling.origin[1]+compiledCeiling.height}:{x0:0,y0:0,x1:image.width,y1:image.height};}
  // Preparation intentionally sees the bounding rectangle, including context
  // between panels. It never substitutes for a strict scientific RGB domain.
  const state=await createOriginalSourceRegionsState({sourceSha256:image.sourceSha256,width:image.width,height:image.height});await state.add('acquisition',envelope,{id:'editor-preparation-envelope'});domain=await compileOriginalSourceRegions(state.snapshot());}assertCurrent();
  let client,owned=false;try{if(getClient)client=await getClient();else{client=await toolClientFactory({computeProfile:value(computeProfile)});owned=true;await client.load({id:image.id??'editor-detection-source',blob:image.blob});}assertCurrent();return{image,scope,draft:currentDraft,domain,ceiling,client,owned,assertCurrent,strictSubimages};}catch(error){if(owned)await client?.dispose();throw error;}
 }
 function preserved(zone,all){return all||zone.origin!=='automatic';}
 function retainExclusions(draft,previous,all){
  for(const old of previous.zones.filter(z=>z.kind==='exclusion'&&preserved(z,all))){const existing=draft.zones.find(z=>z.kind==='exclusion'&&polygonKey(z.polygon)===polygonKey(old.polygon));if(existing){if(old.origin!=='automatic')Object.assign(existing,clone(old),{id:existing.id});continue;}const next=clone(old);if(draft.zones.some(z=>z.id===next.id)){do{next.id='zone-'+draft.nextId++;}while(draft.zones.some(z=>z.id===next.id));}draft.zones.push(next);}
 }
 async function publish(scope,draft,ctx,kind){
  const base=clone(scope);if(ctx.ceiling)base.sourceRegionCeiling=clone(ctx.ceiling);const next=manualDraftScope(draft,base);if(ctx.ceiling)requireValue(next.sourceRegionCeiling?.fingerprint===ctx.ceiling.fingerprint,'The detection proposal lost its validated original-source ceiling.');if(scope.status==='needs-review')next.status='needs-review';next.text=clone(scope.text);next.warnings=clone(scope.warnings??[]);
  next.manual={schema:draft.schema,version:1,actor:'system',coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256:ctx.image.sourceSha256,width:ctx.image.width,height:ctx.image.height,baseFingerprint:scope.fingerprint??null,zones:clone(draft.zones),actions:[{operation:kind,actor:'system',coordinates:'original-pixels'}],originalPixelsPreserved:true};
  next.provenance={...(next.provenance??{}),editorDetection:{kind,sourceSha256:ctx.image.sourceSha256,sourceRegionDomain:ctx.domain.descriptor,preparationContext:ctx.strictSubimages?'strict-native-contexts':'envelope-not-scientific-membership',inputScopeFingerprint:ctx.scope.fingerprint,originalPixelsModified:false}};next.fingerprint=await scopeFingerprint(next);ctx.assertCurrent();return{scope:next};
 }
 const noPanels=ctx=>({scope:clone(ctx.scope),unchanged:true,notice:value(language)==='en'?'No panels were detected; the current regions are preserved.':'Aucun panneau détecté ; les zones actuelles sont conservées.'});
 async function automatic(request){
  let ctx,reader,preparation;try{ctx=await context(request);requireValue(typeof ctx.client.acquirePreparationSource==='function','Native preparation source transport is unavailable.');reader=await ctx.client.acquirePreparationSource({sourceRegionDomain:ctx.domain.descriptor});ctx.assertCurrent();preparation=await preparationClientFactory({computeProfile:value(computeProfile)});ctx.assertCurrent();const detectText=value(excludeTexts);requireValue(typeof detectText==='boolean','The OCR detection option must be explicit.');const raw=await preparation.prepareNativeSource(reader,{sourceRegionDomain:ctx.domain.descriptor,textOnly:false,detectText,signal:request.signal,onProgress:request.onProgress});ctx.assertCurrent();const prepared=reprojectNativeScientificPreparation(raw,ctx.image,ctx.domain),image={...ctx.image,preparation:undefined,originalSourceRegions:undefined,sourceRegionCeiling:ctx.ceiling};const pageExclusions=ctx.image.occurrences?.flatMap(o=>o.textExclusions??[])??ctx.scope.pdfText?.projectedPagePolygons??[];const composed=composeScientificScope(image,prepared,{pageExclusions});if(!composed.regions.length)return noPanels(ctx);const draft=createManualScopeDraft({...ctx.image,preparation:composed});retainExclusions(draft,ctx.draft,false);return await publish(composed,draft,ctx,'batch-scientific-preparation');}
  finally{try{await preparation?.dispose();}finally{try{await reader?.dispose();}finally{if(ctx?.owned)await ctx.client.dispose();}}}
 }
 async function subimages(request){
  let ctx;try{ctx=await context(request,{strictSubimages:true});const detector={async detectSubimages(){const data=await ctx.client.detectSubimages({sourceRegionDomain:ctx.domain.descriptor,strictSourceRegions:true,signal:request.signal});ctx.assertCurrent();requireValue(data?.sourceRegionDomain?.fingerprint===ctx.domain.fingerprint&&Array.isArray(data.regions),'The geometric detector did not acknowledge its strict original-source domain.');const [dx,dy]=ctx.domain.origin,cooperate=createCooperator(request.signal);for(const r of data.regions){const b=r.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=ctx.domain.width&&b[3]<=ctx.domain.height&&b[2]>b[0]&&b[3]>b[1],'Detected panel exceeds its native admitted domain.');for(let y=b[1];y<b[3];y++){await cooperate();requireValue(ctx.domain.rowIntervals(y).some(([x0,x1])=>x0<=b[0]&&x1>=b[2]),'Detected panel includes pixels outside its admitted native context.');}}ctx.assertCurrent();return{...data,regions:data.regions.map(r=>({...r,bounds:[r.bounds[0]+dx,r.bounds[1]+dy,r.bounds[2]+dx,r.bounds[3]+dy]})),...(data.polygons?{polygons:data.polygons.map(p=>p.map(([x,y])=>[x+dx,y+dy]))}:{})};}};const rectangles=(await detectIndividualSubimages(detector,{...ctx.image,maxRegions:8192})).filter(r=>!r.envelope);ctx.assertCurrent();if(!rectangles.length)return noPanels(ctx);const draft=clone(ctx.draft);draft.zones=draft.zones.filter(z=>z.kind==='exclusion');for(const r of rectangles){const z=addManualScopeZone(draft,'acquisition',r,{type:'acquisition'});z.origin='automatic';z.label='Detected panel';}return await publish(ctx.scope,draft,ctx,'geometric-subimages');}
  finally{if(ctx?.owned)await ctx.client.dispose();}
 }
 return{onDetectAutomatically:automatic,onDetectSubimages:subimages};
}
