import {Budget} from './unified-engine/src/cache.js';
import {createSegmentedBytes} from './unified-engine/src/segmented-bytes.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {createRasterExports} from './unified-engine/src/raster-export.js';
import {streamScientificNpz} from './unified-engine/src/scientific-npz-stream.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';
import {createExportSink} from './export-sink.js?v=0.24.0';

const MiB=1024**2,CHUNK=MiB;
const littleEndian=new Uint8Array(new Uint16Array([0x0102]).buffer)[0]===2;
export const BATCH_CORROBORATION_PALETTE=Object.freeze({
 schema:'sherloq.corroboration-palette/1',version:1,
 buckets:Object.freeze([
  Object.freeze({count:0,label:'original',rgb:Object.freeze([0,0,0]),opacity:0}),
  Object.freeze({count:1,label:'1 method',rgb:Object.freeze([40,135,235]),opacity:.35}),
  Object.freeze({count:2,label:'2 methods',rgb:Object.freeze([255,195,30]),opacity:.35}),
  Object.freeze({count:3,label:'3 or more methods',rgb:Object.freeze([235,60,50]),opacity:.35}),
 ]),
 meaning:'Exact number of distinct clone algorithms corroborating an original pixel; colors group values of 3 or more, while the scientific array preserves every integer.',
});
const invalid=message=>new EngineError('BATCH_CORROBORATION_INVALID',message);
function validatePalette(palette){
 requireValue(palette?.schema==='sherloq.corroboration-palette/1'&&Array.isArray(palette.buckets)&&palette.buckets.length===4,'Invalid corroboration palette.');
 for(let i=0;i<4;i++){const b=palette.buckets[i];requireValue(b.count===i&&Array.isArray(b.rgb)&&b.rgb.length===3&&b.rgb.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=255)&&Number.isFinite(b.opacity)&&b.opacity>=0&&b.opacity<=1,'Invalid corroboration color bucket.');}requireValue(palette.buckets[0].opacity===0,'Zero corroboration must preserve the exact original pixel.');
 return structuredClone(palette);
}
function preparation(scope){
 if(scope===undefined)return null;
 return {schema:scope.schema,version:scope.version,fingerprint:scope.fingerprint,sourceSha256:scope.sourceSha256,width:scope.width,height:scope.height,coordinates:scope.coordinates,status:scope.status,regions:structuredClone(scope.regions),excluded:structuredClone(scope.excluded),remainder:scope.remainder};
}
function sourceIdentity(image,client){
 const identities=[image.sourceSha256,image.preparation?.sourceSha256,client.source?.sha256].filter(v=>v!==undefined&&v!==null);
 if(!identities.length||identities.some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))||identities.some(v=>v!==identities[0]))throw invalid('Original scientific pixel identity is missing or inconsistent.');return identities[0];
}

/** Write the native raster/scientific store to a disk-backed Blob in narrow
 * pages. The artifact store owns the final file; the transfer file is deleted
 * immediately after artifactStore.set has committed, also after cancellation.
 */
async function commitStore(read,descriptor,path,artifacts,{budget,signal,sinkFactory}){
 const release=budget.reserve(Math.min(CHUNK,descriptor.byteLength));let sink,result,complete=false;
 try{
  sink=await sinkFactory({memoryBudgetBytes:0,signal,mime:descriptor.mime});
  for(let offset=0;offset<descriptor.byteLength;offset+=CHUNK){await controlCheckpoint(signal);const bytes=await read(offset,Math.min(CHUNK,descriptor.byteLength-offset));requireValue(bytes instanceof Uint8Array&&bytes.byteLength===Math.min(CHUNK,descriptor.byteLength-offset),'Scientific export page length mismatch.');await sink.write(bytes);}
  checkAbort(signal);result=await sink.finish();requireValue(result.blob instanceof Blob&&result.blob.size===descriptor.byteLength,'Scientific export transfer size mismatch.');await artifacts.set(path,result.blob.slice(0,result.blob.size,descriptor.mime));checkAbort(signal);complete=true;return path;
 }finally{try{if(result)await result.cleanup?.();else await sink?.abort();}finally{release();if(!complete)await artifacts.delete?.(path);}}
}

/** One native stripe traversal, uint32 on disk, then full-resolution libpng
 * and a streamed scientific NPZ. No full-frame Canvas, pixels or count grid
 * is retained in RAM. The caller keeps clone-entry leases alive until return.
 * dependencies is an injection seam for native qualification, not a UI knob.
 */
export async function renderBatchCorroboration({image,entries,context,client,artifacts,path,signal,methods,palette=BATCH_CORROBORATION_PALETTE,dependencies={}}){
 requireValue(image&&Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&Number.isSafeInteger(image.width*image.height*4),'Corroboration requires original image dimensions.');
 requireValue(Array.isArray(entries)&&context&&typeof context.corroborationStripes==='function'&&client?.source?.surface&&typeof client.readWindow==='function'&&typeof artifacts?.set==='function'&&typeof path==='string'&&path.length>0,'Corroboration export dependencies are missing.');checkAbort(signal);
 const width=image.width,height=image.height,source=client.source.surface;
 if(source.width!==width||source.height!==height||source.format!=='rgb8')throw invalid('Corroboration source dimensions or format differ from the original image.');
 const originalSha256=sourceIdentity(image,client),colors=validatePalette(palette),scope=preparation(image.preparation),declaredMethods=methods===undefined?[...new Set(entries.map(e=>e.methodKey??e.source))]:[...new Set(methods)];
 requireValue(declaredMethods.every(v=>typeof v==='string'&&v.length>0),'Corroboration method identities are invalid.');
 const budget=dependencies.budget??new Budget(256*MiB),sessionFactory=dependencies.sessionFactory??createTemporarySession,storeFactory=dependencies.storeFactory??createSegmentedBytes,rasterFactory=dependencies.rasterFactory??createRasterExports,npzFactory=dependencies.npzFactory??streamScientificNpz,sinkFactory=dependencies.sinkFactory??createExportSink;
 let session,counts,raster,png,npz,committed=false;const files=[];
 try{
  session=await sessionFactory({budget,signal});counts=await storeFactory(width*height*4,{budget,storage:'temporary',temporarySession:session,chunkBytes:CHUNK,signal,owner:'batch-corroboration',label:'native-corroboration-counts'});
  let nextRow=0,observedMaximum=0;
  const evidence=await context.corroborationStripes(entries,width,height,async strip=>{
   checkAbort(signal);if(strip.width!==width||strip.top!==nextRow||!Number.isSafeInteger(strip.height)||strip.height<=0||strip.top+strip.height>height||!(strip.values instanceof Uint32Array)||strip.values.length!==width*strip.height)throw invalid('Corroboration stripes overlap, miss rows or differ from the original image.');
   for(const value of strip.values){if(value>declaredMethods.length)throw invalid('A corroboration pixel exceeds the number of distinct algorithms.');observedMaximum=Math.max(observedMaximum,value);}
   if(littleEndian)await counts.write(new Uint8Array(strip.values.buffer,strip.values.byteOffset,strip.values.byteLength),strip.top*width*4);
   else{const release=budget.reserve(CHUNK);try{const bytes=new Uint8Array(CHUNK),view=new DataView(bytes.buffer);for(let first=0;first<strip.values.length;first+=CHUNK/4){const length=Math.min(CHUNK/4,strip.values.length-first);for(let i=0;i<length;i++)view.setUint32(i*4,strip.values[first+i],true);await counts.write(bytes.subarray(0,length*4),(strip.top*width+first)*4);}}finally{release();}}
   nextRow+=strip.height;
  },{scope:image.preparation,signal,methods:declaredMethods});
  if(nextRow!==height||evidence.maximum!==observedMaximum||JSON.stringify(evidence.methods)!==JSON.stringify(declaredMethods))throw invalid('The exported corroboration map differs from its native evidence summary.');await counts.flush();checkAbort(signal);
  const mode=declaredMethods.length>=2?'corroboration':'biomes',metadata={schema:'sherloq.batch-corroboration/1',version:1,mode,width,height,maximum:observedMaximum,methods:declaredMethods,activeMethods:evidence.activeMethods??declaredMethods,valueType:'uint32',valueMeaning:evidence.valueMeaning??'distinct clone algorithms corroborating this original pixel',coordinates:'original-pixels',array:{key:'corroboration',dtype:'<u4',shape:[height,width],order:'C',meaning:'One integer count per original pixel; never a probability or a fraud score.'},source:{imageId:image.id,name:image.name,originalSha256},scopeFingerprint:scope?.fingerprint??null,scope,evidencePreparation:evidence.evidencePreparation??null,palette:colors,display:{sourcePixels:'immutable',zeroPixels:'exact original RGB',nonzeroPixels:'RGB overlay only; scientific counts remain unchanged',blendRounding:'nearest integer; half values towards positive infinity',fullResolution:true},scientificArrays:path+'.npz',files:{visual:path+'.png',scientific:path+'.npz',metadata:path+'.json'}};
  raster=rasterFactory(budget);
  const surface={descriptor:{id:'batch-corroboration-'+crypto.randomUUID(),revision:1,width,height,format:'rgb8',storage:'temporary'},async readWindow(rect,{signal:readSignal}={}){
   checkAbort(readSignal??signal);const {x,y,width:w,height:h}=rect;
   requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Invalid corroboration visual window.');
   const release=budget.reserve(w*h*7);let complete=false;
   try{
    const original=await client.readWindow(source,rect);checkAbort(readSignal??signal);requireValue(original.data instanceof Uint8Array&&original.data.length===w*h*3&&original.width===w&&original.height===h,'Original RGB window dimensions differ from corroboration.');
    const data=new Uint8Array(original.data),bytes=new Uint8Array(w*h*4),view=new DataView(bytes.buffer);
    if(!x&&w===width)await counts.readInto(bytes,y*width*4);else for(let row=0;row<h;row++)await counts.readInto(bytes.subarray(row*w*4,(row+1)*w*4),((y+row)*width+x)*4);
    for(let i=0;i<w*h;i++){const count=view.getUint32(i*4,true);if(!count)continue;const color=colors.buckets[Math.min(3,count)],a=color.opacity;for(let c=0;c<3;c++)data[i*3+c]=Math.round(original.data[i*3+c]*(1-a)+color.rgb[c]*a);}
    complete=true;return {pixels:{width:w,height:h,format:'rgb8',data},release};
   }finally{if(!complete)release();}
  }};
  png=await raster.create(surface,{format:'png',storage:'temporary'},{signal,imageId:image.id,originalSha256,...(dependencies.wasmBinary?{wasmBinary:dependencies.wasmBinary}:{})});
  files.push(await commitStore(async(offset,length)=>(await raster.read({exportId:png.id,revision:png.revision,offset,length},{signal})).bytes,png,path+'.png',artifacts,{budget,signal,sinkFactory}));
  const paletteRGB=Uint8Array.from(colors.buckets.flatMap(b=>b.rgb)),paletteValues=Uint32Array.from(colors.buckets.map(b=>b.count)),paletteAlpha=Float64Array.from(colors.buckets.map(b=>b.opacity));
  const array=(key,data,descr,shape)=>({key,descr,shape,count:data.length,elementBytes:data.BYTES_PER_ELEMENT,read(out,first,length){if(littleEndian||data.BYTES_PER_ELEMENT===1)out.set(new Uint8Array(data.buffer,data.byteOffset+first*data.BYTES_PER_ELEMENT,length*data.BYTES_PER_ELEMENT));else{const v=new DataView(out.buffer,out.byteOffset,out.byteLength);for(let i=0;i<length;i++)if(data instanceof Float64Array)v.setFloat64(i*8,data[first+i],true);else v.setUint32(i*4,data[first+i],true);}}});
  const {files:externalFiles,scientificArrays:externalScientific,...scientificMetadata}=metadata;
  npz=await npzFactory([{key:'corroboration',descr:'<u4',shape:[height,width],count:width*height,elementBytes:4,read:(out,first)=>counts.readInto(out,first*4)},array('palette_rgb',paletteRGB,'|u1',[4,3]),array('palette_counts',paletteValues,'<u4',[4]),array('palette_opacity',paletteAlpha,'<f8',[4])],{...scientificMetadata,filePointers:'external JSON or batch manifest'},{originalSha256,operation:'batch.clone-corroboration',coordinates:'original-pixels',scopeFingerprint:scope?.fingerprint??null},{storage:'temporary',progressPhase:'batch-corroboration-npz'},{budget,signal});
  const buffer=new Uint8Array(Math.min(CHUNK,npz.byteLength)),releaseBuffer=budget.reserve(buffer.byteLength);
  try{files.push(await commitStore(async(offset,length)=>{const bytes=buffer.subarray(0,length);await npz.store.readInto(bytes,offset);return bytes;},{byteLength:npz.byteLength,mime:npz.mime},path+'.npz',artifacts,{budget,signal,sinkFactory}));}finally{releaseBuffer();}
  metadata.png={byteLength:png.byteLength,sha256:png.sha256,provenance:png.provenance,metrics:png.metrics};metadata.npz={byteLength:npz.byteLength,sha256:npz.sha256,metrics:npz.metrics};
  checkAbort(signal);await artifacts.set(path+'.json',new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'}));files.push(path+'.json');checkAbort(signal);committed=true;
  return {...metadata,files,metrics:{memory:budget.snapshot(),countStorage:counts.storage,corroborationPasses:1,sourceRasterPasses:1,maximumExportPageBytes:CHUNK}};
 }finally{
  if(!committed)for(const file of files)await artifacts.delete?.(file);
  try{if(png)await raster.release(png.id);}finally{try{await npz?.store?.dispose();}finally{try{await npz?.session?.dispose();}finally{try{await counts?.dispose();}finally{await session?.dispose();}}}}
 }
}
