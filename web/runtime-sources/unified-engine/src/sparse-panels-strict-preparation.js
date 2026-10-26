import "../../runtime-context.js?v=0.25.0";
import{prepareSparseStrictNativeContext}from'./sparse-strict-source.js';
import{createOriginalSourceRegionsState,compileOriginalSourceRegions}from'./source-region-geometry.js';
import{prepareSourceRegionOcr,analyzeSourceRegionOcr}from'./source-region-ocr.js';
import{detectSourceRegionPanels}from'./source-region-subimages.js';
import{deduplicateTextBoxes,textPolygons}from'./text-regions.js';
import{enclosingCopyRegions}from'./copy-policy.js';
import{sparseCopyParams}from'./sparse-copy.js';
import{sparseStageCache}from'./sparse-stage-cache.js';
import{sourceRegionTransportBytes}from'./source-region-transport.js';
import{createOcrRetirementOwner}from'./ocr-owned-retirement.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
import{requireValue,checkAbort,EngineError}from'./errors.js';
const PANELS='SIFT + G2NN + RANSAC + Panels + Text',bytes=value=>65536+4*sourceRegionTransportBytes(value,{allowAliases:true,allowUndefined:true});let next=0;
/** Unchanged native panels and TextRegionEngine in exact admitted contexts.
 * The product route owns verified native English weights; private experiment
 * reservation remains explicit and separate. This receipt contains no matches. */
export function createStrictPanelsPreparation(budget,profile,{textEngine,testTextEngine,ocrAuthorization,nativeProductOcr=false}={}){
 const prefix='strict-panels-text/'+(++next)+'/',held=new Set();let active=false,closed=false,finished=Promise.resolve(),disposal;
 const retry=()=>retireCompositeOwners([...held].map(owner=>()=>owner.release()));
 return{
  async prepare(record,input,hooks={}){
   requireValue(!active&&!closed,'Strict Panels preparation is busy or closed.');const p=sparseCopyParams(input),signal=hooks.signal;requireValue(p.algorithm===PANELS,'Strict Panels owns only its named product variant.');
   if(hooks.scientificScope)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','The version3 scientific-scope Panels path needs a separate qualification; no OCR/model substitute is selected.');
   checkAbort(signal);active=true;let finish;finished=new Promise(resolve=>finish=resolve);let base,prepared,failed=false,primary;const releases=[],hits={},cache=sparseStageCache(budget,prefix,{signal,byteLength:bytes,hits}),admit=n=>releases.push(createOcrRetirementOwner(budget.reserve(n)));
   let owner;owner=createOcrRetirementOwner(async()=>{await prepared?.dispose();await base?.release();await retireCompositeOwners(releases.map(x=>()=>x.release()));cache.finish({publish:!closed&&!failed&&!signal?.aborted});held.delete(owner);});held.add(owner);
   try{
    // Prior refusals keep their children and source alive; retry before new work.
    await retireCompositeOwners([...held].filter(x=>x!==owner).map(x=>()=>x.release()));
    const task={...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:p};
    if(hooks.nativeWindowContext){
     const window=hooks.nativeWindowContext;requireValue(window.sourceDomain?.descriptor&&window.source?.readWindow&&window.sourceDomain.sourceSha256===record.sha256,'Canonical native-window source required.');
     base={sourceDomain:window.sourceDomain,source:window.source,strictExclusions:[],release(){}};
    }else base=await prepareSparseStrictNativeContext(record,task,{budget,signal});checkAbort(signal);
    const domain=base.sourceDomain,state=await createOriginalSourceRegionsState({sourceSha256:domain.sourceSha256,width:domain.sourceWidth,height:domain.sourceHeight});
    const zones=[{id:'upstream-domain',kind:'acquisition',enabled:true,x0:domain.origin[0],y0:domain.origin[1],x1:domain.origin[0]+domain.width,y1:domain.origin[1]+domain.height}];
    for(const[index,negative]of base.strictExclusions.entries()){const polygon=negative.polygon,xs=polygon.map(q=>q[0]),ys=polygon.map(q=>q[1]);zones.push({id:'upstream-negative-'+index,kind:'exclusion',enabled:true,x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys),polygon});}
    await state.replaceZones(zones,{positiveMode:'selected',enabled:true});
    const nativeSelection=hooks.nativeAcquisitionSelection===true;requireValue(!nativeSelection||hooks.nativeWindowContext?.sourceDomain===domain,'Native acquisition selection requires the canonical borrowed context.');
    const upstream=await compileOriginalSourceRegions(state.snapshot(),{ceiling:domain}),automatic=!nativeSelection&&!p.regions.length&&!p.compare,language=hooks.language;
    const key=JSON.stringify([record.sha256,upstream.fingerprint,automatic,nativeSelection,p.regions,p.excluded,p.compare,p.reflections,language?.sha256,testTextEngine?'controlled':'native']);
    const value=await cache.memo('upstream/'+key,async()=>{
     prepared=await prepareSourceRegionOcr({sha256:record.sha256,width:upstream.width,height:upstream.height,sourceRegionDomain:upstream.descriptor,sourceRegionOrigin:[...upstream.origin],originalSource:{sha256:record.sha256,surface:base.source}},{budget,signal,onOwner:owner=>prepared=owner});
     const delta=upstream.origin.map((n,i)=>n-domain.origin[i]),shift=poly=>poly.map(([x,y])=>[x+delta[0],y+delta[1]]);let panels=[],panelMetadata=null,envelope=null;
     if(automatic){hooks.onStage?.('panels');const raw=await detectSourceRegionPanels(prepared.view,{budget,signal,onProgress:hooks.onProgress}),rawOwner=prepared.own(()=>raw.release());try{admit(bytes(raw.data));panels=raw.data.polygons.map(shift);panelMetadata=structuredClone(raw.data.sourceRegionPanels);}finally{await rawOwner.release();}envelope=enclosingCopyRegions(panels);if(!panels.length)return{status:'no-regions',regions:[],excluded:p.excluded,preprocessing:{automatic_panels:true,panels:[],envelope:null,strictPanels:panelMetadata},controlledOcr:!!testTextEngine};}
     requireValue(language?.data instanceof Uint8Array&&typeof language.sha256==='string','Panels + Text requires explicit verified English OCR weights.');
     // Product runtime already owns verified native English weights and the
     // existing user request. Private experiment reservation stays separate.
     const nativeProduct=nativeProductOcr===true&&typeof textEngine?.detect==='function'&&/^[a-f0-9]{64}$/.test(language.sha256);
     if(!testTextEngine&&!nativeProduct&&(!/^[a-f0-9]{64}$/.test(ocrAuthorization?.reviewedSeal??'')||ocrAuthorization.reviewedSeal!==ocrAuthorization.expectedSeal))throw new EngineError('REVIEW_REQUIRED','Root source review and an explicit sealed launch are required before heavy OCR.');
     const detector=testTextEngine??textEngine;requireValue(typeof detector?.detect==='function','The original TextRegionEngine is required.');hooks.onStage?.('text');
     const result=await analyzeSourceRegionOcr(prepared,{},{budget,signal,payloadBytes:bytes,onProgress:hooks.onProgress,api:{async analyze(image,params,options){const native=await detector.detect(image,{language,signal:options.signal,onProgress:options.onProgress});return{regions:native.boxes.map(box=>({...box,bounds:[box.bounds[0],box.bounds[1],box.bounds[2]+1,box.bounds[3]+1]})),metadata:native.metadata,metrics:{},release:()=>native.release()};}}}),resultOwner=prepared.own(()=>result.release());let boxes,ocr;
     try{admit(bytes({regions:result.regions,metadata:result.metadata}));boxes=deduplicateTextBoxes(result.regions.map(box=>({bounds:[box.bounds[0]+delta[0],box.bounds[1]+delta[1],box.bounds[2]-1+delta[0],box.bounds[3]-1+delta[1]],confidence:box.confidence})));ocr=structuredClone(result.metadata);}finally{await resultOwner.release();}
     const polygons=textPolygons(boxes),regions=automatic?[...panels]:p.regions;if(automatic&&!regions.some(poly=>JSON.stringify(poly)===JSON.stringify(envelope)))regions.push(envelope);
     return{status:'ok',regions,excluded:[...p.excluded,...polygons],controlledOcr:!!testTextEngine,preprocessing:{version:2,reflections:p.reflections,implementation:'SHERLOQ alternative, not the luc_pub competition ensemble',automatic_panels:automatic,native_acquisition_selection:nativeSelection,panels,envelope,text_engine:'Tesseract / eng / PSM 11',text_boxes:boxes,text_exclusions:polygons,graph_exclusion:false,ocr,strictPanels:panelMetadata,strictUpstream:{domainFingerprint:upstream.fingerprint,originalSourceSha256:record.sha256,origin:[...domain.origin],excludedRgbBeforePanelsAndOcr:true,textRgbExcludedBeforeDescriptors:true,profileWorkers:profile.maxWorkers,qualification:testTextEngine?'controlled-OCR-route-only':nativeProduct?'native-product-Tesseract':'native-OCR-reviewed-experiment'}}};
    });
    await prepared?.dispose();prepared=undefined;await base.release();base=undefined;checkAbort(signal);
    admit(bytes(value));const copy=structuredClone(value);return{...copy,cache:{upstream:!!hits.upstream},release:()=>owner.release()};
   }catch(error){failed=true;primary=error;await retireCompositeOwners([()=>owner.release()],{primary});throw error;}
   finally{active=false;finish();}
  },
  dispose(){closed=true;if(disposal)return disposal;disposal=(async()=>{await finished;await retry();budget.clearPrefix(prefix);})().finally(()=>disposal=undefined);return disposal;}
 };
}
