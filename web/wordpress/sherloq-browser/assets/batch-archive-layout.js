const encoder=new TextEncoder();
const imageExtension=/\.(?:png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif|jp2|j2k|jxl)$/i;
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
const remapFiles=(owner,paths)=>({...owner,files:owner.files?.map(path=>paths.get(path)??path)});

// This is an export projection. In-memory artifact keys and analysis records
// remain unchanged, so repeated exports and resumed analyses keep their identity.
export function batchArchiveLayout(model){
 const sourceNames=allocator(),resultNames=allocator(),paths=new Map(),sources=new Map(),usedPaths=new Set(),imagesById=new Map(model.images.map(image=>[image.id,image]));
 for(const image of model.images){const original=basename(image.name)||'image.png';sources.set(image.id,'images/'+sourceNames(stem(original),extension(original)));}
 function addFiles(files,label){
  const pending=[...new Set(files??[])].filter(path=>!paths.has(path));if(!pending.length)return;
  const variants=new Map();for(const path of pending){const key=path.slice(0,path.length-extension(basename(path)).length);if(!variants.has(key))variants.set(key,[]);variants.get(key).push(path);}
  for(const [variant,group]of variants){const base=resultNames(label+(variants.size>1?' -- '+basename(variant):''));for(const path of group){const ext=extension(basename(path)),folder=imageExtension.test(ext)?'resultats/images/':'resultats/donnees/';let target=folder+base+ext.toLowerCase();while(usedPaths.has(collisionKey(target)))target=folder+resultNames(base)+ext.toLowerCase();usedPaths.add(collisionKey(target));paths.set(path,target);}}
 }
 for(const image of model.images)for(const run of image.runs??[])addFiles(run.files,stem(basename(image.name))+' -- '+(run.title||run.toolId||run.operation||'analyse'));
 for(const pair of model.comparisons??[])addFiles(pair.files,(pair.images??[]).map(id=>stem(basename(imagesById.get(id)?.name??id))).join(' -- ')+' -- comparaison');
 // Keep any additional scientific exports, even when an interrupted method
// produced a file before its run record could be completed.
 for(const path of model.artifacts.keys())if(!paths.has(path))addFiles([path],stem(basename(path))||'resultat');
 return {
  sources,paths,
  images:model.images.map(image=>{const {blob,thumbnail,restored,...rest}=image;return {...rest,runs:(image.runs??[]).map(run=>remapFiles(run,paths)),archivePath:sources.get(image.id)};}),
  comparisons:(model.comparisons??[]).map(pair=>remapFiles(pair,paths)),
 };
}

export async function remapBatchEvidence(blob,path,paths){
 if(!/\.json$/i.test(path))return blob;
 const data=JSON.parse(await blob.text());let changed=false;
 function visit(value){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='scientificArrays'&&typeof child==='string'&&paths.has(child)){value[key]=paths.get(child);changed||=value[key]!==child;}else if(child&&typeof child==='object')visit(child);}}
 visit(data);return changed?new Blob([JSON.stringify(data)],{type:blob.type||'application/json'}):blob;
}
