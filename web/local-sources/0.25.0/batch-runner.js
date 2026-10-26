import {legacyBatchPixelDomain,LEGACY_BATCH_PIXEL_DOMAIN_VERSION} from './legacy-batch-pixel-domain.js?v=0.25.0';
import {originalBatchTaskDomain} from './original-source-regions-batch.js?v=0.25.0';
import {localFeaturePolicy} from './feature-policy.js?v=0.25.0';
import {createToolClient} from './tool-client.js?v=0.25.0';
import {createAutomaticClient} from './automatic-client.js?v=0.25.0';
import {createCompositeClient} from './composite-client.js?v=0.25.0';
import {batchTask,batchRecipeView,recipeKey,imageScore,studyScores,catalogRecipe,batchCatalog,batchPairSelection,restoredBatchPair,assertBatchScientificScope,batchScopeSupport} from './batch-catalog.js?v=0.25.0';
import {serializeEngineError} from './unified-engine/src/errors.js';
import {evidenceContext,cloneEvidence,mapEvidence,regionEvidence,compactEvidence} from './batch-evidence.js?v=0.25.0';
import {nextFrame,safeName} from './batch-import.js?v=0.25.0';
import {detectedRectangles} from './sparse-controls.js?v=0.25.0';
import {neuralDisplays} from './neural-clone-ui.js?v=0.25.0';
import {rectangleComplement,offsetPolygons,rectanglePolygon} from './batch-scope-geometry.js?v=0.25.0';
import {renderBatchCorroboration} from './batch-corroboration-export.js?v=0.25.0';
import {archiveBatchAttempt} from './batch-restoration.js?v=0.25.0';
import {BATCH_RESUME_SCHEMA,BATCH_RESUME_PLAN_SCHEMA,batchResumeKey,batchResumeImageCompatible,batchPlannedIdentity,batchResumePlan,batchResumePlanCompatible,batchScientificSignature,resumableBatchRun,batchBlobSha256,saveBatchRunEvidence,restoreBatchRunEvidence} from './batch-run-resume.js?v=0.25.0';

const check=signal=>signal?.throwIfAborted();
// Every retained evidence owner must acknowledge retirement before its context closes.
async function retireEvidence(owners,failure){
 const errors=[];for(const owner of owners)try{await owner?.release?.();}catch(error){errors.push(error);}
 if(!errors.length)return;const primary=failure??errors.shift();
 if(errors.length)primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),...errors.map(error=>serializeEngineError(error,'BATCH_CLEANUP_ERROR'))]};
 if(!failure)throw primary;
}
export const BATCH_DISPLAY_POLICY=Object.freeze({schema:'sherloq.batch-final-display/1',version:1,singleCloneMethod:'biomes',multipleCloneMethods:'corroboration',minimumMethods:2,biomesOnly:true});
const polygon=r=>[[r.x0,r.y0],[r.x1-1,r.y0],[r.x1-1,r.y1-1],[r.x0,r.y1-1]];
const dataBlob=value=>new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
export async function batchComparisonScope(left,right,{width,height,offset=left.height+32,sourceSha256}={}){
 const a=assertBatchScientificScope(left),b=assertBatchScientificScope(right),shift=region=>({...region,y0:region.y0+offset,y1:region.y1+offset,...(region.polygon?{polygon:offsetPolygons([region.polygon],0,offset)[0]}:{})});
 const regions=[...a.regions.map(region=>structuredClone(region)),...b.regions.map(shift)],excluded=[...a.excluded,...offsetPolygons(b.excluded,0,offset),...rectangleComplement(regions,width,height)],polygons=[...new Map(excluded.map(poly=>[JSON.stringify(poly),poly])).values()];
 const textPolygons=[...(a.text.polygons??[]),...offsetPolygons(b.text.polygons??[],0,offset)],scope={schema:'sherloq.scientific-scope/1',version:'batch-scientific-comparison/1',coordinates:'original-pixels',width,height,sourceSha256,status:'ready',regions,excluded:polygons,searchRegions:[{x0:0,y0:0,x1:left.width,y1:left.height,polygon:rectanglePolygon({x0:0,y0:0,x1:left.width,y1:left.height}),envelope:true},{x0:0,y0:offset,x1:right.width,y1:offset+right.height,polygon:rectanglePolygon({x0:0,y0:offset,x1:right.width,y1:offset+right.height}),envelope:true}],text:{status:'complete',polygons:textPolygons},models:{left:structuredClone(a.models),right:structuredClone(b.models)},sources:[{imageId:left.id,sourceSha256:a.sourceSha256,fingerprint:a.fingerprint,offset:[0,0]},{imageId:right.id,sourceSha256:b.sourceSha256,fingerprint:b.fingerprint,offset:[0,offset]}],remainder:'excluded-unclassified',scopeSupport:{mode:'input-exclusions',method:'SIFT + G2NN + RANSAC',regions:'two-image-search-envelopes',acquisitions:'separate-whitelist',text:'precomputed-original-coordinate-exclusions'}};
 const encoded=new TextEncoder().encode(JSON.stringify([scope.version,sourceSha256,width,height,offset,scope.sources,regions,polygons]));scope.fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(x=>x.toString(16).padStart(2,'0')).join('');
 assertBatchScientificScope({name:left.name+' / '+right.name,width,height,preparation:scope});return scope;
}
export async function displayBlob(client,descriptor,signal){
 const canvas=new OffscreenCanvas(descriptor.width,descriptor.height),ctx=canvas.getContext('2d');
 try{for(let y=0;y<descriptor.height;y+=32){check(signal);const rows=Math.min(32,descriptor.height-y),pixels=await client.readWindow(descriptor,{x:0,y,width:descriptor.width,height:rows}),rgba=ctx.createImageData(pixels.width,pixels.height);for(let i=0;i<pixels.width*pixels.height;i++){rgba.data[i*4]=pixels.data[i*3];rgba.data[i*4+1]=pixels.data[i*3+1];rgba.data[i*4+2]=pixels.data[i*3+2];rgba.data[i*4+3]=255;}ctx.putImageData(rgba,0,y);await nextFrame();}return await canvas.convertToBlob({type:'image/png'});}finally{canvas.width=canvas.height=1;}
}
export function createBatchRunner({computeProfile='maximum',onProgress=()=>{},toolFactory=createToolClient,automaticFactory=createAutomaticClient,scientificFiltering=true,corroborationRenderer=renderBatchCorroboration,evidenceFactory=evidenceContext,evidenceSaver=saveBatchRunEvidence,evidenceRestorer=restoreBatchRunEvidence}={}){
 let tool,automatic,composite,controller,pairController,context,automaticSourceBlob,runCompletion,pairCompletion;
 async function put(artifacts,path,output){try{await artifacts.set(path,output.blob??output);return path;}finally{await output.cleanup?.();}}
 function event(value){onProgress(value);}
 const profile=()=>typeof computeProfile==='function'?computeProfile():computeProfile;
 async function getTool(){return tool??=await toolFactory({computeProfile:profile(),memoryBudgetBytes:4*1024**3,m2MemoryBudgetBytes:2*1024**3,onProgress:e=>event({phase:'kernel',detail:e})});}
 async function getAutomatic(){return automatic??=await automaticFactory({computeProfile:profile(),memoryBudgetBytes:4*1024**3,retainMasks:true,onProgress:e=>event({phase:'kernel',detail:e})});}
 async function detectedPair(image,owner,signal){
  if(scientificFiltering){
   const scope=assertBatchScientificScope(image),candidates=scope.regions.map((r,i)=>({id:'scientific-panel-'+i,x0:Math.ceil(r.x0),y0:Math.ceil(r.y0),x1:Math.floor(r.x1),y1:Math.floor(r.y1)})).filter(r=>r.x1-r.x0>=8&&r.y1-r.y0>=8);
   image.panels={source:'scientific-preparation',fingerprint:scope.fingerprint,regions:candidates.map(r=>({id:r.id,bounds:[r.x0,r.y0,r.x1,r.y1]}))};
   let selection=restoredBatchPair(image);if(!selection&&candidates.length===2){selection=image.pairSelection=batchPairSelection(image,candidates,'detected');image.pairCleared=false;}check(signal);return {candidates,selection};
  }
  if(owner.source?.id!==image.id)await owner.load({id:image.id,blob:image.blob});check(signal);
  image.panels??=await owner.detectSubimages();check(signal);
  const candidates=detectedRectangles(image.panels).filter(r=>!r.envelope);
  let selection=restoredBatchPair(image);
  if(!selection&&candidates.length===2){selection=image.pairSelection=batchPairSelection(image,candidates,'detected');image.pairCleared=false;}
  return {candidates,selection};
 }
 async function execute(image,recipe,artifacts,options,signal){
  check(signal);localFeaturePolicy.assertTaskAvailable(recipe);const path='resultats/'+image.id+'/'+safeName(recipe.id),run={toolId:recipe.id,title:recipe.fr,operation:recipe.operation,kind:recipe.kind,methodKey:recipeKey(recipe),backend:recipe.backend??'auto',params:structuredClone(recipe.params),signal:structuredClone(recipe.signal),...(recipe.view!==undefined?{view:structuredClone(recipe.view)}:{}),status:'running',files:[]};image.runs.push(run);event({phase:'tool',image,recipe,run});let owner,entries;
  try{
   const scope=scientificFiltering?assertBatchScientificScope(image):undefined,signalImage=scope?image:{...image,preparation:undefined};let domainCapabilities;if(['detail.wavelets','noise.blocking'].includes(recipe.operation)||image.preparation?.sourceRegionDomain&&recipe.operation!=='composite'){owner=recipe.kind==='automatic'?await getAutomatic():await getTool();domainCapabilities=(await owner.capabilities()).sourceRegions;check(signal);}let sourceRegionDomain=await originalBatchTaskDomain(image,recipe.operation,{capabilities:domainCapabilities,params:recipe.params});run.scopeSupport=batchScopeSupport(recipe,scope);if(sourceRegionDomain)run.sourceRegionDomain=structuredClone(sourceRegionDomain);
   if(scope)run.preparation={schema:scope.schema,version:scope.version,fingerprint:scope.fingerprint,sourceSha256:scope.sourceSha256,coordinates:scope.coordinates,models:structuredClone(scope.models)};
   let output;
   if(recipe.kind==='automatic'){
    owner=await getAutomatic();if(owner.source?.id!==image.id||owner.source?.sha256!==image.sourceSha256||automaticSourceBlob!==image.blob){await owner.load({id:image.id,blob:image.blob});automaticSourceBlob=image.blob;}
    const params={...recipe.params};if(scope){params.scientificScope=structuredClone(scope);params.selection={regions:scope.regions.map(r=>structuredClone(r.polygon??rectanglePolygon(r))),envelope:null,disabled:[]};}else if(!options.panels||!['microscopy','gel'].includes(image.family))params.selection={regions:[[[0,0],[image.width-1,0],[image.width-1,image.height-1],[0,image.height-1]]],envelope:[[0,0],[image.width-1,0],[image.width-1,image.height-1],[0,image.height-1]],disabled:[]};run.effectiveParams=structuredClone(params);
    check(signal);output=await owner.run({id:'batch-'+crypto.randomUUID(),imageId:image.id,operation:recipe.operation,params,backend:recipe.backend??'auto',...(sourceRegionDomain?{sourceRegionDomain}:{} )});
    const chunks=[];await owner.exportTo({async write(bytes){chunks.push(new Blob([bytes]));}});run.files.push(await put(artifacts,path+'.npz',new Blob(chunks,{type:'application/zip'})));
    const display=await owner.display('corroboration',{overlay:true});run.files.push(await put(artifacts,path+'.png',await displayBlob(owner,display,signal)));
    if(Object.values(output.data?.state?.states??{}).some(state=>['failed','paused','cancelled','unavailable'].includes(state)))run.partial=true;
   }else if(recipe.operation==='composite'){
    composite??=await createCompositeClient({computeProfile:profile(),memoryBudgetBytes:1024**3});const value=await composite.analyze(image.blob,recipe.params,{signal,expectedSourceSha256:image.sourceSha256,onProgress:e=>event({phase:'kernel',detail:e}),backend:recipe.backend??'auto',...(sourceRegionDomain?{sourceRegionDomain}:{} )});output={data:value.metadata,provenance:value.metadata.provenance};let exportFailure;
    try{if(value.result.fields.map){const reader={async readWindow(display,rect){const frame=await composite.renderWindow(value.result.id,'map',rect);try{const data=new Uint8Array(frame.bytes);for(let at=0;at<data.length;at+=composite.ready.windowBytes)data.set(await composite.readExport(frame.id,at,Math.min(composite.ready.windowBytes,data.length-at)),at);return {width:frame.width,height:frame.height,data};}finally{await composite.releaseExport(frame.id);}}};run.files.push(await put(artifacts,path+'.png',await displayBlob(reader,value.result,signal)));}
    const chunks=[];await composite.exportTo(value.result.id,new WritableStream({write(bytes){chunks.push(new Blob([bytes]));}}),{signal});run.files.push(await put(artifacts,path+'.npz',new Blob(chunks)));}catch(error){exportFailure=error;throw error;}finally{await retireEvidence([{release:()=>composite.release(value.result.id)}],exportFailure);}
   }else{
    owner=await getTool();check(signal);if(owner.source?.id!==image.id)await owner.load({id:image.id,blob:image.blob});let regions=[];
    if(recipe.params.algorithm==='EfficientLoFTR'){
     let selection=restoredBatchPair(image);
     if(!selection){const detected=await detectedPair(image,owner,signal);selection=detected.selection;if(!selection)throw Object.assign(Error('EfficientLoFTR : choisissez exactement deux panneaux, ou saisissez deux rectangles dans Images.'),{code:'BATCH_PAIR_REQUIRED',details:{imageId:image.id,pixelHash:image.hash,candidateCount:detected.candidates.length,requiredRegions:2}});}
     image.pairSelection=selection;regions=selection.regions;run.pairSelection=structuredClone(selection);options.pairSelections[image.hash]=structuredClone(selection);
    }else if(scope&&recipe.kind==='clones')regions=scope.regions;
    else if(options.panels&&['microscopy','gel'].includes(image.family)&&(recipe.kind==='clones')){
     image.panels??=await owner.detectSubimages();regions=detectedRectangles(image.panels);
    }
    if(!scope&&recipe.params.algorithm?.endsWith('Panels + Text')&&!regions.length)regions=[{x0:0,y0:0,x1:image.width,y1:image.height}];
    if(recipe.requires==='median'&&options.median)await owner.loadModel('median',options.median);
    const task=batchTask(recipe,{id:'batch-'+crypto.randomUUID(),imageId:image.id,regions,scientificScope:scope});if(scope&&!sourceRegionDomain&&['detail.wavelets','noise.blocking'].includes(recipe.operation)){sourceRegionDomain=await legacyBatchPixelDomain(image,recipe.operation,{signal,loadedSource:owner.source,task,capabilities:domainCapabilities,admit:true});check(signal);run.sourceRegionDomain=structuredClone(sourceRegionDomain);run.sourceRegionInputOrigin='legacy-batch-preparation';}const extras={file:image.blob,reference:options.reference,database:options.database,...(sourceRegionDomain?{sourceRegionDomain}:{} )};if(sourceRegionDomain)task.sourceRegionDomain=structuredClone(sourceRegionDomain);run.effectiveParams=structuredClone(task.params);if(task.view!==undefined)run.effectiveView=structuredClone(task.view);
    check(signal);output=await owner.run(task,extras);
    run.files.push(await put(artifacts,path+'.json',await owner.export('json')));
    const neural=neuralDisplays(output,'fr'),overlay=neural?.find(v=>v.display.cloneView==='overlay');
    if(overlay){run.files.push(await put(artifacts,path+'.png',await displayBlob(owner,overlay.display,signal)));const mask=output.maskSurfaces?.mask;if(mask)run.files.push(await put(artifacts,path+'-mask.png',await owner.export('png',mask)));}
    else if(output.surface){run.files.push(await put(artifacts,path+'.png',await owner.export('png',output.surface)));}
    if(output.m2Result){run.files.push(await put(artifacts,path+'.npz',await owner.export('npz')));const display=output.views?.[0];if(display&&!overlay)run.files.push(await put(artifacts,path+'.png',await displayBlob(owner,display,signal)));}
    else if(['clones','map','ela','regions'].includes(recipe.kind)&&recipe.operation!=='tampering.copyMove.brisk'&&recipe.operation!=='tampering.copyMove.akaze'&&recipe.operation!=='tampering.copyMove.orb'){
     try{run.files.push(await put(artifacts,path+'.npz',await owner.export('npz',output.operation==='tampering.copyMove.sparse'?undefined:output.surface)));}catch(error){run.exportWarning=error.message;run.exportError=serializeEngineError(error,'BATCH_EXPORT_ERROR');}
    }
   }
   check(signal);if(scope&&recipe.operation==='ai.clones.segmentation')run.scopeSupport=await batchScopeSupport(recipe,scope,output,{budget:context.budget,signal});run.provenance=compactEvidence(output.provenance);run.metrics=compactEvidence(output.metrics);
   if(scope&&run.scopeSupport.mode==='raw-only'){run.entries=[];run.cloneMaximum=0;run.positive=false;run.rawObservations=compactEvidence(output.data?.metadata??output.data?.state??null);}
   else if(recipe.kind==='clones'||recipe.kind==='automatic'){entries=await cloneEvidence(output,recipe,owner,signalImage,context,signal);run.entries=entries.entries;if(entries.evidencePreparation)run.evidencePreparation=compactEvidence(entries.evidencePreparation);run.cloneMaximum=await context.maximum(entries.entries,image.width,image.height,signal,scope);run.positive=run.cloneMaximum>0;if(recipe.operation==='analysis.complete'){const ela=(output.data?.entries??[]).filter(e=>e.source==='ELA biomes');if(ela.length){run.additionalMethods=['ela.biomes'];run.additionalEntries=compactEvidence(ela);run.positive=true;}}}
   else if(recipe.kind==='map')Object.assign(run,await mapEvidence(output,recipe,owner,signalImage,signal));
   else if(['regions','ela'].includes(recipe.kind))Object.assign(run,regionEvidence(output,recipe));
   else run.positive=false;
   if(run.files.some(p=>p.endsWith('.npz'))&&run.files.some(p=>p.endsWith('.json')))await put(artifacts,path+'.json',dataBlob({schema:'sherloq.batch-evidence/1',operation:recipe.operation,params:recipe.params,effectiveParams:run.effectiveParams,view:run.view,effectiveView:run.effectiveView,preparation:run.preparation,scopeSupport:run.scopeSupport,evidencePreparation:run.evidencePreparation,derivedEntries:compactEvidence(run.entries),positive:run.positive,provenance:compactEvidence(output.provenance),metadata:compactEvidence(output.data),scientificArrays:path+'.npz'}));
   if(!run.partial)await evidenceSaver(image,run,entries?.entries??run.entries??[],artifacts,path+'-reprise',{signal});
   run.status=run.partial?'partial':'done';if(run.partial)run.error={code:'PARTIAL_ANALYSIS',message:'Certains détecteurs n’ont pas terminé. Les signaux des autres sont conservés.',groups:compactEvidence(output.data?.state)};
  }catch(error){run.status=signal.aborted?'cancelled':'error';run.error=serializeEngineError(error,'BATCH_TOOL_ERROR');run.inputRequired=error.code==='BATCH_PAIR_REQUIRED';if(!signal.aborted)try{run.files.push(await put(artifacts,path+'-error.json',dataBlob({schema:'sherloq.batch-error/1',imageId:image.id,toolId:recipe.id,error:run.error,params:run.params,view:run.view,effectiveView:run.effectiveView,pairSelection:run.pairSelection})));}catch(exportError){run.errorReportError=serializeEngineError(exportError,'BATCH_EXPORT_ERROR');}if(signal.aborted){await retireEvidence([entries],error);if(run.entries)run.entries=compactEvidence(run.entries);}check(signal);}
  return {run,release:entries?.release??(()=>{})};
 }
 function recipesSnapshot(recipes){return [...new Map(recipes.filter(recipe=>localFeaturePolicy.isTaskAvailable(recipe)).map(r=>[recipeKey(r),r])).values()].map(recipe=>{const snapshot=structuredClone(recipe),view=batchRecipeView(snapshot);if(view!==undefined)snapshot.view=view;return snapshot;});}
 function configurationFor(selected,unique,options,externalInputs={},runtimePins={}){
  const pairSelections={};if(unique.some(r=>r.params.algorithm==='EfficientLoFTR'))for(const image of selected){try{const selection=restoredBatchPair(image);if(selection)pairSelections[image.hash]=selection;}catch{}}
  return {...(localFeaturePolicy.local?{featurePolicy:localFeaturePolicy.snapshot()}:{}),options:{threshold:options.threshold??1,basis:options.basis??'clones',compare:!!options.compare,thresholdMode:options.thresholdMode??'manual',panels:scientificFiltering?true:!!options.panels,scientificFiltering},pairSelections,resumePolicy:{schema:BATCH_RESUME_SCHEMA,computeProfile:profile(),externalInputs,runtimePins,...(scientificFiltering&&unique.some(r=>['detail.wavelets','noise.blocking'].includes(r.operation))?{legacyNativePixelDomains:Object.fromEntries(selected.filter(image=>!image.originalSourceRegions&&!image.preparation?.originalSourceRegions&&!image.preparation?.sourceRegionDomain&&!image.preparation?.sourceRegionCeiling).map(image=>[image.id,LEGACY_BATCH_PIXEL_DOMAIN_VERSION]))}:{}),...(localFeaturePolicy.local?{featurePolicy:localFeaturePolicy.snapshot()}:{})},...(scientificFiltering?{displayPolicy:{...BATCH_DISPLAY_POLICY},scientificPreparations:Object.fromEntries(selected.map(image=>{const p=image.preparation;return [image.id,{fingerprint:p?.fingerprint,sourceSha256:p?.sourceSha256,schema:p?.schema,version:p?.version,coordinates:p?.coordinates,models:structuredClone(p?.models),remainder:p?.remainder,unknown:p?.unknown,maxTextAcquisitionFraction:p?.maxTextAcquisitionFraction}];}))}:{}),recipes:unique.map(r=>({id:r.id,operation:r.operation,params:structuredClone(r.params),signal:structuredClone(r.signal),backend:r.backend??'auto',...(r.view!==undefined?{view:structuredClone(r.view)}:{})}))};
 }
 function canResume(model,recipes,options={}){
  if(controller||pairController)return false;
  const selected=model.images.filter(i=>i.selected),unique=recipesSnapshot(recipes),configuration=configurationFor(selected,unique,options,model.configuration?.resumePolicy?.externalInputs??{},model.configuration?.resumePolicy?.runtimePins??{}),plan=batchResumePlan(model,selected);
  return selected.length>0&&batchResumePlanCompatible(plan,selected,configuration,model.engine)&&selected.every(image=>{const unit=plan.units.find(unit=>unit.imageId===image.id);return !unit.started||batchResumeImageCompatible(image,configuration,model.engine)&&(!image.resumeState.planId||image.resumeState.planId===plan.runId)&&unique.every(recipe=>{const prior=image.runs.find(r=>r.toolId===recipe.id&&r.status==='done');return !prior||resumableBatchRun(prior,recipe,model.artifacts);});});
 }
 async function comparisons(model,options,signal){
  const selected=studyScores(model.studies,model.images,options).filter(s=>s.retained),ids=new Set(selected.map(s=>s.id));
  const images=model.images.filter(i=>i.selected&&i.state==='done'&&i.occurrences.some(o=>ids.has(o.studyId)));
  const previous=options.resume?(model.comparisons??[]):[];model.comparisons=[];const pairs=[];
  for(const image of images){const distinct=[...new Set(image.occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId))];if(distinct.length>1)model.comparisons.push({kind:'identical-pixels',images:[image.id,image.id],studies:distinct,hash:image.hash});}
  for(let a=0;a<images.length;a++)for(let b=a+1;b<images.length;b++){const left=new Set(images[a].occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId)),right=new Set(images[b].occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId));if([...left].some(x=>[...right].some(y=>x!==y)))pairs.push([images[a],images[b]]);}
  for(const [index,[left,right]]of pairs.entries()){
   check(signal);try{await originalBatchTaskDomain(left,'tampering.copyMove.sparse');await originalBatchTaskDomain(right,'tampering.copyMove.sparse');}catch(error){model.comparisons.push({images:[left.id,right.id],status:'error',message:error.message,error:serializeEngineError(error,'SOURCE_SCOPE_UNSUPPORTED')});continue;}const resumeKey=batchResumeKey({sources:[left,right].map(image=>[image.hash,image.sourceSha256,image.width,image.height,image.preparation?.fingerprint??null]),engine:model.engine,policy:'scientific-comparison/1'}),retained=previous.find(pair=>pair.status==='done'&&pair.resumeKey===resumeKey&&(pair.files??[]).every(path=>model.artifacts.has(path)));if(retained){model.comparisons.push({...retained,reused:true});event({phase:'comparison',completed:index+1,total:pairs.length,reused:true});continue;}event({phase:'comparison',completed:index,total:pairs.length});let a,b;const c=new OffscreenCanvas(Math.max(left.width,right.width),left.height+right.height+32),ctx=c.getContext('2d');
   if(c.width*c.height>100000000){model.comparisons.push({images:[left.id,right.id],status:'error',message:'Paire supérieure à 100 MP ; aucune réduction.'});continue;}
   try{
    const client=await getTool(),bitmap=async image=>{try{return await createImageBitmap(image.blob);}catch(error){check(signal);const source=await client.load({id:image.id,blob:image.blob});return createImageBitmap(await displayBlob(client,source.surface,signal));}};
    a=await bitmap(left);b=await bitmap(right);check(signal);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(a,0,0);ctx.drawImage(b,0,left.height+32);const blob=await c.convertToBlob({type:'image/png'});await client.load({id:'cross-'+crypto.randomUUID(),blob});
   const recipe=catalogRecipe(batchCatalog.find(r=>r.params.algorithm==='SIFT + G2NN + RANSAC').id);recipe.params.autoRadius=false;recipe.params.independent=false;recipe.params.compare=true;recipe.params.radius=Math.hypot(c.width,c.height);recipe.params.regions=[polygon({x0:0,y0:0,x1:left.width,y1:left.height}),polygon({x0:0,y0:left.height+32,x1:right.width,y1:left.height+32+right.height})];
    let preparation;if(scientificFiltering){preparation=await batchComparisonScope(left,right,{width:c.width,height:c.height,offset:left.height+32,sourceSha256:client.source.sha256});recipe.params.excluded=preparation.excluded;}
    const view=batchRecipeView(recipe);check(signal);const output=await client.run({id:'cross-run-'+crypto.randomUUID(),imageId:client.source.id,operation:'tampering.copyMove.sparse',params:recipe.params,view,backend:'auto'},{file:blob});
    const found=await cloneEvidence(output,{...recipe,kind:'clones'},client,{width:c.width,height:c.height,preparation},context,signal);let evidenceFailure;
    try{if(found.entries.length){const path='comparaisons/'+index;await put(model.artifacts,path+'.json',await client.export('json'));await put(model.artifacts,path+'.png',await client.export('png',output.surface));model.comparisons.push({kind:'geometric-matches',images:[left.id,right.id],offset:[0,left.height+32],entries:compactEvidence(found.entries),files:[path+'.json',path+'.png'],params:recipe.params,view:structuredClone(view),preparation:preparation?compactEvidence(preparation):undefined,status:'done',resumeKey});}else model.comparisons.push({kind:'geometric-matches',images:[left.id,right.id],entries:[],files:[],params:recipe.params,view:structuredClone(view),preparation:preparation?compactEvidence(preparation):undefined,status:'done',resumeKey});}catch(error){evidenceFailure=error;throw error;}finally{await retireEvidence([found],evidenceFailure);}
   }catch(error){check(signal);model.comparisons.push({images:[left.id,right.id],status:'error',message:error.message});}finally{a?.close();b?.close();c.width=c.height=1;}
  }
 }
 return {canResume,get running(){return !!controller||!!pairController;},cancel(){controller?.abort(Object.assign(Error('Traitement arrêté'),{code:'CANCELLED'}));pairController?.abort(Object.assign(Error('Préparation arrêtée'),{code:'CANCELLED'}));tool?.cancel();void automatic?.pause();},
  async preparePair(image){
   if(controller||pairController)throw Object.assign(Error('Lot déjà en cours.'),{code:'BUSY'});pairController=new AbortController();let finishPair;pairCompletion=new Promise(resolve=>finishPair=resolve);
   let failure;try{return await detectedPair(image,scientificFiltering?null:await getTool(),pairController.signal);}catch(error){failure=error;throw error;}finally{const previous=tool;tool=null;try{await previous?.dispose();}catch(error){if(failure)failure.cleanupError=serializeEngineError(error);else throw error;}finally{pairController=null;pairCompletion=null;finishPair();}}
  },
  async run(model,recipes,options={}){
   if(controller||pairController)throw Error('Lot déjà en cours.');controller=new AbortController();const signal=controller.signal;let failure,finishRun;runCompletion=new Promise(resolve=>finishRun=resolve);
   try{
   context=evidenceFactory();const excluded=recipes.filter(recipe=>!localFeaturePolicy.isTaskAvailable(recipe)),selected=model.images.filter(i=>i.selected),unique=recipesSnapshot(recipes);
   if(!unique.length&&excluded.length)throw Object.assign(Error('Toutes les fonctions du lot ont été désinstallées.'),{code:'FEATURE_UNINSTALLED',details:{scientificResult:false}});
   const excludedFeatures=excluded.map(recipe=>({id:recipe.id,title:recipe.fr,operation:recipe.operation,state:'feature-uninstalled',scientificResult:false}));
   if(unique.some(recipe=>recipe.kind==='automatic'))for(const id of localFeaturePolicy.automaticExcludedFeatures())excludedFeatures.push({id,title:localFeaturePolicy.catalog.features.find(feature=>feature.id===id)?.fr??id,operation:id,state:'feature-uninstalled',context:'automatic',scientificResult:false});
   if(scientificFiltering)for(const image of selected)assertBatchScientificScope(image);
   const deployment=await fetch(new URL('./integrated-config.json?v=0.25.0',import.meta.url)).then(response=>{if(!response.ok)throw Error('Configuration du moteur indisponible.');return response.json();}),engine={version:deployment.engineVersion,commit:deployment.engineCommit,increment:deployment.runtimeSourceIncrementSha256,...(deployment.scientificRegionsRuntimeIncrementSha256?{scientificRegionsIncrement:deployment.scientificRegionsRuntimeIncrementSha256}:{}),batch:scientificFiltering?'0.3.0-preparation.1':'0.2.0',memoryBudgetBytes:4*1024**3,m2MemoryBudgetBytes:2*1024**3},externalInputs={};
   if(deployment.scientificRegionsRuntimeIncrementSha256!==undefined&&!/^[a-f0-9]{64}$/.test(deployment.scientificRegionsRuntimeIncrementSha256))throw Object.assign(Error('Empreinte de l’incrément scientifique invalide.'),{code:'BATCH_ENGINE_IDENTITY_INVALID'});
   for(const key of ['median','reference','database'])if(options[key])externalInputs[key]=options[key] instanceof Blob?{sha256:await batchBlobSha256(options[key],{signal})}:compactEvidence(options[key]);
   const runtimePins=Object.fromEntries(Object.entries(deployment).filter(([key,value])=>/Sha256$/.test(key)&&typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))),configuration=configurationFor(selected,unique,options,externalInputs,runtimePins);
   let plan;
   if(options.resume){
    plan=batchResumePlan(model,selected);
    if(!batchResumePlanCompatible(plan,selected,configuration,engine))throw Object.assign(Error('Les sources, réglages, modèles ou exclusions du plan ont changé. Démarrez un nouveau traitement.'),{code:'BATCH_RESUME_MISMATCH'});
    for(const image of selected){
     const unit=plan.units.find(unit=>unit.imageId===image.id);
     if(await batchBlobSha256(image.blob,{signal})!==unit.sourceSha256)throw Object.assign(Error('Les octets de la source ont changé depuis le lancement.'),{code:'BATCH_RESUME_SOURCE_CHANGED',details:{imageId:image.id}});
     if(unit.verifyScopeFingerprint){const {scopeFingerprint}=await import('./batch-scientific-preparation.js?v=0.25.0');if(await scopeFingerprint(image.preparation)!==model.configuration.scientificPreparations[image.id].fingerprint)throw Object.assign(Error('La géométrie du périmètre prévu a changé depuis le lancement.'),{code:'BATCH_RESUME_MISMATCH',details:{imageId:image.id}});}
     if(unit.started){
      if(!batchResumeImageCompatible(image,configuration,engine)||image.resumeState.planId&&image.resumeState.planId!==plan.runId)throw Object.assign(Error('Les calculs conservés appartiennent à une autre tentative.'),{code:'BATCH_RESUME_MISMATCH',details:{imageId:image.id}});
      for(const recipe of unique){const done=image.runs.find(r=>r.toolId===recipe.id&&r.status==='done');if(done&&!resumableBatchRun(done,recipe,model.artifacts))throw Object.assign(Error('Une méthode terminée ne possède pas les preuves exactes nécessaires à la reprise. Ses fichiers restent conservés.'),{code:'BATCH_RESUME_EVIDENCE_REQUIRED',details:{imageId:image.id,toolId:recipe.id}});}
     }
    }
   }else{
    for(const image of selected)image.sourceSha256??=image.preparation?.sourceSha256??await batchBlobSha256(image.blob,{signal});
    plan={schema:BATCH_RESUME_PLAN_SCHEMA,version:1,runId:crypto.randomUUID(),engine:structuredClone(engine),units:selected.map(image=>({...batchPlannedIdentity(image,configuration),started:false}))};
   }
   model.engine=engine;model.excludedFeatures=excludedFeatures;
   if(!options.resume){for(const path of [...model.artifacts.keys()])if(path.startsWith('comparaisons/'))await model.artifacts.delete(path);model.comparisons=[];}
   options={...options,panels:configuration.options.panels,pairSelections:configuration.pairSelections};model.configuration=configuration;model.resumePlan=plan;
   for(const unit of plan.units)if(unit.started){const image=selected.find(image=>image.id===unit.imageId);image.resumeState.planId=plan.runId;}
   if(options.resume){(model.resumeEvents??=[]).push({at:new Date().toISOString(),previousFinishedAt:model.finishedAt,interruptedNativeMethod:'restarts-from-method-beginning-without-a-durable-native-checkpoint'});}else model.startedAt=new Date().toISOString();model.cancelled=false;
    for(const [index,image]of selected.entries()){
     check(signal);event({phase:'image-start',image,index,total:selected.length});
     const signature=c=>{const pair=c?.pairSelections?.[image.hash];return JSON.stringify([(c?.recipes??[]).map(r=>[r.operation,r.params,r.signal,r.backend??'auto',r.view??null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),c?.options?.panels,pair?[pair.pixelHash,pair.width,pair.height,pair.regions]:null,c?.options?.scientificFiltering??false,c?.scientificPreparations?.[image.id]??null,c?.displayPolicy??null,c?.featurePolicy??null,c?.resumePolicy?.legacyNativePixelDomains?.[image.id]??null]);};
     const planned=plan.units.find(unit=>unit.imageId===image.id),resuming=!!options.resume&&planned.started;
     if((!options.resume||resuming)&&options.reuse&&image.state==='done'&&!image.score?.incomplete&&image.restored&&JSON.stringify(image.restored.engine)===JSON.stringify(model.engine)&&signature(image.restored.configuration)===signature(model.configuration)){planned.started=true;image.resumeState={schema:BATCH_RESUME_SCHEMA,planId:plan.runId,...batchPlannedIdentity(image,configuration)};image.restored={configuration:structuredClone(configuration),engine:{...engine}};image.reused=true;event({phase:'image-done',image,index:index+1,total:selected.length,reused:true});continue;}
     const completed=resuming?(image.runs??[]).filter(run=>run.status==='done'):[];
     if(resuming&&image.state==='done'&&!image.score?.incomplete&&completed.length===unique.length&&!image.finalDisplay?.error){image.reused=true;event({phase:'image-done',image,index:index+1,total:selected.length,reused:true});continue;}
     const priorRuns=resuming?(image.runs??[]).filter(run=>run.status!=='done'):(image.runs??[]);
     if(priorRuns.length||image.finalDisplay){const previous={at:new Date().toISOString(),engine:image.restored?.engine,configuration:structuredClone(image.restored?.configuration??null),...(image.importedContextId?{importedContextId:image.importedContextId}:{}),runs:compactEvidence(priorRuns),score:structuredClone(image.score??null),...(resuming?{completedMethodsRetained:completed.map(r=>({toolId:r.toolId,methodKey:r.methodKey}))}:{}),...(image.finalDisplay?{finalDisplay:structuredClone(image.finalDisplay)}:{}),...(image.resultDisplay?{resultDisplay:structuredClone(image.resultDisplay)}:{}),...(image.displayPreferences?{displayPreferences:structuredClone(image.displayPreferences)}:{})},prefix='historique/'+crypto.randomUUID()+'/';(image.history??=[]).push(await archiveBatchAttempt(previous,model.artifacts,prefix,{signal}));}
     const retainedFiles=new Set(completed.flatMap(run=>run.files??[]));for(const path of [...model.artifacts.keys()])if(path.startsWith('resultats/'+image.id+'/')&&!retainedFiles.has(path))await model.artifacts.delete(path);
     image.sourceSha256??=image.preparation?.sourceSha256??await batchBlobSha256(image.blob,{signal});
     planned.started=true;image.resumeState={schema:BATCH_RESUME_SCHEMA,planId:plan.runId,pixelHash:image.hash,width:image.width,height:image.height,sourceSha256:image.sourceSha256,scientificSignature:batchScientificSignature(image,configuration)};image.restored={configuration:structuredClone(configuration),engine:{...engine}};
     image.reused=false;image.runs=[];image.finalDisplay=null;image.resultDisplay=null;image.state='running';const owned=[];let imageFailure;
     try{for(const recipe of unique){check(signal);const previous=completed.find(r=>r.toolId===recipe.id);
       if(previous){const restored=await evidenceRestorer(image,previous,model.artifacts,{budget:context.budget,signal});image.runs.push({...previous,reused:true,entries:restored.entries});owned.push(restored);event({phase:'tool-reused',image,recipe,run:image.runs.at(-1)});}
       else owned.push(await execute(image,recipe,model.artifacts,options,signal));await nextFrame();}
      const entries=image.runs.flatMap(r=>['done','partial'].includes(r.status)?r.entries??[]:[]),scope=scientificFiltering?image.preparation:undefined,algorithmsConfigured=[...new Set(unique.filter(r=>r.kind==='clones'||r.kind==='automatic').map(r=>r.params.algorithm??r.params.variant??(r.operation==='m2.forgeryscope'?'Forgeryscope Auto':r.operation)))],activeMethods=[...new Set(entries.map(e=>e.methodKey??e.source))];let maximum;
      if(scope)context.validateScope(scope,{width:image.width,height:image.height,sourceSha256:image.sourceSha256});
      const multi=scientificFiltering&&(algorithmsConfigured.length>=BATCH_DISPLAY_POLICY.minimumMethods||activeMethods.length>=BATCH_DISPLAY_POLICY.minimumMethods);
      if(multi){
       const client=await getTool();if(client.source?.id!==image.id)await client.load({id:image.id,blob:image.blob});context.validateScope(scope,{width:image.width,height:image.height,sourceSha256:client.source.sha256});event({phase:'corroboration',image});
       const methods=[...new Set([...activeMethods,...algorithmsConfigured])];
       try{const rendered=await corroborationRenderer({image,entries,context,client,artifacts:model.artifacts,path:'resultats/'+image.id+'/corroboration',signal,methods});maximum=rendered.maximum;image.finalDisplay={...rendered,kind:'corroboration',policy:{...BATCH_DISPLAY_POLICY},algorithmsConfigured,pendingRendering:false};}
       catch(error){check(signal);maximum=await context.maximum(entries,image.width,image.height,signal,scope);image.finalDisplay={kind:'corroboration',policy:{...BATCH_DISPLAY_POLICY},algorithmsConfigured,scopeFingerprint:scope.fingerprint,files:[],pendingRendering:false,status:'error',error:serializeEngineError(error,'BATCH_CORROBORATION_EXPORT')};}
      }else{
       maximum=await context.maximum(entries,image.width,image.height,signal,scope);
       if(scientificFiltering)image.finalDisplay={kind:'biomes',policy:{...BATCH_DISPLAY_POLICY},algorithmsConfigured,scopeFingerprint:scope.fingerprint,files:image.runs.find(r=>r.kind==='clones'&&r.files?.some(p=>p.endsWith('.png')))?.files?.filter(p=>p.endsWith('.png'))??[],pendingRendering:false};
      }
      image.score=imageScore(image.runs);image.score.clones=maximum;image.score.total=maximum+image.score.additional;
      if(image.finalDisplay?.error)image.score.incomplete=true;
      for(const run of image.runs)if(run.entries)run.entries=compactEvidence(run.entries);image.state='done';image.restored={configuration:structuredClone(model.configuration),engine:{...model.engine}};
     }catch(error){imageFailure=error;throw error;}finally{for(const retained of completed)if(!image.runs.some(r=>r.toolId===retained.toolId))image.runs.push(retained);image.runs.sort((a,b)=>unique.findIndex(r=>r.id===a.toolId)-unique.findIndex(r=>r.id===b.toolId));for(const run of image.runs)if(run.entries)run.entries=compactEvidence(run.entries);try{await retireEvidence(owned,imageFailure);}finally{if(image.state==='running'){image.state='incomplete';image.score={...imageScore(image.runs),incomplete:true};}}}
     event({phase:'image-done',image,index:index+1,total:selected.length});
    }
    if(options.compare)await comparisons(model,options,signal);
   }catch(error){failure=error;if(signal.aborted)model.cancelled=true;else throw error;}
   finally{try{
    model.finishedAt=new Date().toISOString();
    const closed=await Promise.allSettled([context,tool,automatic,composite].map(async owner=>await owner?.dispose()));
    context=null;tool=automatic=composite=null;automaticSourceBlob=null;controller=null;
    const cleanupErrors=closed.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(cleanupErrors.length){if(failure)failure.details={...failure.details,cleanupErrors:[...(failure.details?.cleanupErrors??[]),...cleanupErrors.map(error=>serializeEngineError(error,'BATCH_CLEANUP_ERROR'))]};else throw cleanupErrors[0];}
   }finally{runCompletion=null;finishRun();}}
   model.results=studyScores(model.studies,model.images,options);event({phase:'finished',model});return model;
  },
  async clear(){this.cancel();await Promise.all([runCompletion,pairCompletion]);}
 };
}
