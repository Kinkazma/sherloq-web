import {createToolClient} from './tool-client.js';
import {createAutomaticClient} from './automatic-client.js';
import {createCompositeClient} from './composite-client.js';
import {batchTask,recipeKey,imageScore,studyScores,catalogRecipe,batchCatalog,batchPairSelection,restoredBatchPair} from './batch-catalog.js';
import {serializeEngineError} from './unified-engine/src/errors.js';
import {evidenceContext,cloneEvidence,mapEvidence,regionEvidence,compactEvidence} from './batch-evidence.js';
import {nextFrame,safeName} from './batch-import.js';
import {detectedRectangles,sparseViewDefaults} from './sparse-controls.js';
import {neuralDisplays} from './neural-clone-ui.js';

const check=signal=>signal?.throwIfAborted();
const polygon=r=>[[r.x0,r.y0],[r.x1-1,r.y0],[r.x1-1,r.y1-1],[r.x0,r.y1-1]];
const dataBlob=value=>new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
export async function displayBlob(client,descriptor,signal){
 const canvas=new OffscreenCanvas(descriptor.width,descriptor.height),ctx=canvas.getContext('2d');
 try{for(let y=0;y<descriptor.height;y+=32){check(signal);const rows=Math.min(32,descriptor.height-y),pixels=await client.readWindow(descriptor,{x:0,y,width:descriptor.width,height:rows}),rgba=ctx.createImageData(pixels.width,pixels.height);for(let i=0;i<pixels.width*pixels.height;i++){rgba.data[i*4]=pixels.data[i*3];rgba.data[i*4+1]=pixels.data[i*3+1];rgba.data[i*4+2]=pixels.data[i*3+2];rgba.data[i*4+3]=255;}ctx.putImageData(rgba,0,y);await nextFrame();}return await canvas.convertToBlob({type:'image/png'});}finally{canvas.width=canvas.height=1;}
}
export function createBatchRunner({computeProfile='maximum',onProgress=()=>{},toolFactory=createToolClient,automaticFactory=createAutomaticClient}={}){
 let tool,automatic,composite,controller,pairController,context;
 async function put(artifacts,path,output){try{await artifacts.set(path,output.blob??output);return path;}finally{await output.cleanup?.();}}
 function event(value){onProgress(value);}
 const profile=()=>typeof computeProfile==='function'?computeProfile():computeProfile;
 async function getTool(){return tool??=await toolFactory({computeProfile:profile(),memoryBudgetBytes:4*1024**3,m2MemoryBudgetBytes:2*1024**3,onProgress:e=>event({phase:'kernel',detail:e})});}
 async function getAutomatic(){return automatic??=await automaticFactory({computeProfile:profile(),memoryBudgetBytes:4*1024**3,retainMasks:true,onProgress:e=>event({phase:'kernel',detail:e})});}
 async function detectedPair(image,owner,signal){
  if(owner.source?.id!==image.id)await owner.load({id:image.id,blob:image.blob});check(signal);
  image.panels??=await owner.detectSubimages();check(signal);
  const candidates=detectedRectangles(image.panels).filter(r=>!r.envelope);
  let selection=restoredBatchPair(image);
  if(!selection&&candidates.length===2){selection=image.pairSelection=batchPairSelection(image,candidates,'detected');image.pairCleared=false;}
  return {candidates,selection};
 }
 async function execute(image,recipe,artifacts,options,signal){
  check(signal);const path='resultats/'+image.id+'/'+safeName(recipe.id),run={toolId:recipe.id,title:recipe.fr,operation:recipe.operation,kind:recipe.kind,methodKey:recipeKey(recipe),params:structuredClone(recipe.params),signal:structuredClone(recipe.signal),status:'running',files:[]};image.runs.push(run);event({phase:'tool',image,recipe,run});let owner,entries;
  try{
   let output;
   if(recipe.kind==='automatic'){
    owner=await getAutomatic();await owner.load({id:image.id,blob:image.blob});
    const params={...recipe.params};if(!options.panels||!['microscopy','gel'].includes(image.family))params.selection={regions:[[[0,0],[image.width-1,0],[image.width-1,image.height-1],[0,image.height-1]]],envelope:[[0,0],[image.width-1,0],[image.width-1,image.height-1],[0,image.height-1]],disabled:[]};
    check(signal);output=await owner.run({id:'batch-'+crypto.randomUUID(),imageId:image.id,operation:recipe.operation,params,backend:recipe.backend??'auto'});
    const chunks=[];await owner.exportTo({async write(bytes){chunks.push(new Blob([bytes]));}});run.files.push(await put(artifacts,path+'.npz',new Blob(chunks,{type:'application/zip'})));
    const display=await owner.display('corroboration',{overlay:true});run.files.push(await put(artifacts,path+'.png',await displayBlob(owner,display,signal)));
    if(Object.values(output.data?.state?.states??{}).some(state=>['failed','paused','cancelled','unavailable'].includes(state)))run.partial=true;
   }else if(recipe.operation==='composite'){
    composite??=await createCompositeClient({computeProfile:profile(),memoryBudgetBytes:1024**3});const value=await composite.analyze(image.blob,recipe.params,{signal,onProgress:e=>event({phase:'kernel',detail:e}),backend:recipe.backend??'auto'});output={data:value.metadata,provenance:value.metadata.provenance};
    if(value.result.fields.map){const reader={async readWindow(display,rect){const frame=await composite.renderWindow(value.result.id,'map',rect);try{const data=new Uint8Array(frame.bytes);for(let at=0;at<data.length;at+=composite.ready.windowBytes)data.set(await composite.readExport(frame.id,at,Math.min(composite.ready.windowBytes,data.length-at)),at);return {width:frame.width,height:frame.height,data};}finally{await composite.releaseExport(frame.id);}}};run.files.push(await put(artifacts,path+'.png',await displayBlob(reader,value.result,signal)));}
    const chunks=[];await composite.exportTo(value.result.id,new WritableStream({write(bytes){chunks.push(new Blob([bytes]));}}),{signal});run.files.push(await put(artifacts,path+'.npz',new Blob(chunks)));await composite.release(value.result.id);
   }else{
    owner=await getTool();check(signal);if(owner.source?.id!==image.id)await owner.load({id:image.id,blob:image.blob});let regions=[];
    if(recipe.params.algorithm==='EfficientLoFTR'){
     let selection=restoredBatchPair(image);
     if(!selection){const detected=await detectedPair(image,owner,signal);selection=detected.selection;if(!selection)throw Object.assign(Error('EfficientLoFTR : choisissez exactement deux panneaux, ou saisissez deux rectangles dans Images.'),{code:'BATCH_PAIR_REQUIRED',details:{imageId:image.id,pixelHash:image.hash,candidateCount:detected.candidates.length,requiredRegions:2}});}
     image.pairSelection=selection;regions=selection.regions;run.pairSelection=structuredClone(selection);options.pairSelections[image.hash]=structuredClone(selection);
    }else if(options.panels&&['microscopy','gel'].includes(image.family)&&(recipe.kind==='clones')){
     image.panels??=await owner.detectSubimages();regions=detectedRectangles(image.panels);
    }
    if(recipe.params.algorithm?.endsWith('Panels + Text')&&!regions.length)regions=[{x0:0,y0:0,x1:image.width,y1:image.height}];
    if(recipe.requires==='median'&&options.median)await owner.loadModel('median',options.median);
    const task=batchTask(recipe,{id:'batch-'+crypto.randomUUID(),imageId:image.id,regions}),extras={file:image.blob,reference:options.reference,database:options.database};
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
   check(signal);run.provenance=compactEvidence(output.provenance);run.metrics=compactEvidence(output.metrics);
   if(run.files.some(p=>p.endsWith('.npz'))&&run.files.some(p=>p.endsWith('.json')))await put(artifacts,path+'.json',dataBlob({schema:'sherloq.batch-evidence/1',operation:recipe.operation,params:recipe.params,provenance:compactEvidence(output.provenance),metadata:compactEvidence(output.data),scientificArrays:path+'.npz'}));
   if(recipe.kind==='clones'||recipe.kind==='automatic'){entries=await cloneEvidence(output,recipe,owner,image,context,signal);run.entries=entries.entries;run.cloneMaximum=await context.maximum(entries.entries,image.width,image.height,signal);run.positive=run.cloneMaximum>0;if(recipe.operation==='analysis.complete'){const ela=(output.data?.entries??[]).filter(e=>e.source==='ELA biomes');if(ela.length){run.additionalMethods=['ela.biomes'];run.additionalEntries=compactEvidence(ela);run.positive=true;}}}
   else if(recipe.kind==='map')Object.assign(run,await mapEvidence(output,recipe,owner,image,signal));
   else if(['regions','ela'].includes(recipe.kind))Object.assign(run,regionEvidence(output,recipe));
   else run.positive=false;
   run.status=run.partial?'partial':'done';if(run.partial)run.error={code:'PARTIAL_ANALYSIS',message:'Certains détecteurs n’ont pas terminé. Les signaux des autres sont conservés.',groups:compactEvidence(output.data?.state)};
  }catch(error){run.status=signal.aborted?'cancelled':'error';run.error=serializeEngineError(error,'BATCH_TOOL_ERROR');run.inputRequired=error.code==='BATCH_PAIR_REQUIRED';if(!signal.aborted)try{run.files.push(await put(artifacts,path+'-error.json',dataBlob({schema:'sherloq.batch-error/1',imageId:image.id,toolId:recipe.id,error:run.error,params:run.params,pairSelection:run.pairSelection})));}catch(exportError){run.errorReportError=serializeEngineError(exportError,'BATCH_EXPORT_ERROR');}if(signal.aborted){entries?.release();if(run.entries)run.entries=compactEvidence(run.entries);}check(signal);}
  return {run,release:entries?.release??(()=>{})};
 }
 async function comparisons(model,options,signal){
  const selected=studyScores(model.studies,model.images,options).filter(s=>s.retained),ids=new Set(selected.map(s=>s.id));
  const images=model.images.filter(i=>i.selected&&i.state==='done'&&i.occurrences.some(o=>ids.has(o.studyId)));
  model.comparisons=[];const pairs=[];
  for(const image of images){const distinct=[...new Set(image.occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId))];if(distinct.length>1)model.comparisons.push({kind:'identical-pixels',images:[image.id,image.id],studies:distinct,hash:image.hash});}
  for(let a=0;a<images.length;a++)for(let b=a+1;b<images.length;b++){const left=new Set(images[a].occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId)),right=new Set(images[b].occurrences.filter(o=>ids.has(o.studyId)).map(o=>o.studyId));if([...left].some(x=>[...right].some(y=>x!==y)))pairs.push([images[a],images[b]]);}
  for(const [index,[left,right]]of pairs.entries()){
   check(signal);event({phase:'comparison',completed:index,total:pairs.length});let a,b;const c=new OffscreenCanvas(Math.max(left.width,right.width),left.height+right.height+32),ctx=c.getContext('2d');
   if(c.width*c.height>100000000){model.comparisons.push({images:[left.id,right.id],status:'error',message:'Paire supérieure à 100 MP ; aucune réduction.'});continue;}
   try{
    const client=await getTool(),bitmap=async image=>{try{return await createImageBitmap(image.blob);}catch(error){check(signal);const source=await client.load({id:image.id,blob:image.blob});return createImageBitmap(await displayBlob(client,source.surface,signal));}};
    a=await bitmap(left);b=await bitmap(right);check(signal);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(a,0,0);ctx.drawImage(b,0,left.height+32);const blob=await c.convertToBlob({type:'image/png'});await client.load({id:'cross-'+crypto.randomUUID(),blob});
    const recipe=catalogRecipe(batchCatalog.find(r=>r.params.algorithm==='SIFT + G2NN + RANSAC').id);recipe.params.autoRadius=false;recipe.params.independent=false;recipe.params.compare=true;recipe.params.radius=Math.hypot(c.width,c.height);recipe.params.regions=[polygon({x0:0,y0:0,x1:left.width,y1:left.height}),polygon({x0:0,y0:left.height+32,x1:right.width,y1:left.height+32+right.height})];
    check(signal);const output=await client.run({id:'cross-run-'+crypto.randomUUID(),imageId:client.source.id,operation:'tampering.copyMove.sparse',params:recipe.params,view:sparseViewDefaults(),backend:'auto'},{file:blob});
    const found=await cloneEvidence(output,{...recipe,kind:'clones'},client,{width:c.width,height:c.height},context,signal);
    try{if(found.entries.length){const path='comparaisons/'+index;await put(model.artifacts,path+'.json',await client.export('json'));await put(model.artifacts,path+'.png',await client.export('png',output.surface));model.comparisons.push({kind:'geometric-matches',images:[left.id,right.id],offset:[0,left.height+32],entries:compactEvidence(found.entries),files:[path+'.json',path+'.png'],params:recipe.params,status:'done'});}}finally{found.release();}
   }catch(error){check(signal);model.comparisons.push({images:[left.id,right.id],status:'error',message:error.message});}finally{a?.close();b?.close();c.width=c.height=1;}
  }
 }
 return {get running(){return !!controller||!!pairController;},cancel(){controller?.abort(Object.assign(Error('Traitement arrêté'),{code:'CANCELLED'}));pairController?.abort(Object.assign(Error('Préparation arrêtée'),{code:'CANCELLED'}));tool?.cancel();void automatic?.pause();},
  async preparePair(image){
   if(controller||pairController)throw Object.assign(Error('Lot déjà en cours.'),{code:'BUSY'});pairController=new AbortController();
   let failure;try{return await detectedPair(image,await getTool(),pairController.signal);}catch(error){failure=error;throw error;}finally{pairController=null;const previous=tool;tool=null;try{await previous?.dispose();}catch(error){if(failure)failure.cleanupError=serializeEngineError(error);else throw error;}}
  },
  async run(model,recipes,options={}){
   if(controller||pairController)throw Error('Lot déjà en cours.');controller=new AbortController();const signal=controller.signal;let failure;
   try{
   context=evidenceContext();const selected=model.images.filter(i=>i.selected),unique=[...new Map(recipes.map(r=>[recipeKey(r),r])).values()];
   const deployment=await fetch(new URL('./integrated-config.json',import.meta.url)).then(response=>{if(!response.ok)throw Error('Configuration du moteur indisponible.');return response.json();});model.engine={version:deployment.engineVersion,commit:deployment.engineCommit,increment:deployment.runtimeSourceIncrementSha256,batch:'0.2.0',memoryBudgetBytes:4*1024**3,m2MemoryBudgetBytes:2*1024**3};
   for(const path of [...model.artifacts.keys()])if(path.startsWith('comparaisons/')){await model.artifacts.delete(path);}model.comparisons=[];
   options={...options,pairSelections:{}};if(unique.some(r=>r.params.algorithm==='EfficientLoFTR'))for(const image of selected){try{const selection=restoredBatchPair(image);if(selection)options.pairSelections[image.hash]=selection;}catch{/* Invalid input remains a documented per-tool failure. */}}
   model.configuration={options:{threshold:options.threshold??1,basis:options.basis??'clones',compare:!!options.compare,panels:!!options.panels},pairSelections:options.pairSelections,recipes:unique.map(r=>({id:r.id,operation:r.operation,params:r.params,signal:r.signal,backend:r.backend??'auto'}))};model.startedAt=new Date().toISOString();model.cancelled=false;
    for(const [index,image]of selected.entries()){
     check(signal);event({phase:'image-start',image,index,total:selected.length});
     const signature=c=>{const pair=c?.pairSelections?.[image.hash];return JSON.stringify([(c?.recipes??[]).map(r=>[r.operation,r.params,r.signal,r.backend??'auto']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),c?.options?.panels,pair?[pair.pixelHash,pair.width,pair.height,pair.regions]:null]);};
     if(options.reuse&&image.state==='done'&&!image.score?.incomplete&&image.restored&&JSON.stringify(image.restored.engine)===JSON.stringify(model.engine)&&signature(image.restored.configuration)===signature(model.configuration)){image.reused=true;event({phase:'image-done',image,index:index+1,total:selected.length,reused:true});continue;}
     if(image.runs?.length){const previous={at:new Date().toISOString(),engine:image.restored?.engine,runs:compactEvidence(image.runs),score:structuredClone(image.score??null)},prefix='historique/'+crypto.randomUUID()+'/';for(const run of previous.runs)for(let i=0;i<(run.files??[]).length;i++){check(signal);const path=run.files[i],blob=await model.artifacts.get(path);if(blob){await model.artifacts.set(prefix+path,blob);run.files[i]=prefix+path;}}(image.history??=[]).push(previous);}
     for(const path of [...model.artifacts.keys()])if(path.startsWith('resultats/'+image.id+'/')){await model.artifacts.delete(path);}
     image.reused=false;image.runs=[];image.state='running';const owned=[];
     try{for(const recipe of unique){check(signal);owned.push(await execute(image,recipe,model.artifacts,options,signal));await nextFrame();}
      const entries=image.runs.flatMap(r=>['done','partial'].includes(r.status)?r.entries??[]:[]),maximum=await context.maximum(entries,image.width,image.height,signal);
      image.score=imageScore(image.runs);image.score.clones=maximum;image.score.total=maximum+image.score.additional;
      for(const run of image.runs)if(run.entries)run.entries=compactEvidence(run.entries);image.state='done';image.restored={configuration:structuredClone(model.configuration),engine:{...model.engine}};
     }finally{for(const run of image.runs)if(run.entries)run.entries=compactEvidence(run.entries);for(const value of owned)value.release();if(image.state==='running'){image.state='incomplete';image.score={...imageScore(image.runs),incomplete:true};}}
     event({phase:'image-done',image,index:index+1,total:selected.length});
    }
    if(options.compare)await comparisons(model,options,signal);
   }catch(error){failure=error;if(signal.aborted)model.cancelled=true;else throw error;}
   finally{
    model.finishedAt=new Date().toISOString();
    const closed=await Promise.allSettled([context,tool,automatic,composite].map(async owner=>await owner?.dispose()));
    context=null;tool=automatic=composite=null;controller=null;
    const cleanupErrors=closed.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(cleanupErrors.length){if(failure)failure.details={...failure.details,cleanupErrors:[...(failure.details?.cleanupErrors??[]),...cleanupErrors.map(error=>serializeEngineError(error,'BATCH_CLEANUP_ERROR'))]};else throw cleanupErrors[0];}
   }
   model.results=studyScores(model.studies,model.images,options);event({phase:'finished',model});return model;
  },
  async clear(){this.cancel();}
 };
}
