import {readBatchZip} from './batch-zip.js';
import {createToolClient} from './tool-client.js';
import {createExportSink} from './export-sink.js';
import {BATCH_CORROBORATION_PALETTE} from './batch-corroboration-export.js';
import {batchBiomeCandidates,batchBiomeCapabilities,loadBatchNativeBiomes,batchBiomePreview,batchBiomeWindow,batchBiomeMetadata} from './batch-native-biomes.js';
import {Budget} from './unified-engine/src/cache.js';
import {createRasterExports} from './unified-engine/src/raster-export.js';
import {EngineError,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';

export const BATCH_DISPLAY_PREFERENCES_SCHEMA='sherloq.batch-result-display-preferences/1';
export const BATCH_RESULT_DISPLAY_SCHEMA='sherloq.batch-result-display/1';
export const BATCH_RESULT_OPACITY=.35;
const MiB=1024**2,CHUNK=MiB,HEADER_LIMIT=65536,METADATA_LIMIT=8*MiB;
const invalid=message=>new EngineError('BATCH_DISPLAY_INVALID',message);
const requireDisplay=(condition,message)=>{if(!condition)throw invalid(message);};
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crcUpdate=(crc,bytes)=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc;};
const crcFinish=crc=>(crc^0xffffffff)>>>0;

export function validateBatchDisplayPreferences(value){
 requireDisplay(value&&typeof value==='object'&&!Array.isArray(value)&&value.schema===BATCH_DISPLAY_PREFERENCES_SCHEMA&&['biomes','corroboration'].includes(value.mode)&&Number.isFinite(value.opacity)&&value.opacity>=0&&value.opacity<=1,'Invalid post-calculation display preferences.');
 return {schema:BATCH_DISPLAY_PREFERENCES_SCHEMA,mode:value.mode,opacity:value.opacity};
}
export function batchResultDisplayPreferences(image,overrides={}){
 const previous=image.displayPreferences?validateBatchDisplayPreferences(image.displayPreferences):{schema:BATCH_DISPLAY_PREFERENCES_SCHEMA,mode:image.finalDisplay?.kind==='biomes'?'biomes':'corroboration',opacity:BATCH_RESULT_OPACITY};
 return validateBatchDisplayPreferences({...previous,...overrides});
}
function identity(image,artifacts){
 requireDisplay(Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&Number.isSafeInteger(image.width*image.height*4),'Invalid original result dimensions.');
 const final=image.finalDisplay;
 requireDisplay(final&&final.pendingRendering===false&&['biomes','corroboration'].includes(final.kind),'Scientific result presentation is not complete.');
 const path=(final.kind==='corroboration'||final.schema==='sherloq.batch-corroboration/1')?(final.files??[]).find(p=>typeof p==='string'&&/\.npz$/i.test(p)&&artifacts.has(p)):undefined;
 requireDisplay(path||batchBiomeCandidates(image,artifacts).length,'The archived result has neither corroboration counts nor paired native biome groups; its original analysis images remain available.');
 const hashes=[image.sourceSha256,image.preparation?.sourceSha256,final.source?.originalSha256].filter(v=>v!==undefined&&v!==null);
 requireDisplay(hashes.length>0&&hashes.every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v===hashes[0]),'Original scientific source identities differ.');
 const fingerprint=image.preparation?.fingerprint??final.scopeFingerprint??null;
 requireDisplay(!fingerprint||final.scopeFingerprint===fingerprint,'The display scope differs from the scientific result scope.');
 return {path,width:image.width,height:image.height,sourceSha256:hashes[0],scopeFingerprint:fingerprint,final};
}
async function npy(blob,{signal,maxBytes=Number.MAX_SAFE_INTEGER}={}){
 checkAbort(signal);requireDisplay(blob instanceof Blob&&blob.size>=10&&blob.size<=maxBytes,'Invalid or oversized scientific NPY entry.');
 const first=new Uint8Array(await blob.slice(0,12).arrayBuffer());
 requireDisplay(first[0]===147&&new TextDecoder().decode(first.subarray(1,6))==='NUMPY'&&[1,2,3].includes(first[6])&&first[7]===0,'Unsupported scientific NPY header.');
 const v=new DataView(first.buffer),start=first[6]===1?10:12,length=first[6]===1?v.getUint16(8,true):v.getUint32(8,true);
 requireDisplay(length>0&&length<=HEADER_LIMIT&&start+length<=blob.size,'Scientific NPY header is truncated or oversized.');
 const headerBytes=new Uint8Array(await blob.slice(0,start+length).arrayBuffer()),header=new TextDecoder('utf-8',{fatal:true}).decode(headerBytes.subarray(start));
 const dtype=/'descr'\s*:\s*'([^']+)'/.exec(header)?.[1],shapeText=/'shape'\s*:\s*\(([^)]*)\)/.exec(header)?.[1];
 requireDisplay(dtype&&shapeText!==undefined&&/'fortran_order'\s*:\s*False/.test(header),'Scientific NPY must use a declared C-order array.');
 const shape=shapeText.split(',').map(s=>s.trim()).filter(Boolean).map(Number);
 requireDisplay(shape.length<=8&&shape.every(n=>Number.isSafeInteger(n)&&n>=0),'Invalid scientific NPY shape.');
 return {blob,dtype,shape,offset:headerBytes.length,headerBytes};
}
async function metadataJson(entry,{signal}={}){
 requireDisplay(entry,'Scientific result metadata is missing.');
 const blob=await entry.async('blob'),record=await npy(blob,{signal,maxBytes:METADATA_LIMIT}),match=/^<U(\d+)$/.exec(record.dtype);
 requireDisplay(match&&record.shape.length===0&&record.offset+Number(match[1])*4===blob.size,'Scientific metadata must be a bounded scalar Unicode NPY.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 requireDisplay(Number.isSafeInteger(entry._data?.crc32)&&crcFinish(crcUpdate(0xffffffff,bytes))===entry._data.crc32,'Scientific metadata CRC differs.');
 const view=new DataView(bytes.buffer),parts=[];let codes=[];
 for(let at=record.offset;at<bytes.length;at+=4){const code=view.getUint32(at,true);requireDisplay(code<=0x10ffff&&(code<0xd800||code>0xdfff),'Invalid scientific metadata Unicode.');codes.push(code);if(codes.length===1024){parts.push(String.fromCodePoint(...codes));codes=[];}}
 if(codes.length)parts.push(String.fromCodePoint(...codes));
 try{return JSON.parse(parts.join(''));}catch(cause){throw new EngineError('BATCH_DISPLAY_INVALID','Scientific result metadata is not valid JSON.',{cause});}
}
function colors(palette){
 const value=palette??BATCH_CORROBORATION_PALETTE;
 requireDisplay(value.schema==='sherloq.corroboration-palette/1'&&Array.isArray(value.buckets)&&value.buckets.length===4&&value.buckets.every((b,i)=>b.count===i&&Array.isArray(b.rgb)&&b.rgb.length===3&&b.rgb.every(c=>Number.isSafeInteger(c)&&c>=0&&c<=255)&&Number.isFinite(b.opacity)&&b.opacity>=0&&b.opacity<=1),'Invalid scientific result color metadata.');
 return structuredClone(value);
}
function previewRgba(buckets,palette){
 const rgba=new Uint8ClampedArray(buckets.length*4);
 for(let i=0;i<buckets.length;i++){const count=buckets[i];if(!count)continue;rgba.set(palette.buckets[count].rgb,i*4);rgba[i*4+3]=255;}
 return rgba;
}

/** The archive is parsed once per scientific artifact. Only preview buckets
 * (0,1,2,3+) stay in RAM; native uint32 values remain immutable Blob slices.
 * Slider changes use CSS opacity on the returned transparent preview layers.
 */
export function createBatchResultDisplay({artifacts,computeProfile='maximum',toolFactory=createToolClient,dependencies={},maxOpenArtifacts=4}={}){
 requireDisplay(artifacts&&typeof artifacts.get==='function'&&typeof artifacts.set==='function'&&typeof artifacts.has==='function','A result artifact store is required.');
 requireDisplay(Number.isSafeInteger(maxOpenArtifacts)&&maxOpenArtifacts>0&&maxOpenArtifacts<=8,'Invalid opened result artifact cache extent.');
 const records=new Map(),pending=new Set(),lifetime=new AbortController();let closed=false,touch=0;
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Result display service disposed.');};
 const signalFor=signal=>signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
 const tracked=fn=>{const operation=Promise.resolve().then(fn);pending.add(operation);operation.finally(()=>pending.delete(operation)).catch(()=>{});return operation;};
 function recordFor(image){
  alive();const expected=identity(image,artifacts),signature=JSON.stringify([expected.path,expected.width,expected.height,expected.sourceSha256,expected.scopeFingerprint,expected.final.npz?.sha256,expected.final.methods,expected.final.palette,batchBiomeCandidates(image,artifacts).map(c=>[c.json,c.npz,c.run.view,c.run.effectiveView])]);
  let record=records.get(image.id);
  if(!record||record.final!==expected.final||record.signature!==signature){record={...expected,image,signature,previewReads:0,renderQueue:Promise.resolve(),users:0};records.set(image.id,record);}
  return record;
 }
 function trimOpened(){
  const opened=[...records.values()].filter(r=>r.openedReady),idle=opened.filter(r=>r.users===0).sort((a,b)=>a.touched-b.touched);
  for(let excess=opened.length-maxOpenArtifacts;excess>0&&idle.length;excess--){const record=idle.shift();record.opened=null;record.openedReady=false;}
 }
 async function using(record,fn){record.users++;record.touched=++touch;try{return await fn();}finally{record.users--;trimOpened();}}
 async function open(record,signal){
  checkAbort(signal);
  if(!record.opened)record.opened=(async()=>{
   checkAbort(signal);const archive=await artifacts.get(record.path),zip=archive&&await readBatchZip(archive,{maximumEntries:64});
   requireDisplay(zip,'Scientific result is not a supported NPZ archive.');
   const entry=zip.file('corroboration.npy');requireDisplay(entry&&entry._data?.compressionMethod===0,'Scientific corroboration must be stored as an uncompressed NPY for bounded reads.');
   const array=await npy(await entry.async('blob'),{signal});
   requireDisplay(array.dtype==='<u4'&&JSON.stringify(array.shape)===JSON.stringify([record.height,record.width])&&array.offset+record.width*record.height*4===array.blob.size,'Scientific counts dtype, shape or byte length differs from the original image.');
   requireDisplay(Number.isSafeInteger(entry._data.crc32)&&entry._data.crc32>=0&&entry._data.crc32<=0xffffffff,'Scientific counts CRC is missing.');
   const metadata=await metadataJson(zip.file('metadata_json.npy'),{signal});
   requireDisplay(metadata.schema==='sherloq.batch-corroboration/1'&&metadata.width===record.width&&metadata.height===record.height&&metadata.coordinates==='original-pixels'&&metadata.array?.dtype==='<u4'&&metadata.array?.order==='C'&&JSON.stringify(metadata.array.shape)===JSON.stringify(array.shape),'Scientific count metadata differs from its array.');
   requireDisplay(metadata.source?.originalSha256===record.sourceSha256&&(metadata.scopeFingerprint??null)===record.scopeFingerprint,'Scientific count source or exclusion scope differs from the image.');
   requireDisplay(Array.isArray(metadata.methods)&&metadata.methods.length>0&&metadata.methods.every(v=>typeof v==='string'&&v)&&new Set(metadata.methods).size===metadata.methods.length&&Number.isSafeInteger(metadata.maximum)&&metadata.maximum>=0&&metadata.maximum<=metadata.methods.length,'Invalid corroboration method or maximum metadata.');
   checkAbort(signal);record.openedReady=true;return {...array,metadata,palette:colors(metadata.palette),crc32:entry._data.crc32};
  })().catch(error=>{record.opened=null;record.openedReady=false;throw error;});
  return record.opened;
 }
 async function preview(record,{maxWidth=480,maxHeight=480,signal}={}){
  checkAbort(signal);
  requireDisplay([maxWidth,maxHeight].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2048),'Invalid result preview size.');
  if(!record.path){const scale=Math.min(1,maxWidth/record.width,maxHeight/record.height),width=Math.max(1,Math.round(record.width*scale)),height=Math.max(1,Math.round(record.height*scale));return {width,height,metadata:{maximum:null,methods:[],sourceSha256:record.sourceSha256,scopeFingerprint:record.scopeFingerprint,previewReads:0,fullGridRetained:false}};}
  if(!record.preview)record.preview=(async()=>{
   const array=await open(record,signal),scale=Math.min(1,maxWidth/record.width,maxHeight/record.height),width=Math.max(1,Math.round(record.width*scale)),height=Math.max(1,Math.round(record.height*scale)),buckets=new Uint8Array(width*height);
   let maximum=0,crc=crcUpdate(0xffffffff,array.headerBytes);const rows=Math.max(1,Math.min(32,Math.floor(CHUNK/(record.width*4))));record.previewReads++;
   for(let top=0;top<record.height;top+=rows){await controlCheckpoint(signal);const count=Math.min(rows,record.height-top),bytes=new Uint8Array(await array.blob.slice(array.offset+top*record.width*4,array.offset+(top+count)*record.width*4).arrayBuffer()),view=new DataView(bytes.buffer);crc=crcUpdate(crc,bytes);
    for(let y=0;y<count;y++){const py=Math.min(height-1,Math.floor((top+y)*height/record.height));for(let x=0;x<record.width;x++){const value=view.getUint32((y*record.width+x)*4,true);requireDisplay(value<=array.metadata.methods.length,'A scientific count exceeds the number of algorithms.');maximum=Math.max(maximum,value);const at=py*width+Math.min(width-1,Math.floor(x*width/record.width));buckets[at]=Math.max(buckets[at],Math.min(3,value));}}
   }
   requireDisplay(crcFinish(crc)===array.crc32,'Scientific corroboration CRC differs.');requireDisplay(maximum===array.metadata.maximum,'Scientific corroboration maximum differs.');checkAbort(signal);
   const value={width,height,buckets,palette:array.palette,metadata:{maximum,methods:array.metadata.methods,sourceSha256:record.sourceSha256,scopeFingerprint:record.scopeFingerprint,previewAggregation:'maximum count per display cell; not a full-resolution scientific grid',previewReads:record.previewReads,fullGridRetained:false}};record.previewValue=value;return value;
  })().catch(error=>{record.preview=null;throw error;});
  return record.preview;
 }
 async function biomes(record,signal){
  checkAbort(signal);if(!batchBiomeCandidates(record.image,artifacts).length)return null;
  if(!record.biomes)record.biomes=(async()=>{
   const budget=dependencies.geometryBudgetFactory?.()??new Budget(256*MiB);
   return loadBatchNativeBiomes(record.image,record,{artifacts,budget,readNpy:npy,readMetadataJson:metadataJson,crcUpdate,crcFinish,signal,...(dependencies.geometryFactory?{geometryFactory:dependencies.geometryFactory}:{})});
  })().then(value=>(record.biomeValue=value,record.biomeError=null,value)).catch(error=>{record.biomes=null;if(error.code==='CANCELLED'||signal.aborted)throw error;record.biomeError=error;return null;});
  return record.biomes;
 }
 async function full(image,record,preferences,signal){
  checkAbort(signal);
  const displayed=await preview(record,{signal}),geometry=preferences.mode==='biomes'?await biomes(record,signal):null;
  if(preferences.mode==='biomes'&&!geometry)throw record.biomeError??new EngineError('BATCH_BIOMES_UNAVAILABLE','No paired native clone groups are available for this image.');
  requireDisplay(preferences.mode!=='corroboration'||record.path,'No scientific corroboration count array is available.');
  const array=preferences.mode==='corroboration'?await open(record,signal):null,biomeMetadata=geometry?batchBiomeMetadata(geometry):null,cacheKey=JSON.stringify(['batch-result-display/2',record.signature,array?.crc32??null,preferences.mode,preferences.opacity,geometry?.groups,geometry?.style]);
  const existing=image.resultDisplay;
  if(existing?.schema===BATCH_RESULT_DISPLAY_SCHEMA&&existing.presentation?.cacheKey===cacheKey&&existing.files?.length===1&&artifacts.has(existing.files[0]))return {...existing,path:existing.files[0],blob:await artifacts.get(existing.files[0])};
  const budget=dependencies.budgetFactory?.()??new Budget(256*MiB),rasterFactory=dependencies.rasterFactory??createRasterExports,sinkFactory=dependencies.sinkFactory??createExportSink;
  let client,raster,output,sink,transfer,releaseTransfer;
  const path='resultats/'+image.id+'/vue-resultat.png';
  try{
   client=await toolFactory({computeProfile:typeof computeProfile==='function'?computeProfile():computeProfile});
   const abort=()=>client.cancel?.();signal.addEventListener('abort',abort,{once:true});
   try{checkAbort(signal);await client.load({id:image.id,blob:image.blob});checkAbort(signal);
    const source=client.source?.surface;requireDisplay(source&&source.width===record.width&&source.height===record.height&&source.format==='rgb8'&&client.source.sha256===record.sourceSha256,'Decoded original pixels differ from the scientific result source.');
    const surface={descriptor:{id:'batch-result-view-'+crypto.randomUUID(),revision:1,width:record.width,height:record.height,format:'rgb8',storage:'temporary'},async readWindow(rect,{signal:readSignal}={}){
     const {x,y,width,height}=rect;requireDisplay([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=record.width&&y+height<=record.height,'Invalid original result display window.');checkAbort(readSignal??signal);
     const release=budget.reserve(width*height*10);let complete=false;
     try{const original=await client.readWindow(source,rect);requireDisplay(original.width===width&&original.height===height&&original.data instanceof Uint8Array&&original.data.length===width*height*3,'Original display window dimensions differ.');checkAbort(readSignal??signal);
      const data=new Uint8Array(original.data),alpha=preferences.opacity;
      if(geometry){batchBiomeWindow(geometry,rect,{signal:readSignal??signal,budget,rgb:data});for(let i=0;i<data.length;i++)data[i]=Math.round(original.data[i]*(1-alpha)+data[i]*alpha);}
      else{const counts=new Uint8Array(width*height*4);
       if(x===0&&width===record.width)counts.set(new Uint8Array(await array.blob.slice(array.offset+y*record.width*4,array.offset+(y+height)*record.width*4).arrayBuffer()));
       else for(let row=0;row<height;row++)counts.set(new Uint8Array(await array.blob.slice(array.offset+((y+row)*record.width+x)*4,array.offset+((y+row)*record.width+x+width)*4).arrayBuffer()),row*width*4);
       const view=new DataView(counts.buffer);for(let i=0;i<width*height;i++){const value=view.getUint32(i*4,true);if(!value)continue;const color=array.palette.buckets[Math.min(3,value)].rgb;for(let c=0;c<3;c++)data[i*3+c]=Math.round(original.data[i*3+c]*(1-alpha)+color[c]*alpha);}
      }
      checkAbort(readSignal??signal);complete=true;return {pixels:{width,height,format:'rgb8',data},release};
     }finally{if(!complete)release();}
    }};
    raster=rasterFactory(budget);output=await raster.create(surface,{format:'png',storage:'temporary'},{signal,imageId:image.id,originalSha256:record.sourceSha256,...(dependencies.wasmBinary?{wasmBinary:dependencies.wasmBinary}:{})});
   }finally{signal.removeEventListener('abort',abort);}
   releaseTransfer=budget.reserve(Math.min(CHUNK,output.byteLength));sink=await sinkFactory({memoryBudgetBytes:0,signal,mime:'image/png'});
   for(let at=0;at<output.byteLength;at+=CHUNK){await controlCheckpoint(signal);const bytes=(await raster.read({exportId:output.id,revision:output.revision,offset:at,length:Math.min(CHUNK,output.byteLength-at)},{signal})).bytes;await sink.write(bytes);}
   checkAbort(signal);transfer=await sink.finish();requireDisplay(transfer.blob instanceof Blob&&transfer.blob.size===output.byteLength,'Rendered result transfer size differs.');checkAbort(signal);
   await artifacts.set(path,transfer.blob.slice(0,transfer.blob.size,'image/png'));
   const result={schema:BATCH_RESULT_DISPLAY_SCHEMA,version:2,mode:preferences.mode,opacity:preferences.opacity,width:record.width,height:record.height,scopeFingerprint:record.scopeFingerprint,sourceSha256:record.sourceSha256,scientificArrays:record.path??geometry.geometrySources[0].path,files:[path],pendingRendering:false,presentation:{cacheKey,operation:geometry?'render-existing-paired-native-biomes':'render-existing-scientific-counts',scientificValuesChanged:false,sourcePixelsChanged:false,...(biomeMetadata?{biomes:biomeMetadata}:{}),scientificPalette:array?.palette??displayed.palette??null,currentOpacity:preferences.opacity,maximum:displayed.metadata.maximum,methods:geometry?.methods??array.metadata.methods,previewAggregation:geometry?biomeMetadata.previewAggregation:displayed.metadata.previewAggregation},png:{byteLength:output.byteLength,sha256:output.sha256}};
   image.resultDisplay=result;return {...result,path,blob:await artifacts.get(path)};
  }finally{
   try{if(transfer)await transfer.cleanup?.();else await sink?.abort();}finally{releaseTransfer?.();try{if(output)await raster.release(output.id);}finally{await client?.dispose();}}
  }
 }
 return {
  describe(image){try{alive();const expected=identity(image,artifacts),record=records.get(image.id),native=record?.biomeValue,biomeCapability=native?{available:true,reason:null,methods:native.methods,groupCount:native.groupCount}:record?.biomeError?{available:false,reason:record.biomeError.message,methods:[],groupCount:0}:batchBiomeCapabilities(image,artifacts),capabilities={corroboration:{available:!!expected.path,reason:expected.path?null:'Aucune carte numérique de corroboration archivée.'},biomes:biomeCapability};let preferences=batchResultDisplayPreferences(image),reason;
   if(!capabilities[preferences.mode].available){reason=capabilities[preferences.mode].reason;preferences={...preferences,mode:capabilities.corroboration.available?'corroboration':'biomes'};}
   return {available:true,preferences,capabilities,...(reason?{reason}:{}),width:expected.width,height:expected.height,sourceSha256:expected.sourceSha256,scopeFingerprint:expected.scopeFingerprint};}catch(error){return {available:false,reason:error.message,code:error.code,capabilities:{corroboration:{available:false,reason:error.message},biomes:{available:false,reason:error.message,methods:[],groupCount:0}},preferences:batchResultDisplayPreferences({...image,displayPreferences:undefined})};}},
  preparePreview(image,options={}){return tracked(async()=>{const record=recordFor(image),signal=signalFor(options.signal);return using(record,async()=>{const value=await preview(record,{...options,signal}),geometry=await biomes(record,signal);checkAbort(signal);return {width:value.width,height:value.height,corroboration:value.buckets?{rgba:previewRgba(value.buckets,value.palette)}:null,biomes:geometry?{rgba:batchBiomePreview(geometry,{width:value.width,height:value.height,originalWidth:record.width,originalHeight:record.height},{signal,budget:new Budget(256*MiB)}),metadata:batchBiomeMetadata(geometry)}:null,metadata:{...value.metadata,capabilities:this.describe(image).capabilities,...(record.biomeError?{biomesUnavailable:record.biomeError.message}:{})}};});});},
  ensureRendered(image,{mode,opacity,signal}={}){return tracked(async()=>{const record=recordFor(image),preferences=batchResultDisplayPreferences(image,{...(mode===undefined?{}:{mode}),...(opacity===undefined?{}:{opacity})}),activeSignal=signalFor(signal);const next=record.renderQueue.then(()=>using(record,()=>full(image,record,preferences,activeSignal)));record.renderQueue=next.catch(()=>{});return next;});},
  snapshot(){return {openedCountArtifacts:[...records.values()].filter(r=>r.openedReady).length,cachedPreviewBytes:[...records.values()].reduce((n,r)=>n+(r.previewValue?.buckets.byteLength??0),0),retainedFullCountGrids:0,retainedPreviewRgbaBytes:0};},
  async dispose(){if(closed)return;closed=true;lifetime.abort();await Promise.allSettled([...pending]);records.clear();},
 };
}
