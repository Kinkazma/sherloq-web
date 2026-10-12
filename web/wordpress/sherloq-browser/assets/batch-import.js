import {readBatchZip} from './batch-zip.js';
import {createBatchArtifactStore} from './batch-artifacts.js';
import {batchPairSelection} from './batch-catalog.js';
import {serializeEngineError} from './unified-engine/src/errors.js';
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
 const {createToolClient}=await import('./tool-client.js'),client=await createToolClient({memoryBudgetBytes:4*1024**3}),cancel=()=>client.cancel();signal?.addEventListener('abort',cancel,{once:true});
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
 const studies=[],images=[],byHash=new Map(),errors=[],artifacts=await artifactStoreFactory(),restoredImages=new WeakMap();let total=0,filesCount=0,retainedBytes=0;
 function admit(bytes){total+=bytes;if(total>limits.expandedBytes)throw Error('Le lot dépasse 1 Gio de fichiers décompressés. Fractionnez le lot.');}
 async function addImage(blob,occurrence,{name,encoding='original',identity}={},signal){
  check(signal);const info=identity??await identify(blob,{signal});let image=byHash.get(info.hash);
  if(!image){if(images.length>=limits.entries||retainedBytes+blob.size+info.thumbnail.size>limits.expandedBytes)throw Error('Trop d’images extraites pour ce lot. Fractionnez les documents.');retainedBytes+=blob.size+info.thumbnail.size;image={id:'image-'+info.hash.slice(0,24),hash:info.hash,name:safeName(name??'image.png'),blob,thumbnail:info.thumbnail,width:info.width,height:info.height,encoding,selected:true,family:'unknown',occurrences:[],runs:[],state:'ready'};byHash.set(info.hash,image);images.push(image);}
  image.occurrences.push(occurrence);onProgress({phase:'image',images:images.length,occurrences:images.reduce((n,i)=>n+i.occurrences.length,0)});return image;
 }
 async function restoreImage(image,old,manifest,zip,signal){
  if(old.hash!==image.hash||old.width!==image.width||old.height!==image.height)return;
  const seen=restoredImages.get(image)??new Set();if(seen.has(old))return;seen.add(old);restoredImages.set(image,seen);
  if(old.pairCleared)image.pairCleared=true;
  else{const selection=old.pairSelection??manifest.configuration?.pairSelections?.[image.hash];if(selection)try{
   if(selection.pixelHash!==image.hash||selection.width!==image.width||selection.height!==image.height)throw Object.assign(Error('La paire archivée appartient à une autre image.'),{code:'BATCH_PAIR_REQUIRED'});
   image.pairSelection=batchPairSelection(image,selection.regions,selection.source);image.pairCleared=false;
  }catch(error){image.pairError=serializeEngineError(error,'BATCH_PAIR_REQUIRED');}}
  const permitted=path=>typeof path==='string'&&path.split('/').every(p=>p&&p!=='.'&&p!=='..')&&(path.startsWith('resultats/'+image.id+'/')||/^historique\/[^/]+\/resultats\//.test(path)&&path.split('/')[3]===image.id);
  const validRuns=runs=>Array.isArray(runs)&&runs.length<=100&&runs.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.title==='string'&&['done','partial','error','cancelled','running'].includes(r.status)&&Array.isArray(r.files)&&r.files.every(permitted));
  const diagnosticRuns=runs=>structuredClone(runs).map(r=>r.status==='running'?{...r,archivedStatus:'running',status:'partial',error:r.error??{code:'INTERRUPTED_ARCHIVE',message:'Ce calcul était actif lors de l’export ; il n’est pas en cours dans cette session.'}}:r);
  const restoreFiles=async runs=>{for(const path of runs.flatMap(r=>r.files))if(zip.file(path)&&!artifacts.has(path)){check(signal);await artifacts.set(path,await zip.file(path).async('blob'));}};
  const history=(old.history??[]);if(Array.isArray(history)&&history.length<=1000){image.history??=[];for(const attempt of history)if(attempt&&validRuns(attempt.runs)){await restoreFiles(attempt.runs);image.history.push({...structuredClone(attempt),runs:diagnosticRuns(attempt.runs)});}}
  if(!validRuns(old.runs))return;
  await restoreFiles(old.runs);
  const scoreValid=old.score&&['clones','additional','total'].every(k=>Number.isSafeInteger(old.score[k])&&old.score[k]>=0&&old.score[k]<=128);
  if(old.state==='done'&&old.runs.every(r=>r.status==='done')&&scoreValid&&old.runs.flatMap(r=>r.files).every(path=>zip.file(path))){image.runs=structuredClone(old.runs);image.score=structuredClone(old.score);image.state='done';image.restored={configuration:manifest.configuration,engine:manifest.engine};}
  else if(old.runs.length){image.runs=diagnosticRuns(old.runs);image.state='incomplete';image.score={...(scoreValid?structuredClone(old.score):{clones:0,additional:0,total:0}),incomplete:true};image.restoredDiagnostics=true;}
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
    check(signal);onProgress({phase:'pdf',name:study.name,page:pageNumber,pages:doc.numPages});const page=await doc.getPage(pageNumber),list=await page.getOperatorList(),stack=[];let matrix=[1,0,0,1,0,0];const OPS=pdfjs.OPS;
    const record=async(image,at,index)=>{
     if(!image?.width||!image?.height||image.width<8||image.height<8)return;
     const cached=extracted.get(image);if(cached){await addImage(cached.blob,{studyId:study.id,page:pageNumber,matrix:at.slice(),operator:index},cached,signal);return;}
     const c=pdfPixels(image);let encoded=await c.convertToBlob({type:'image/png'});c.width=c.height=1;
     const identity=await pixelIdentity(encoded,{signal}),native=originalJpegs.get(identity.hash);if(native)encoded=native.blob;
     const record={blob:encoded,identity,name:study.name.replace(/\.pdf$/i,'')+'-p'+pageNumber+'-'+index+(native?'.jpg':'.png'),encoding:native?'embedded-jpeg':'pdf-decoded-png'};extracted.set(image,record);
     await addImage(encoded,{studyId:study.id,page:pageNumber,matrix:at.slice(),operator:index},record,signal);
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
     else if(op===OPS.paintInlineImageXObjectGroup){for(const part of args[1]){const whole=pdfPixels(args[0]),crop=new OffscreenCanvas(part.w,part.h);crop.getContext('2d').drawImage(whole,part.x,part.y,part.w,part.h,0,0,part.w,part.h);const id=await pixelIdentity(await crop.convertToBlob(),{signal});await addImage(await crop.convertToBlob(),{studyId:study.id,page:pageNumber,matrix:multiply(matrix,part.transform),operator:i},{identity:id,name:study.name+'-p'+pageNumber+'.png',encoding:'pdf-decoded-png'},signal);whole.width=whole.height=crop.width=crop.height=1;}}
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
    if(!Array.isArray(manifest.studies)||!Array.isArray(manifest.images)||manifest.studies.length>limits.entries||manifest.images.length>limits.entries)throw Error('Inventaire de reprise invalide.');
    const remap=new Map();
    for(const old of manifest.studies??[]){const entry=zip.file(old.archivePath);if(!entry)continue;const blob=await entry.async('blob');admit(blob.size);const study={id:'study-'+crypto.randomUUID(),name:safeName(old.name),kind:old.kind,blob,manualMarked:!!old.retained,errors:Array.isArray(old.errors)?structuredClone(old.errors):[],restored:true};studies.push(study);remap.set(old.id,study.id);}
    for(const old of manifest.images??[]){const entry=zip.file(old.archivePath);if(!entry)continue;const blob=await entry.async('blob');admit(blob.size);for(const occurrence of old.occurrences??[]){if(!remap.has(occurrence.studyId))continue;const image=await addImage(blob,{...occurrence,studyId:remap.get(occurrence.studyId)},{name:old.name,encoding:old.encoding},signal);image.family=['unknown','microscopy','gel','photography','schematic'].includes(old.family)?old.family:'unknown';image.selected=old.selected!==false;
     await restoreImage(image,old,manifest,zip,signal);
    }}
    if(Array.isArray(manifest.errors)&&manifest.errors.length<=limits.entries)errors.push(...structuredClone(manifest.errors));return;
   }
   if(expanded+total>limits.expandedBytes)throw Error('Archive dépassant la limite de 1 Gio décompressé.');
   for(const entry of entries){check(signal);if(/\.pdf$/i.test(entry.name)||imagePattern.test(entry.name))await importFile(await entry.async('blob'),entry.name.split('/').pop(),signal);}
  }else if(/\.pdf$/i.test(name)){admit(file.size);await extractPdf(file,name,signal);}
  else if(imagePattern.test(name)){admit(file.size);const study={id:'study-'+crypto.randomUUID(),name:safeName(name),kind:'image',blob:file,manualMarked:/^(?:A_VERIFIER|\[?SUSPECT|★)/i.test(name),errors:[]};studies.push(study);try{await addImage(file,{studyId:study.id,page:null},{name},signal);}catch(error){check(signal);study.errors.push(error.message);errors.push({name,message:error.message});}}
  else throw Error('Format non pris en charge : '+name);
 }
 return {studies,images,errors,artifacts,async import(files,signal){for(const file of files){try{await importFile(file,file.name,signal);}catch(error){check(signal);errors.push({name:file.name,message:error.message});}}return {studies,images,errors};},clear(){studies.length=images.length=errors.length=0;byHash.clear();total=filesCount=retainedBytes=0;return artifacts.clear();}};
}
