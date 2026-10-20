const encoder=new TextEncoder();
const imageExtension=/\.(?:png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif|jp2|j2k|jxl|psd)$/i;
const basename=path=>String(path??'').split(/[\\/]/).pop();
const extension=name=>name.match(/\.[^.]+$/)?.[0]??'';
const stem=name=>name.slice(0,name.length-extension(name).length);
const collisionKey=name=>name.normalize('NFKC').toLocaleLowerCase('en-US');
function boundedName(name,maximum=180){
 let result='';for(const character of name){if(encoder.encode(result+character).length>maximum)break;result+=character;}return result;
}
function portableName(value){
 let name=String(value??'').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/\s+/g,' ').replace(/[. ]+$/,'').trim()||'document';
 if(/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name='_'+name;
 return boundedName(name);
}
function allocator(){
 const used=new Set();return (value,ext='')=>{const base=portableName(value),ending=portableName(ext||'_').replace(/^_$/,'');let index=1,name;
  do{const suffix=index===1?'':' ('+index+')';name=boundedName(base,180-encoder.encode(suffix+ending).length)+suffix+ending;index++;}while(used.has(collisionKey(name)));used.add(collisionKey(name));return name;
 };
}
export function remapBatchFilePointers(value,paths,{contextPath}={}){
 const historical=contextPath?.match(/^historique\/[^/]+\//)?.[0],resolve=path=>typeof path==='string'?(historical&&paths.has(historical+path)?paths.get(historical+path):paths.get(path)??path):path;
 function visit(current,pointers=false,geometrySources=false){
  if(typeof current==='string')return pointers?resolve(current):current;
  if(!current||typeof current!=='object'||ArrayBuffer.isView(current)||current instanceof Blob)return current;
  let changed=false;
  if(Array.isArray(current)){const result=current.map(child=>{const next=visit(child,pointers,geometrySources);changed ||=next!==child;return next;});return changed?result:current;}
  const entries=Object.entries(current).map(([key,child])=>{
   // These are external artifact references. Generic path/json/name fields,
   // native parameters and model URLs are not archive file pointers.
   const filePointer=key==='scientificArrays'||key==='geometrySource'||geometrySources&&(key==='path'||key==='json');
   const next=filePointer?resolve(child):visit(child,pointers||key==='files',key==='geometrySources');changed ||=next!==child;return [key,next];
  });return changed?Object.fromEntries(entries):current;
 }
 return visit(value);
}
const remapFiles=(owner,paths)=>remapBatchFilePointers(owner,paths,{contextPath:Array.isArray(owner.files)?owner.files[0]:undefined});

// This is an export projection. In-memory artifact keys and analysis records
// remain unchanged, so repeated exports and resumed analyses keep their identity.
export function batchArchiveLayout(model,{imageFormat}={}){
 if(imageFormat!==undefined&&!['png','webp','tiff','avif','heic'].includes(imageFormat))throw Error('Invalid archive image format.');
 const sourceNames=allocator(),resultNames=allocator(),paths=new Map(),sources=new Map(),usedPaths=new Set(),imagesById=new Map(model.images.map(image=>[image.id,image]));
 for(const image of model.images){const original=basename(image.name)||'image.png';sources.set(image.id,'images/'+sourceNames(stem(original),imageFormat?'.'+imageFormat:extension(original)));}
 function addFiles(files,label){
  const pending=[...new Set(files??[])].filter(path=>!paths.has(path));if(!pending.length)return;
  const variants=new Map();for(const path of pending){const key=path.slice(0,path.length-extension(basename(path)).length);if(!variants.has(key))variants.set(key,[]);variants.get(key).push(path);}
  for(const [variant,group]of variants){const base=resultNames(label+(variants.size>1?' -- '+basename(variant):''));for(const path of group){const originalExt=extension(basename(path)),raster=imageExtension.test(originalExt),ext=raster&&imageFormat?'.'+imageFormat:originalExt,folder=raster?'resultats/images/':'resultats/donnees/';let target=folder+base+ext.toLowerCase();while(usedPaths.has(collisionKey(target)))target=folder+resultNames(base)+ext.toLowerCase();usedPaths.add(collisionKey(target));paths.set(path,target);}}
 }
 for(const image of model.images){
  for(const run of image.runs??[])addFiles(run.files,stem(basename(image.name))+' -- '+(run.title||run.toolId||run.operation||'analyse'));
  if(image.finalDisplay)addFiles(image.finalDisplay.files,stem(basename(image.name))+' -- '+(image.finalDisplay.title||image.finalDisplay.mode||image.finalDisplay.kind||'vue finale'));
  if(image.resultDisplay)addFiles(image.resultDisplay.files,stem(basename(image.name))+' -- vue choisie');
  for(const [index,attempt]of (image.history??[]).entries()){
   for(const run of attempt.runs??[])addFiles(run.files,stem(basename(image.name))+' -- '+(run.title||run.toolId||run.operation||'analyse')+' -- essai '+(index+1));
   if(attempt.finalDisplay)addFiles(attempt.finalDisplay.files,stem(basename(image.name))+' -- '+(attempt.finalDisplay.title||attempt.finalDisplay.mode||attempt.finalDisplay.kind||'vue finale')+' -- essai '+(index+1));
   if(attempt.resultDisplay)addFiles(attempt.resultDisplay.files,stem(basename(image.name))+' -- vue choisie -- essai '+(index+1));
  }
 }
 for(const pair of model.comparisons??[])addFiles(pair.files,(pair.images??[]).map(id=>stem(basename(imagesById.get(id)?.name??id))).join(' -- ')+' -- comparaison');
 for(const pair of model.archivedComparisons??[])addFiles(pair.files,(pair.sourceIdentities??[]).map(source=>stem(basename(source.name??source.id))).join(' -- ')+' -- comparaison archivee');
 // Keep any additional scientific exports, even when an interrupted method
// produced a file before its run record could be completed.
 for(const path of model.artifacts.keys())if(!paths.has(path))addFiles([path],stem(basename(path))||'resultat');
 return {
  sources,paths,
  images:model.images.map(image=>{const {blob,thumbnail,restored,...rest}=image;return {...rest,runs:(image.runs??[]).map(run=>remapFiles(run,paths)),...(image.finalDisplay?{finalDisplay:remapFiles(image.finalDisplay,paths)}:{}),...(image.resultDisplay?{resultDisplay:remapFiles(image.resultDisplay,paths)}:{}),...(image.history?{history:image.history.map(attempt=>({...attempt,runs:(attempt.runs??[]).map(run=>remapFiles(run,paths)),...(attempt.finalDisplay?{finalDisplay:remapFiles(attempt.finalDisplay,paths)}:{}),...(attempt.resultDisplay?{resultDisplay:remapFiles(attempt.resultDisplay,paths)}:{})}))}:{}),archivePath:sources.get(image.id)};}),
  comparisons:(model.comparisons??[]).map(pair=>remapFiles(pair,paths)),
  archivedComparisons:(model.archivedComparisons??[]).map(pair=>remapFiles(pair,paths)),
 };
}

export async function remapBatchEvidence(blob,path,paths){
 if(!/\.json$/i.test(path))return blob;
 const data=JSON.parse(await blob.text()),remapped=remapBatchFilePointers(data,paths,{contextPath:path});return remapped!==data?new Blob([JSON.stringify(remapped)],{type:blob.type||'application/json'}):blob;
}
