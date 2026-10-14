import {readBatchZip} from './batch-zip.js?v=0.20.0';
import {createBatchArtifactStore} from './batch-artifacts.js?v=0.20.0';
import {pdfTextPolygons,projectPdfExclusions} from './batch-scope-geometry.js?v=0.20.0';
import {batchArtifactOwners,restoredArtifactPaths} from './batch-restoration.js?v=0.20.0';
import {remapBatchEvidence,remapBatchFilePointers} from './batch-archive-layout.js?v=0.20.0';
import {batchPairSelection} from './batch-catalog.js?v=0.20.0';
import {serializeEngineError} from './unified-engine/src/errors.js';
import {validateBatchImageExport} from './batch-image-export.js?v=0.20.0';
import {validateBatchDisplayPreferences} from './batch-result-display.js?v=0.20.0';
const MiB=1024**2;
export const IMPORT_LIMITS={fileBytes:256*MiB,expandedBytes:1024*MiB,entries:2000,pixels:100000000};
const imagePattern=/\.(?:png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif|jp2|j2k|jxl|psd)$/i;
let libraries;
export async function batchLibraries(){
 return libraries??=Promise.all([import('./batch-vendor/pdf.mjs'),import('./batch-vendor/pdf-lib.js'),import('./batch-vendor/jszip.js')]).then(([pdfjs,pdf])=>{pdfjs.GlobalWorkerOptions.workerSrc=new URL('./batch-vendor/pdf.worker.mjs',import.meta.url).href;return {pdfjs,pdf,JSZip:globalThis.JSZip};});
}
const check=signal=>signal?.throwIfAborted();
export const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
export const safeName=name=>{const value=String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,140)||'document';return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)?'_'+value:value;};
async function nativeIdentity(blob,signal){
 const {createToolClient}=await import('./tool-client.js?v=0.20.0'),client=await createToolClient({memoryBudgetBytes:4*1024**3}),cancel=()=>client.cancel();signal?.addEventListener('abort',cancel,{once:true});
 try{
  check(signal);const source=await client.load({id:'batch-decode-'+crypto.randomUUID(),blob}),surface=source.surface,{width,height}=surface;if(width*height>IMPORT_LIMITS.pixels)throw Error('Image supérieure à 100 MP : aucune réduction automatique.');
  const {createSHA256}=await import('./unified-engine/vendor/hash-wasm/hashes.js'),hash=await createSHA256();hash.init();hash.update(new TextEncoder().encode(width+'x'+height+' rgba8\n'));
  for(let y=0;y<height;y+=32){check(signal);const rows=Math.min(32,height-y),frame=await client.readWindow(surface,{x:0,y,width,height:rows}),rgba=new Uint8Array(width*rows*4);for(let i=0;i<width*rows;i++){rgba[i*4]=frame.data[i*3];rgba[i*4+1]=frame.data[i*3+1];rgba[i*4+2]=frame.data[i*3+2];rgba[i*4+3]=255;}hash.update(rgba);await nextFrame();}
  const step=Math.max(1,Math.ceil(Math.max(width/260,height/180))),frame=await client.readTile(surface,{x:0,y:0,w:width,h:height,step}),canvas=new OffscreenCanvas(frame.width,frame.height),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(frame.width,frame.height);for(let i=0;i<frame.width*frame.height;i++){pixels.data[i*4]=frame.data[i*3];pixels.data[i*4+1]=frame.data[i*3+1];pixels.data[i*4+2]=frame.data[i*3+2];pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);return {hash:hash.digest('hex'),width,height,thumbnail:await canvas.convertToBlob({type:'image/webp',quality:.8}),decoder:source.provenance};
 }finally{signal?.removeEventListener('abort',cancel);await client.dispose();}
}
export async function pixelIdentity(blob,{signal}={}){
 check(signal);let bitmap;try{bitmap=await createImageBitmap(blob);}catch(error){check(signal);return nativeIdentity(blob,signal);}
 try{
  const {width,height}=bitmap;if(width*height>IMPORT_LIMITS.pixels)throw Error('Image supérieure à 100 MP : aucune réduction automatique.');
  const canvas=new OffscreenCanvas(width,Math.min(height,64)),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const {createSHA256}=await import('./unified-engine/vendor/hash-wasm/hashes.js');const hash=await createSHA256();hash.init();hash.update(new TextEncoder().encode(width+'x'+height+' rgba8\n'));
  for(let y=0;y<height;y+=64){check(signal);const rows=Math.min(64,height-y);ctx.clearRect(0,0,width,64);ctx.drawImage(bitmap,0,y,width,rows,0,0,width,rows);hash.update(new Uint8Array(ctx.getImageData(0,0,width,rows).data.buffer));await nextFrame();}
  const thumb=new OffscreenCanvas(Math.max(1,Math.round(width*Math.min(1,260/width,180/height))),Math.max(1,Math.round(height*Math.min(1,260/width,180/height))));thumb.getContext('2d').drawImage(bitmap,0,0,thumb.width,thumb.height);
  return {hash:hash.digest('hex'),width,height,thumbnail:await thumb.convertToBlob({type:'image/webp',quality:.8})};
 }finally{bitmap.close();}
}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export const pdfPoint=(matrix,x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
function ascii85(bytes){
 const text=new TextDecoder().decode(bytes).replace(/\s/g,'').replace(/^<~/,'').replace(/~>.*$/,''),out=[];let group=[];
 const flush=partial=>{const length=group.length;while(group.length<5)group.push(84);let n=0;for(const digit of group)n=n*85+digit;const values=[Math.floor(n/16777216)%256,Math.floor(n/65536)%256,Math.floor(n/256)%256,n%256];out.push(...values.slice(0,partial?length-1:4));group=[];};
 for(const c of text){if(c==='z'&&!group.length){out.push(0,0,0,0);continue;}const digit=c.charCodeAt(0)-33;if(digit<0||digit>84)throw Error('ASCII85 invalide');group.push(digit);if(group.length===5)flush(false);}if(group.length>1)flush(true);return Uint8Array.from(out);
}
function pdfPixels(image){
 if(image.bitmap){const c=new OffscreenCanvas(image.width,image.height);c.getContext('2d').drawImage(image.bitmap,0,0);return c;}
 const {width,height,data,kind}=image;if(width*height>IMPORT_LIMITS.pixels)throw Error('Image PDF supérieure à 100 MP.');
 const c=new OffscreenCanvas(width,height),ctx=c.getContext('2d'),out=ctx.createImageData(width,height);
 if(kind===3)out.data.set(data);
 else if(kind===2){for(let i=0;i<width*height;i++){out.data[i*4]=data[i*3];out.data[i*4+1]=data[i*3+1];out.data[i*4+2]=data[i*3+2];out.data[i*4+3]=255;}}
 else if(kind===1){const rowBytes=Math.ceil(width/8);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=(data[y*rowBytes+(x>>3)]>>(7-(x&7)))&1?255:0;out.data.set([v,v,v,255],(y*width+x)*4);}}
 else throw Error('Format de pixels PDF non reconnu.');ctx.putImageData(out,0,0);return c;
}
export async function createBatchImporter({onProgress=()=>{},limits=IMPORT_LIMITS,identify=pixelIdentity,artifactStoreFactory=createBatchArtifactStore,libraryLoader=batchLibraries}={}){
 const studies=[],images=[],archivedComparisons=[],importedBatchContexts=[],byHash=new Map(),errors=[],artifacts=await artifactStoreFactory(),restoredImages=new WeakMap();let total=0,filesCount=0,retainedBytes=0,imageExportSettings,globalContextRestored=false;
 const contextFields=['engine','configuration','startedAt','finishedAt','cancelled','resumeEvents','resumePlan','excludedFeatures'];
 function excludedFeatures(value){
  if(!Array.isArray(value)||value.length>limits.entries)throw Error('Fonctions non exécutées archivées invalides.');
  const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(value);
  for(const record of value)if(!record||typeof record!=='object'||Array.isArray(record)||!identifier(record.id)||!identifier(record.operation)||record.state!=='feature-uninstalled'||record.scientificResult!==false||record.title!==undefined&&(typeof record.title!=='string'||record.title.length>1000)||record.context!==undefined&&record.context!=='automatic')throw Error('Une fonction non exécutée archivée est invalide ; elle ne constitue pas un résultat scientifique.');
  return structuredClone(value);
 }
 function validateAutomaticExclusions(params){
  const value=params?.excludedFeatures;if(value===undefined)return;
  if(!Array.isArray(value)||value.length>limits.entries||!value.every(id=>typeof id==='string'&&['ai.clones.d2prl','m2.forgeryscope'].includes(id)))throw Error('Identifiants de fonctions automatiques non exécutées archivés invalides.');
  // Keep the archived order and duplicates: these are frozen request inputs.
  // The automatic engine owns the Set/sort normalization for its native plan.
 }
 function contextValue(value){
  const excluded=value.excludedFeatures===undefined?undefined:excludedFeatures(value.excludedFeatures);
  if(Array.isArray(value.configuration?.recipes))for(const recipe of value.configuration.recipes)validateAutomaticExclusions(recipe?.params);
  return Object.fromEntries(contextFields.filter(key=>value[key]!==undefined&&(key==='excludedFeatures'||(['engine','configuration','resumePlan'].includes(key)?value[key]&&typeof value[key]==='object'&&!Array.isArray(value[key]):key==='cancelled'?typeof value[key]==='boolean':key==='resumeEvents'?Array.isArray(value[key]):typeof value[key]==='string'))).map(key=>[key,key==='excludedFeatures'?excluded:structuredClone(value[key])]));
 }
 function restoreContext(manifest,sourceArchive){
  const global=contextValue(manifest);
  const incoming=Array.isArray(manifest.importedBatchContexts)?manifest.importedBatchContexts:[];
  if(incoming.length>limits.entries)throw Error('Trop de contextes scientifiques archivés.');
  // Validate every scientific context before admitting any source or result.
  // An invalid absence record must never silently become a detector finding.
  for(const record of incoming)if(record&&typeof record==='object')contextValue(record);
  for(const image of manifest.images)for(const attempt of [image,...(Array.isArray(image.history)?image.history:[])])if(attempt&&typeof attempt==='object'){
   contextValue(attempt);if(Array.isArray(attempt.runs))for(const run of attempt.runs){validateAutomaticExclusions(run?.params);validateAutomaticExclusions(run?.effectiveParams);}
  }
  if(manifest.mixedImportedContexts===true)model.mixedImportedContexts=true;
  if(!globalContextRestored){Object.assign(model,global);globalContextRestored=true;}
  else if(JSON.stringify([model.engine,model.configuration,model.excludedFeatures])!==JSON.stringify([global.engine,global.configuration,global.excludedFeatures]))model.mixedImportedContexts=true;
  for(const record of incoming)if(record&&typeof record.id==='string'&&/^[a-z0-9-]{1,96}$/i.test(record.id)&&!importedBatchContexts.some(context=>context.id===record.id))importedBatchContexts.push({id:record.id,sourceArchive:record.sourceArchive??sourceArchive,...contextValue(record.usesGlobalContext===true?manifest:record)});
  const signature=JSON.stringify(global),prior=importedBatchContexts.find(context=>JSON.stringify(contextValue(context))===signature);
  if(prior)return prior.id;const id='import-'+crypto.randomUUID();importedBatchContexts.push({id,sourceArchive,...global});return id;
 }
 function historicalContext(attempt,archiveContextId){
  if(importedBatchContexts.some(context=>context.id===attempt.importedContextId))return attempt.importedContextId;
  const value=contextValue(attempt);if(value.engine===undefined&&value.configuration===undefined)return undefined;
  const signature=JSON.stringify(value),prior=importedBatchContexts.find(context=>JSON.stringify(contextValue(context))===signature);if(prior)return prior.id;
  const id='import-'+crypto.randomUUID(),parent=importedBatchContexts.find(context=>context.id===archiveContextId);importedBatchContexts.push({id,sourceArchive:parent?.sourceArchive,...value});return id;
 }
 function admit(bytes){total+=bytes;if(total>limits.expandedBytes)throw Error('Le lot dépasse 1 Gio de fichiers décompressés. Fractionnez le lot.');}
 async function addImage(blob,occurrence,{name,encoding='original',identity}={},signal){
  check(signal);const info=identity??await identify(blob,{signal});let image=byHash.get(info.hash);
  if(!image){if(images.length>=limits.entries||retainedBytes+blob.size+info.thumbnail.size>limits.expandedBytes)throw Error('Trop d’images extraites pour ce lot. Fractionnez les documents.');retainedBytes+=blob.size+info.thumbnail.size;image={id:'image-'+info.hash.slice(0,24),hash:info.hash,name:safeName(name??'image.png'),blob,thumbnail:info.thumbnail,width:info.width,height:info.height,encoding,selected:true,family:'unknown',occurrences:[],runs:[],state:'ready'};byHash.set(info.hash,image);images.push(image);}
  image.occurrences.push(occurrence);onProgress({phase:'image',images:images.length,occurrences:images.reduce((n,i)=>n+i.occurrences.length,0)});return image;
 }
 async function restoreImage(image,old,manifest,zip,signal,owners,studyRemap,importedContextId){
  image.importedContextId=old.importedContextId??importedContextId;
  if(old.displayPreferences)try{image.displayPreferences=validateBatchDisplayPreferences(old.displayPreferences);}catch{}
  if(old.archiveSourceConversion&&old.archiveSourceConversion.scientificSourceCompatible!==true){
   const seen=restoredImages.get(image)??new Set();if(seen.has(old))return;seen.add(old);restoredImages.set(image,seen);image.history??=[];
   const remapOccurrences=occurrences=>(occurrences??[]).map(occurrence=>({...structuredClone(occurrence),studyId:studyRemap?.get(occurrence.studyId)??occurrence.studyId,originalStudyId:occurrence.originalStudyId??occurrence.studyId})),sourceIdentity={id:old.id,pixelHash:old.hash,width:old.width,height:old.height,encodedSha256:old.sourceSha256??old.archiveSourceConversion.originalSha256,name:old.originalName??old.name,occurrences:remapOccurrences(old.occurrences)},rawConversion=structuredClone(old.archiveSourceConversion),{files:conversionFiles,...conversionFields}=rawConversion,conversion={...conversionFields,originalArchivePath:conversionFiles?.visual,sourceFileEmbedded:false};
   for(const [index,attempt]of [old,...(Array.isArray(old.history)?old.history:[])].entries()){
    if(!Array.isArray(attempt?.runs)||!attempt.runs.length&&!attempt.finalDisplay&&!attempt.resultDisplay)continue;
    const prefix='historique/source-convertie-'+index+'/resultats/'+image.id,paths=restoredArtifactPaths({id:old.id,runs:attempt.runs,finalDisplay:attempt.finalDisplay,resultDisplay:attempt.resultDisplay},manifest,owners,()=>true,{prefix});if(!paths)continue;
    for(const [path,target]of paths){const entry=zip.file(path);if(entry&&!artifacts.has(target)){check(signal);await artifacts.set(target,await remapBatchEvidence(await entry.async('blob'),path,paths));}}
    const archived=remapBatchFilePointers({runs:attempt.runs,score:attempt.score,finalDisplay:attempt.finalDisplay,resultDisplay:attempt.resultDisplay,displayPreferences:attempt.displayPreferences??old.displayPreferences,preparation:attempt.preparation??(index===0?old.preparation:undefined),...(attempt.engine?{engine:attempt.engine}:index===0?{engine:manifest.engine}:{}),...(attempt.configuration?{configuration:attempt.configuration}:{}),importedContextId:index===0?old.importedContextId??importedContextId:historicalContext(attempt,importedContextId),archiveContextId:importedContextId,...(attempt.at?{at:attempt.at}:{})},paths);
    const original=attempt.sourceIdentity?{...structuredClone(attempt.sourceIdentity),occurrences:remapOccurrences(attempt.sourceIdentity.occurrences)}:sourceIdentity;
    image.history.push({...structuredClone(archived),sourceIdentity:original,sourceConversion:structuredClone(attempt.sourceConversion??conversion),scientificallyReusable:false,restoredDiagnostics:true});
   }
   image.archiveDiagnostics={schema:'sherloq.batch-converted-source/1',original:sourceIdentity,conversion,message:'Les fichiers source ont été convertis pour cet export. Les analyses de l’original sont conservées dans l’historique ; elles ne sont pas réutilisées pour analyser la source convertie.'};return;
  }
  if(old.id!==image.id||old.hash!==image.hash||old.width!==image.width||old.height!==image.height)return;
  const seen=restoredImages.get(image)??new Set();if(seen.has(old))return;seen.add(old);restoredImages.set(image,seen);
  const flatPaths=new Map();
  if(manifest.archiveLayout==='flat/1'){
   const convert=(attempt,prefix)=>{
    if(!Array.isArray(attempt?.runs))return attempt;
    const paths=restoredArtifactPaths({id:old.id,runs:attempt.runs,finalDisplay:attempt.finalDisplay,resultDisplay:attempt.resultDisplay},manifest,owners,()=>true,{prefix});
    if(!paths||[...paths].some(([path,target])=>flatPaths.has(path)&&flatPaths.get(path)!==target))return {...attempt,runs:null,finalDisplay:undefined,resultDisplay:undefined};
    for(const [path,target]of paths)flatPaths.set(path,target);return remapBatchFilePointers(attempt,paths);
   };
   const current=convert({runs:old.runs,finalDisplay:old.finalDisplay,resultDisplay:old.resultDisplay},'resultats/'+image.id);
   old={...old,...current,history:Array.isArray(old.history)?old.history.map((attempt,index)=>convert(attempt,'historique/restored-'+index+'/resultats/'+image.id)):[]};
  }
  if(old.pairCleared)image.pairCleared=true;
  else{const selection=old.pairSelection??manifest.configuration?.pairSelections?.[image.hash];if(selection)try{
   if(selection.pixelHash!==image.hash||selection.width!==image.width||selection.height!==image.height)throw Object.assign(Error('La paire archivée appartient à une autre image.'),{code:'BATCH_PAIR_REQUIRED'});
   image.pairSelection=batchPairSelection(image,selection.regions,selection.source);image.pairCleared=false;
  }catch(error){image.pairError=serializeEngineError(error,'BATCH_PAIR_REQUIRED');}}
  const permitted=path=>typeof path==='string'&&path.split('/').every(p=>p&&p!=='.'&&p!=='..')&&(path.startsWith('resultats/'+image.id+'/')||/^historique\/[^/]+\/resultats\//.test(path)&&path.split('/')[3]===image.id);
  const validRuns=runs=>Array.isArray(runs)&&runs.length<=100&&runs.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.title==='string'&&['done','partial','error','cancelled','running'].includes(r.status)&&Array.isArray(r.files)&&r.files.every(permitted));
  const validDisplay=display=>display==null||display&&typeof display==='object'&&!Array.isArray(display)&&['biomes','corroboration'].includes(display.kind)&&Array.isArray(display.files)&&display.files.every(permitted);
  const validResultDisplay=display=>display?.schema==='sherloq.batch-result-display/1'&&['biomes','corroboration'].includes(display.mode)&&Number.isFinite(display.opacity)&&display.opacity>=0&&display.opacity<=1&&Array.isArray(display.files)&&display.files.every(permitted);
  const requiredRecords=attempt=>[...(attempt.runs??[]),...(validDisplay(attempt.finalDisplay)&&attempt.finalDisplay?[attempt.finalDisplay]:[])];
  const records=attempt=>[...requiredRecords(attempt),...(validResultDisplay(attempt.resultDisplay)?[attempt.resultDisplay]:[])];
  if(manifest.archiveLayout!=='flat/1')for(const attempt of [old,...(Array.isArray(old.history)?old.history:[])])if(validRuns(attempt?.runs))for(const record of records(attempt))for(const path of record.files)flatPaths.set(path,path);
  const diagnosticRuns=runs=>structuredClone(runs).map(r=>r.status==='running'?{...r,archivedStatus:'running',status:'partial',error:r.error??{code:'INTERRUPTED_ARCHIVE',message:'Ce calcul était actif lors de l’export ; il n’est pas en cours dans cette session.'}}:r);
  const archives=new Map([...flatPaths].map(([a,b])=>[b,a])),entry=path=>zip.file(archives.get(path)??path);
  const restoreFiles=async runs=>{for(const path of runs.flatMap(r=>r.files))if(entry(path)&&!artifacts.has(path)){check(signal);const archivePath=archives.get(path)??path;await artifacts.set(path,await remapBatchEvidence(await entry(path).async('blob'),archivePath,flatPaths));}};
  const history=(old.history??[]);if(Array.isArray(history)&&history.length<=1000){image.history??=[];for(const attempt of history)if(attempt&&validRuns(attempt.runs)){const repaired=remapBatchFilePointers(attempt,flatPaths,{contextPath:attempt.finalDisplay?.files?.[0]??attempt.runs[0]?.files?.[0]});await restoreFiles(records(repaired));image.history.push({...structuredClone(repaired),importedContextId:historicalContext(attempt,importedContextId),archiveContextId:importedContextId,runs:diagnosticRuns(repaired.runs),...(validDisplay(repaired.finalDisplay)?{}:{finalDisplay:null,restoredDiagnostics:true})});}}
  if(!validRuns(old.runs))return;
  // Preparation is also useful in an exported selection that has not run yet.
  // The preparation service rechecks the source, models and exact geometry
  // before it can reuse an archived human correction.
  if(old.preparation&&typeof old.preparation==='object'&&!Array.isArray(old.preparation))image.preparation=structuredClone(old.preparation);
  // An interrupted archive carries the same frozen context as a completed
  // image. The runner independently verifies encoded SHA and scientific keys
  // before it reuses any method; converted sources return above this point.
  if(old.resumeState?.schema==='sherloq.batch-run-resume/1')image.resumeState=structuredClone(old.resumeState);
  if(typeof old.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(old.sourceSha256))image.sourceSha256=old.sourceSha256;
  await restoreFiles(records(old));if(validDisplay(old.finalDisplay)&&old.finalDisplay)image.finalDisplay=structuredClone(old.finalDisplay);if(validResultDisplay(old.resultDisplay)&&old.resultDisplay.files.every(path=>entry(path)))image.resultDisplay=structuredClone(old.resultDisplay);
  const scoreValid=old.score&&['clones','additional','total'].every(k=>Number.isSafeInteger(old.score[k])&&old.score[k]>=0&&old.score[k]<=128);
  if(old.state==='done'&&old.runs.every(r=>r.status==='done')&&scoreValid&&validDisplay(old.finalDisplay)&&requiredRecords(old).flatMap(r=>r.files).every(path=>entry(path))&&!old.finalDisplay?.pendingRendering&&!old.finalDisplay?.error){image.runs=structuredClone(old.runs);image.score=structuredClone(old.score);image.state='done';image.restored={configuration:manifest.configuration,engine:manifest.engine};if(old.preparation)image.preparation=structuredClone(old.preparation);if(typeof old.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(old.sourceSha256))image.sourceSha256=old.sourceSha256;}
  else if(old.runs.length){image.runs=diagnosticRuns(old.runs);image.state='incomplete';image.score={...(scoreValid?structuredClone(old.score):{clones:0,additional:0,total:0}),incomplete:true};if(image.resumeState)image.restored={configuration:manifest.configuration,engine:manifest.engine};image.restoredDiagnostics=true;}
 }
 async function restoreArchivedComparisons(manifest,zip,signal,studyRemap,importedContextId){
  const existing=Array.isArray(manifest.archivedComparisons)?manifest.archivedComparisons:[],current=Array.isArray(manifest.comparisons)?manifest.comparisons:[],pairs=[...current,...existing];if(pairs.length>limits.entries)throw Error('Trop de comparaisons archivées.');
  const sourceById=new Map(manifest.images.map(image=>[image.id,image])),safe=path=>typeof path==='string'&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.includes('\\'))&&(manifest.archiveLayout==='flat/1'?/^resultats\/(?:images|donnees)\/[^/]+\.(?:png|jpe?g|webp|avif|tiff?|heic|json|npz)$/i.test(path):path.startsWith('comparaisons/')||path.startsWith('historique/'));
  for(const pair of pairs){
   if(!pair||typeof pair!=='object'||!Array.isArray(pair.files)||pair.files.length>limits.entries||!pair.files.every(safe))continue;
   const active=current.includes(pair)&&pair.status==='done'&&typeof pair.resumeKey==='string'&&pair.resumeKey.length<=8192&&Array.isArray(pair.images)&&pair.images.length===2&&pair.images.every(id=>{const archived=sourceById.get(id),image=images.find(i=>i.id===id);return image&&archived&&archived.archiveSourceConversion?.scientificSourceCompatible===true&&archived.hash===image.hash&&archived.width===image.width&&archived.height===image.height&&archived.sourceSha256===image.sourceSha256&&image.resumeState?.sourceSha256===image.sourceSha256;})&&pair.files.every(path=>!!zip.file(path));
   if(active){const paths=new Map(pair.files.map((path,index)=>[path,'comparaisons/reprise-'+crypto.randomUUID()+'-'+index+path.slice(path.lastIndexOf('.'))]));for(const [path,target]of paths){check(signal);await artifacts.set(target,await remapBatchEvidence(await zip.file(path).async('blob'),path,paths));}(model.comparisons??=[]).push({...structuredClone(remapBatchFilePointers(pair,paths)),restored:true});continue;}
   const prefix='comparaisons/archive-'+crypto.randomUUID()+'/',paths=new Map([...new Set(pair.files)].map((path,index)=>[path,prefix+'resultat-'+index+path.slice(path.lastIndexOf('.'))]));let incomplete=false;
   for(const [path,target]of paths){check(signal);const entry=zip.file(path);if(!entry){incomplete=true;continue;}await artifacts.set(target,await remapBatchEvidence(await entry.async('blob'),path,paths));}
   const sourceIdentities=(Array.isArray(pair.sourceIdentities)?pair.sourceIdentities:(pair.images??[]).map(id=>{const image=sourceById.get(id);return {id,name:image?.originalName??image?.name,pixelHash:image?.hash,width:image?.width,height:image?.height,encodedSha256:image?.sourceSha256??image?.archiveSourceConversion?.originalSha256,occurrences:image?.occurrences??[]};})).map(source=>({...structuredClone(source),occurrences:(source.occurrences??[]).map(occurrence=>({...structuredClone(occurrence),studyId:studyRemap.get(occurrence.studyId)??occurrence.studyId,originalStudyId:occurrence.originalStudyId??occurrence.studyId}))}));
   archivedComparisons.push({...structuredClone(remapBatchFilePointers(pair,paths)),importedContextId:pair.importedContextId??importedContextId,sourceIdentities,archived:true,scientificallyReusable:false,restoredDiagnostics:true,...(incomplete?{incomplete:true}:{}),archiveReason:'Comparaison de sources originales conservée pour inspection ; aucune réutilisation comme comparaison des pixels courants.'});
  }
 }
 async function extractPdf(blob,name,signal){
  const {pdfjs,pdf}=await libraryLoader(),study={id:'study-'+crypto.randomUUID(),name:safeName(name),blob,kind:'pdf',manualMarked:/^(?:A_VERIFIER|\[?SUSPECT|★)/i.test(name),errors:[]};studies.push(study);
  const originalJpegs=new Map(),extracted=new WeakMap();let parser;
  try{
   // Preserve DCT streams only when the browser's decoded pixels match PDF.js.
   const source=await pdf.PDFDocument.load(await blob.arrayBuffer(),{ignoreEncryption:false,updateMetadata:false});
   for(const [,object]of source.context.enumerateIndirectObjects()){
    if(!(object instanceof pdf.PDFRawStream))continue;const d=object.dict,sub=d.get(pdf.PDFName.of('Subtype')),filter=d.get(pdf.PDFName.of('Filter'));
    const filters=filter instanceof pdf.PDFArray?filter.asArray().map(String):[String(filter)];
    if(String(sub)!=='/Image'||filters.at(-1)!=='/DCTDecode'||filters.slice(0,-1).some(f=>!['/ASCII85Decode','/ASCIIHexDecode'].includes(f))||d.has(pdf.PDFName.of('SMask'))||d.has(pdf.PDFName.of('Mask'))||d.has(pdf.PDFName.of('Decode')))continue;
    try{let bytes=object.getContents();for(const f of filters.slice(0,-1)){if(f==='/ASCII85Decode')bytes=ascii85(bytes);else{let hex=new TextDecoder().decode(bytes).replace(/\s|>/g,'');if(hex.length%2)hex+='0';bytes=Uint8Array.from(hex.match(/../g),s=>parseInt(s,16));}}const native=new Blob([bytes],{type:'image/jpeg'}),identity=await pixelIdentity(native,{signal});originalJpegs.set(identity.hash,{blob:native,identity});}catch(error){check(signal);}
   }
   parser=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWasm:false,useSystemFonts:true,disableFontFace:true,stopAtErrors:true,maxImageSize:limits.pixels});
   const doc=await parser.promise;study.pages=doc.numPages;
   for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
    check(signal);onProgress({phase:'pdf',name:study.name,page:pageNumber,pages:doc.numPages});const page=await doc.getPage(pageNumber),list=await page.getOperatorList(),textPolygons=pdfTextPolygons(await page.getTextContent()),stack=[];let matrix=[1,0,0,1,0,0];const OPS=pdfjs.OPS;
    (study.pageText??=[]).push({page:pageNumber,polygons:textPolygons,source:'pdf-native-text',coordinates:'pdf-points'});
    const occurrence=(at,index,width,height)=>({studyId:study.id,page:pageNumber,matrix:at.slice(),operator:index,textExclusions:projectPdfExclusions(textPolygons,at,width,height)});
    const record=async(image,at,index)=>{
     if(!image?.width||!image?.height||image.width<8||image.height<8)return;
     const cached=extracted.get(image);if(cached){await addImage(cached.blob,occurrence(at,index,cached.identity.width,cached.identity.height),cached,signal);return;}
     const c=pdfPixels(image);let encoded=await c.convertToBlob({type:'image/png'});c.width=c.height=1;
     const identity=await pixelIdentity(encoded,{signal}),native=originalJpegs.get(identity.hash);if(native)encoded=native.blob;
     const record={blob:encoded,identity,name:study.name.replace(/\.pdf$/i,'')+'-p'+pageNumber+'-'+index+(native?'.jpg':'.png'),encoding:native?'embedded-jpeg':'pdf-decoded-png'};extracted.set(image,record);
     await addImage(encoded,occurrence(at,index,identity.width,identity.height),record,signal);
    };
    for(let i=0;i<list.fnArray.length;i++){
     check(signal);const op=list.fnArray[i],args=list.argsArray[i];
     if(op===OPS.save)stack.push(matrix.slice());else if(op===OPS.restore)matrix=stack.pop()??[1,0,0,1,0,0];
     else if(op===OPS.transform)matrix=multiply(matrix,args);
     else if(op===OPS.paintFormXObjectBegin){stack.push(matrix.slice());if(args[0])matrix=multiply(matrix,args[0]);}
     else if(op===OPS.paintFormXObjectEnd)matrix=stack.pop()??matrix;
     else if(op===OPS.paintImageXObject){const object=await new Promise(resolve=>(args[0].startsWith('g_')?page.commonObjs:page.objs).get(args[0],resolve));await record(object,matrix,i);}
     else if(op===OPS.paintInlineImageXObject)await record(args[0],matrix,i);
     else if(op===OPS.paintImageXObjectRepeat){const object=await new Promise(resolve=>(args[0].startsWith('g_')?page.commonObjs:page.objs).get(args[0],resolve));for(let j=0;j<args[3].length;j+=2)await record(object,multiply(matrix,[args[1],0,0,args[2],args[3][j],args[3][j+1]]),i);}
     else if(op===OPS.paintInlineImageXObjectGroup){for(const part of args[1]){const whole=pdfPixels(args[0]),crop=new OffscreenCanvas(part.w,part.h);crop.getContext('2d').drawImage(whole,part.x,part.y,part.w,part.h,0,0,part.w,part.h);const id=await pixelIdentity(await crop.convertToBlob(),{signal});await addImage(await crop.convertToBlob(),occurrence(multiply(matrix,part.transform),i,id.width,id.height),{identity:id,name:study.name+'-p'+pageNumber+'.png',encoding:'pdf-decoded-png'},signal);whole.width=whole.height=crop.width=crop.height=1;}}
    }
    page.cleanup();await nextFrame();
   }
  }catch(error){check(signal);study.errors.push(error.message);errors.push({name:study.name,message:error.message});}
  finally{await parser?.destroy();}
 }
 async function importFile(file,name=file.name,signal){
  check(signal);if(++filesCount>limits.entries)throw Error('Maximum : 2 000 fichiers.');if(file.size>limits.fileBytes&&!/\.zip$/i.test(name))throw Error('Fichier supérieur à 256 Mio : '+name);
  if(/\.zip$/i.test(name)){
   const {JSZip}=await libraryLoader();const stored=await readBatchZip(file,{maximumEntries:limits.entries});if(!stored&&file.size>limits.fileBytes)throw Error('ZIP compressé supérieur à 256 Mio. Les archives SHERLOQ sont lues par morceaux.');const zip=stored??await JSZip.loadAsync(file,{checkCRC32:false,createFolders:false});
   const entries=Object.values(zip.files).filter(x=>!x.dir&&!x.name.startsWith('__MACOSX/')&&!x.name.split('/').some(p=>p.startsWith('.')));
   if(entries.length>limits.entries)throw Error('Archive contenant trop de fichiers.');let expanded=0;
   for(const entry of entries){const size=entry._data?.uncompressedSize;if(!Number.isSafeInteger(size)||size>limits.fileBytes)throw Error('Entrée ZIP trop grande ou invalide : '+entry.name);expanded+=size;}
   const manifestEntry=entries.find(x=>x.name==='sherloq-batch.json');let manifest;
   if(manifestEntry){if(manifestEntry._data.uncompressedSize>8*MiB)throw Error('Inventaire de reprise trop grand.');manifest=JSON.parse(await manifestEntry.async('string'));if(manifest.schema!=='sherloq.batch/1')manifest=null;}
   if(manifest){
    if(manifest.imageExportSettings)try{imageExportSettings=validateBatchImageExport(manifest.imageExportSettings);}catch{}
    if(!Array.isArray(manifest.studies)||!Array.isArray(manifest.images)||manifest.studies.length>limits.entries||manifest.images.length>limits.entries)throw Error('Inventaire de reprise invalide.');
    const importedContextId=restoreContext(manifest,name),remap=new Map(),owners=batchArtifactOwners(manifest);
    for(const old of manifest.studies??[]){const entry=zip.file(old.archivePath);if(!entry)continue;const blob=await entry.async('blob');admit(blob.size);const study={id:'study-'+crypto.randomUUID(),name:safeName(old.name),kind:old.kind,blob,manualMarked:!!old.retained,errors:Array.isArray(old.errors)?structuredClone(old.errors):[],restored:true,...(old.pageText?{pageText:old.pageText}:{})};studies.push(study);remap.set(old.id,study.id);}
    for(const old of manifest.images??[]){const entry=zip.file(old.archivePath);if(!entry)continue;const blob=await entry.async('blob');admit(blob.size);for(const occurrence of old.occurrences??[]){if(!remap.has(occurrence.studyId))continue;const image=await addImage(blob,{...occurrence,studyId:remap.get(occurrence.studyId)},{name:old.name,encoding:old.encoding},signal);image.family=['unknown','microscopy','gel','photography','schematic'].includes(old.family)?old.family:'unknown';image.selected=old.selected!==false;
     if(old.archiveSourceConversion&&old.width>0&&old.height>0&&(old.width!==image.width||old.height!==image.height)&&Array.isArray(occurrence.textExclusions)){
      const current=image.occurrences.at(-1);current.textExclusions=occurrence.textExclusions.map(polygon=>polygon.map(([x,y])=>[x*image.width/old.width,y*image.height/old.height]));current.textExclusionTransform={sourceDimensions:[old.width,old.height],dimensions:[image.width,image.height],reason:'export-only-source-resize'};
     }
     await restoreImage(image,old,manifest,zip,signal,owners,remap,importedContextId);
    }}
    await restoreArchivedComparisons(manifest,zip,signal,remap,importedContextId);if(Array.isArray(manifest.errors)&&manifest.errors.length<=limits.entries)errors.push(...structuredClone(manifest.errors));return;
   }
   if(expanded+total>limits.expandedBytes)throw Error('Archive dépassant la limite de 1 Gio décompressé.');
   for(const entry of entries){check(signal);if(/\.pdf$/i.test(entry.name)||imagePattern.test(entry.name))await importFile(await entry.async('blob'),entry.name.split('/').pop(),signal);}
  }else if(/\.pdf$/i.test(name)){admit(file.size);await extractPdf(file,name,signal);}
  else if(imagePattern.test(name)){admit(file.size);const study={id:'study-'+crypto.randomUUID(),name:safeName(name),kind:'image',blob:file,manualMarked:/^(?:A_VERIFIER|\[?SUSPECT|★)/i.test(name),errors:[]};studies.push(study);try{await addImage(file,{studyId:study.id,page:null},{name},signal);}catch(error){check(signal);study.errors.push(error.message);errors.push({name,message:error.message});}}
  else throw Error('Format non pris en charge : '+name);
 }
 const model={studies,images,errors,artifacts,archivedComparisons,importedBatchContexts,get imageExportSettings(){return imageExportSettings;},set imageExportSettings(value){imageExportSettings=validateBatchImageExport(value);},async import(files,signal){for(const file of files){try{await importFile(file,file.name,signal);}catch(error){check(signal);errors.push({name:file.name,message:error.message});}}return {studies,images,errors};},clear(){studies.length=images.length=errors.length=archivedComparisons.length=importedBatchContexts.length=0;globalContextRestored=false;for(const key of [...contextFields,'mixedImportedContexts','comparisons'])delete model[key];byHash.clear();total=filesCount=retainedBytes=0;return artifacts.clear();}};return model;
}
