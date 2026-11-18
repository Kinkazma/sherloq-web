import "../../runtime-context.js?v=0.33.2";
import {mediaCodecJob} from './media-codec-client.js';
import {createBlobSource} from './blob-source.js';
import {sourcePrefixMetadataBytes} from './source-prefix-integrity.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {createRgbSurface} from './rgb-surface.js';
import {createRgb16Bank} from './rgb16-surface.js';
import {createOwnedNativeColorMetadata,replaceNativeColorMetadata} from './native-color-metadata.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {createExtendedImportRetirement} from './extended-import-retirement.js';
import {describeSourcePrecision} from './source-precision.js';
import {selectDecodedRepresentation} from './decoded-source-selection.js';
import {checkAbort,requireValue,EngineError} from './errors.js';
const MiB=1024**2;
export async function inspectExtendedImage(blob,{name=blob.name,budget,signal,sourceSha256}={}){
 const release=budget.reserve(64*MiB+blob.size*3);
 try{return await mediaCodecJob('decode',{blob,name,inspectOnly:true,sourceSha256},{signal});}finally{release();}
}
export async function loadExtendedImage(blob,{name=blob.name,layout='segmented',colorBackend='auto',budget,signal,onProgress,temporarySessionId,onTemporarySession,highPrecisionSource,genericCoder,allowHighPrecisionHandoff=true}={}){
 requireValue(['auto','cpu'].includes(colorBackend),'Invalid source color backend.');
 const hasCapturedSource=highPrecisionSource!==undefined,handoffEnabled=hasCapturedSource&&allowHighPrecisionHandoff;
 if(hasCapturedSource){
  requireValue(highPrecisionSource?.blob?.()===blob&&typeof highPrecisionSource.adoptIntegrity==='function'
   &&typeof highPrecisionSource.integrity==='function',
   'The HP handoff requires the captured encoded source.');
 }
 const manifestBytes=sourcePrefixMetadataBytes(blob.size);
 let base,encodedInput,seekableBandBytes;
 try{base=budget.reserve(65*MiB+blob.size*3+2*manifestBytes);}
 catch(error){
  if(!hasCapturedSource||error?.code!=='MEMORY_LIMIT')throw error;
  const admission=await import('./media-seekable-admission.js');
  const genericTiff=admission.genericTiffEvidence(genericCoder);
  const signature=await highPrecisionSource.read(0,Math.min(admission.seekableSignatureBytes,blob.size),{signal});
  let format;
  try{format=admission.seekableGenericFormat(signature.bytes,name,genericTiff);}finally{signature.release();}
  if(!format)throw error;
  const sha256=await highPrecisionSource.sha256({signal,onProgress:fraction=>onProgress?.({phase:'original-sha256',fraction})});
  const manifest=highPrecisionSource.integrity();
  requireValue(manifest?.sha256===sha256,'The seekable job requires the captured source identity.');
  if(format==='TIFF'){
   await admission.confirmSeekableTiff(highPrecisionSource,genericTiff,{signal,account:n=>budget.reserve(n)});
   // The worker will own its own verified range cache. Only the prefix identity
   // needs to survive the parent TIFF metadata check.
   highPrecisionSource.evictCachedRanges();
  }
  const plan=admission.planSeekableMedia({available:budget.limit-budget.total(),byteLength:blob.size,manifest,format});
  base=budget.reserve(plan.phaseBytes);
  seekableBandBytes=admission.seekableBandBytes;
  encodedInput={...plan,manifest,...(format==='TIFF'?{genericTiff}:{})};
 }
 let source=hasCapturedSource?null:createBlobSource(blob,{budget});
 let selection,manifestOwner,deferredRetirement=false;
 let workspace,fullLease,full,session,store,surface,nativeBank,nativeSurface,colorMetadata,header,written=0,admittedPixels=0,rgb8GridFinalized=false;
 async function ensureTemporarySession({signal:taskSignal}={}){checkAbort(taskSignal);if(!session){session=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;}
 async function nativeBanks(){
  if(nativeBank)return;const n=header.width*header.height;
  store=await createSegmentedBytes(n*3,{budget,storage:'auto',temporarySession:session,getTemporarySession:ensureTemporarySession,signal});
  nativeBank=await createRgb16Bank({width:header.width,height:header.height,orientation:header.orientationApplied?1:header.orientation??1,budget,storage:'auto',temporarySession:session,getTemporarySession:ensureTemporarySession,signal,sourceDepth:header.nativeSampleDepth??header.sourceDepth??header.depth??16,color:header.nativeColor??{},provenance:{decoder:header.decoder,sourceFormat:header.format,...(header.nativeSampleDepth!==undefined?{nativeSampleDepth:header.nativeSampleDepth,nativeSampleType:header.nativeSampleType,nativeSampleRole:header.nativeSampleRole,codedSourceDepth:header.codedDepth??header.sourceDepth,sourceSampleType:header.sourceSampleType}: {})}});
 }
 try{
  const start=performance.now();const result=await mediaCodecJob('decode',{blob,name,colorBackend,...(encodedInput?{encodedInput}:{})},{signal,onProgress,onRequest:async(action,value)=>{
   if(action==='decode-header'){
    requireValue(!header,'The source decoder already owns an admitted image.');header=value;const n=header.width*header.height;requireValue(Number.isSafeInteger(n*24)&&n>0,'Invalid image size.');admittedPixels=n;
    if(handoffEnabled&&header.rgb8GeometryOwner==='magick8-auto-orient/1'&&header.nativeDepth!==16
     &&header.nativeJpegVerified===undefined&&header.nativeTiffVerified===undefined){
     const representation=selectDecodedRepresentation({sourceSamples:header.sourceSamples});
     if(representation.kind==='high-precision'){
      selection=representation;
      return {action:'hp-source-handoff'};
     }
    }
    if(encodedInput){
     requireValue(header.rgb8GeometryOwner==='magick8-auto-orient/1'&&header.nativeDepth!==16,'Only the generic Q8 job uses this mounted input.');
     workspace=budget.reserve(seekableBandBytes);
     const fits=n*3<=budget.limit-budget.total();
     if(!fits)await ensureTemporarySession({signal});
     store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
     return {nativeBytes:encodedInput.heapBytes,retainOriginal:false};
    }
    source??=createBlobSource(blob,{budget});
    if(header.encodedInputCopies!==undefined){
     // The native PNG/TIFF16 owner keeps one JS encoded buffer. Reads into
     // libpng/libtiff use subarrays; those native buffers are admitted below.
     // Legacy readers keep their original allowance unless separately proved.
     requireValue(header.nativeDepth===16&&['png','tiff'].includes(header.format)&&header.encodedInputCopies===1,'Unqualified encoded input ownership.');base.split(blob.size*2)();
    }
    let nativeBytes=header.codecMemoryBytes??n*24+64*MiB;requireValue(Number.isSafeInteger(nativeBytes)&&nativeBytes>0,'Invalid native decoder workspace.');if(header.deferBanks){const available=Math.floor((budget.limit-budget.total()-4*MiB)/(16*MiB))*16*MiB;nativeBytes=Math.min(nativeBytes,available);requireValue(nativeBytes>=(header.minimumCodecMemoryBytes??nativeBytes),'The source codec minimum workspace does not fit the shared budget.');}workspace=budget.reserve(nativeBytes+4*MiB);
    if(header.nativeDepth===16){
     // Place each common bank according to the actual remaining budget. One
     // bank needing disk must not evict the other from still-available RAM.
     if(!header.deferBanks)await nativeBanks();
     return{nativeBytes,retainOriginal:false};
    }
    if(layout==='auto'&&n*3+blob.size+4*MiB<=budget.limit-budget.total()){
     fullLease=budget.reserve(n*3+blob.size);full=new Uint8Array(n*3);
    }else{
     const fits=n*3+4*MiB<=budget.limit-budget.total();if(!fits)await ensureTemporarySession({signal});
     store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
    }return{nativeBytes,retainOriginal:!!full};
   }
   if(selection)throw new EngineError('INVALID_INPUT','The HP handoff has no Q8 pixel destination.');
   if(action==='decode-residency'){
    requireValue(header?.deferBanks&&workspace&&!nativeBank&&Number.isSafeInteger(value.codecMemoryBytes)&&value.codecMemoryBytes>0&&value.codecMemoryBytes+4*MiB<=workspace.bytes,'Unexpected native decoder residency transition.');
    if(value.rawGeometry!==undefined){
     const g=value.rawGeometry,raw=g?.developmentGeometry?.rawGrid;
     requireValue(header.nativeColor?.sourceModel==='camera-raw'&&header.nativeSampleRole==='developed'&&header.nativeDepth===16&&g.owner==='libraw-developed-frame/1'&&written===0&&!store&&!full
      &&[g.width,g.height,raw?.width,raw?.height].every(n=>Number.isSafeInteger(n)&&n>0)
      &&Number.isSafeInteger(g.width*g.height*6)&&Number.isSafeInteger(raw.width*raw.height)
      &&g.developmentGeometry.outputSize.width===g.width&&g.developmentGeometry.outputSize.height===g.height,
      'Unexpected RAW developed frame before native bank admission.');
     Object.assign(header,{width:g.width,height:g.height,sourceWidth:g.width,
      sourceHeight:g.height,developmentGeometry:g.developmentGeometry,orientationApplied:true});
     admittedPixels=g.width*g.height;
    }
    const unused=workspace.bytes-value.codecMemoryBytes-4*MiB;if(unused)workspace.split(unused)();await nativeBanks();return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='decoded-preview'){
    requireValue(value?.pixels?.format==='rgb8'&&value.pixels.data instanceof Uint8Array&&value.pixels.data.length===value.pixels.width*value.pixels.height*3&&value.pixels.width*value.pixels.height<=4*1024**2,'Invalid owned SDR preview.');
    const o=value.orientation??1;if(o!==1){const p=value.pixels,w=p.width,h=p.height,d=new Uint8Array(p.data.length),ow=o>=5?h:w;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let dx=x,dy=y;switch(o){case 2:dx=w-1-x;break;case 3:dx=w-1-x;dy=h-1-y;break;case 4:dy=h-1-y;break;case 5:dx=y;dy=x;break;case 6:dx=h-1-y;dy=x;break;case 7:dx=h-1-y;dy=w-1-x;break;case 8:dx=y;dy=w-1-x;break;}d.set(p.data.subarray((y*w+x)*3,(y*w+x+1)*3),(dy*ow+dx)*3);}value={...value,orientation:1,pixels:{...p,width:ow,height:o>=5?w:h,data:d}};}
    onProgress?.({phase:'source-preview',preview:value});return{};
   }
   if(action==='native-profile'){
    requireValue(nativeBank&&value?.profileBytes instanceof Uint8Array,'Unexpected native profile.');header.nativeColor??={};Object.assign(header.nativeColor,{profileBytes:value.profileBytes,...value.color});return{};
   }
   if(action==='decoded-band'&&header?.rgb8GeometryOwner==='magick8-auto-orient/1'){
    if(!rgb8GridFinalized){
     const g=value.rgb8Geometry;requireValue(!nativeBank&&header.nativeDepth!==16&&(store||full)&&written===0&&(value.x??0)===0&&value.y===0&&g?.owner===header.rgb8GeometryOwner&&g.orientationApplied===true,'Unexpected generic RGB8 grid owner or first band.');
     requireValue([g.sourceWidth,g.sourceHeight,g.width,g.height].every(v=>Number.isSafeInteger(v)&&v>0)&&g.sourceWidth*g.sourceHeight===admittedPixels&&g.width*g.height===admittedPixels&&Number.isInteger(g.orientation)&&g.orientation>=1&&g.orientation<=8&&g.width===(g.orientation>=5?g.sourceHeight:g.sourceWidth)&&g.height===(g.orientation>=5?g.sourceWidth:g.sourceHeight)&&value.width===g.width,'Generic RGB8 grid exceeds its admitted geometry.');
     Object.assign(header,{sourceWidth:g.sourceWidth,sourceHeight:g.sourceHeight,width:g.width,height:g.height,orientation:g.orientation,orientationApplied:true});rgb8GridFinalized=true;
    }else requireValue(value.rgb8Geometry===undefined,'Generic RGB8 grid cannot change after pixels.');
   }else requireValue(value.rgb8Geometry===undefined,'Unexpected generic RGB8 grid metadata.');
   const x=value.x??0,width=value.width??header.width,y=value.y,rows=value.rows;requireValue(header&&Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Number.isSafeInteger(width)&&Number.isSafeInteger(rows)&&x>=0&&y>=0&&width>0&&rows>0&&x+width<=header.width&&y+rows<=header.height,'Unexpected decoded image rectangle.');
   if(action==='decoded-native-read-band'){
    requireValue(nativeBank,'No admitted native source bank.');const bytes=new Uint8Array(width*rows*6);for(let r=0;r<rows;r++)await nativeBank.store.readInto(bytes.subarray(r*width*6,(r+1)*width*6),((y+r)*header.width+x)*6,{signal});return{bytes};
   }
   if(action==='decoded-native-band'){requireValue(nativeBank&&value.bytes instanceof Uint8Array&&value.bytes.length===width*rows*6,'Unexpected native16 rectangle.');await nativeBank.writeBand({...value,x,width,data:value.bytes},{signal});return{};}
   requireValue(action==='decoded-band'&&(store||full)&&value.bytes instanceof Uint8Array&&value.bytes.length===width*rows*3,'Unexpected decoded image band.');
   if(!nativeBank)requireValue(x===0&&width===header.width&&y*header.width*3===written,'Out-of-order RGB8 decode.');
   for(let r=0;r<rows;r++){const from=value.bytes.subarray(r*width*3,(r+1)*width*3),offset=((y+r)*header.width+x)*3;if(full)full.set(from,offset);else await store.write(from,offset,{signal});}if(!nativeBank||value.pass===undefined||value.pass===(value.passes??1)-1)written+=value.bytes.length;return{};
  }});
  if(encodedInput){
   checkAbort(signal);
   requireValue(result.verifiedSourceSha256===encodedInput.manifest.sha256
    &&highPrecisionSource.integrity()===encodedInput.manifest,'The mounted decoder did not preserve its verified encoded identity.');
  }
  if(selection){
   const decoderReadMemory=genericCoder?.header?.format==='tiff'?(await import('./native-tiff-read-memory.js')).nativeTiffReadMemoryPlan(genericCoder.header,{encodedBytes:blob.size}):null;
   requireValue(result.kind==='hp-source-handoff'&&['rgb8GeometryOwner','sourceFormat','sourceWidth','sourceHeight','width','height','orientation']
    .every(key=>result.header?.[key]===header[key]),'The HP handoff differs from its admitted Ping.');
   if(encodedInput){
    base();
    return {kind:'hp-source-handoff',source:highPrecisionSource,header,selection,sha256:encodedInput.manifest.sha256,...(decoderReadMemory?{decoderReadMemory}:{})};
   }
   const manifest=result.sourceIntegrity;
   requireValue(manifest?.byteLength===blob.size&&manifest.chunkBytes===highPrecisionSource.chunkBytes
    &&manifest.states instanceof Uint8Array&&manifest.states.byteLength===manifestBytes,'The HP handoff has no admitted encoded identity.');
   manifestOwner={manifest,release:base.split(manifestBytes)};
   base();
   const adopted=await highPrecisionSource.adoptIntegrity(manifestOwner.manifest,{signal});
   requireValue(adopted!==0&&adopted!==false&&highPrecisionSource.integrity()===manifest,
    'The captured encoded source did not adopt the HP manifest.');
   manifestOwner.release();
   manifestOwner=null;
   return {kind:'hp-source-handoff',source:highPrecisionSource,header,selection,sha256:manifest.sha256,...(decoderReadMemory?{decoderReadMemory}:{})};
  }
  if(header.rgb8GeometryOwner==='magick8-auto-orient/1')requireValue(rgb8GridFinalized&&['sourceWidth','sourceHeight','width','height','orientation','orientationApplied','rgb8GeometryOwner'].every(key=>result.header?.[key]===header[key])&&result.provenance.orientationApplied===true&&result.provenance.orientation===header.orientation&&result.provenance.sourceSize?.[0]===header.sourceWidth&&result.provenance.sourceSize?.[1]===header.sourceHeight,'Completed generic RGB8 grid differs from its adopted header.');requireValue(written===header.width*header.height*3,'Incomplete decoded image.');await store?.flush();
  if(result.header?.nativeColor&&header.nativeColor)Object.assign(header.nativeColor,result.header.nativeColor);
  if(nativeBank){header.nativeColor??={};colorMetadata=await createOwnedNativeColorMetadata({color:header.nativeColor,provenance:result.provenance},{budget,signal,retention:'retain',reserve:bytes=>workspace.split(bytes)});replaceNativeColorMetadata(header.nativeColor,colorMetadata.color);result.provenance=colorMetadata.provenance;if(result.header)result.header.nativeColor=colorMetadata.color;}
  workspace();workspace=null;base();
  if(!encodedInput)requireValue(result.sourceIntegrity?.byteLength===blob.size,'Missing encoded identity from the native decoder.');
  const sha256=encodedInput?encodedInput.manifest.sha256:result.sourceIntegrity.sha256;checkAbort(signal);
  if(full){
   const bytes=result.originalBytes;requireValue(bytes instanceof Uint8Array&&bytes.length===blob.size,'Missing owned original bytes from the native decoder.');checkAbort(signal);const retainedBytes=full.length+bytes.length;
   fullLease();fullLease=null;budget.retain(retainedBytes);source.dispose();
   return{kind:'image',blob,bytes,pixels:{width:header.width,height:header.height,format:'rgb8',data:full},sha256,provenance:{...result.provenance,layout:'rgb',originalBytesPreserved:true},retainedBytes,metrics:{decodeMs:performance.now()-start,storage:'memory',codecLifetime:'isolated worker, terminated after decoding',originalBlobBytes:blob.size}};
  }
  if(!encodedInput)await source.adoptIntegrity(result.sourceIntegrity,{signal});
  surface=createRgbSurface(store,{width:header.width,height:header.height,orientation:header.orientationApplied?1:header.orientation??1,budget});if(nativeBank){nativeSurface=await nativeBank.seal({signal});colorMetadata?.attachToSurface(nativeSurface);}
  const sourcePrecision=describeSourcePrecision({header,provenance:result.provenance,nativeSurface:nativeSurface?.descriptor});
  return{kind:'image',segmented:true,source:encodedInput?highPrecisionSource:source,store,surface,nativeSurface,sourcePrecision,workingDepth:sourcePrecision.defaultWorkingDepth,get session(){return session;},ensureTemporarySession,sha256,provenance:{...result.provenance,layout:'paged-rgb',originalBytesPreserved:true,...(nativeSurface?{nativeDepth:16,displayDepth:8,colorDomains:'native samples retained separately; all RGB8 consumers receive the explicit SDR/profile projection'}:{})},retainedBytes:0,metrics:{...result.metrics,decodeMs:performance.now()-start,storage:store.storage,nativeStorage:nativeBank?.store.storage,temporaryBackend:session?.backend??null,codecLifetime:'isolated worker, terminated after decoding',originalBlobBytes:blob.size,...(encodedInput?{encodedBacking:'seekable'}:{})}};
 }catch(error){
  const retirement=createExtendedImportRetirement({upstreamOwner:error?.cleanupOwner,surface,store,nativeBank,colorMetadata,session,source,
   releaseCredits:()=>{full=null;workspace?.();workspace=null;fullLease?.();fullLease=null;manifestOwner?.release();manifestOwner=null;base();}});
  if(hasCapturedSource&&error?.cleanupOwner){
   deferredRetirement=true;
   throw withRetirementOwner(error,retirement,error.cleanupErrors?.at(-1)??error);
  }
  try{await retirement.dispose();}catch(cleanup){deferredRetirement=true;throw withRetirementOwner(error,retirement,cleanup);}throw error;
 }
 finally{if(!deferredRetirement){workspace?.();fullLease?.();base();}}
}
