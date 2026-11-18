import "../../runtime-context.js?v=0.33.2";
import {rawDemosaicCfa} from './raw-demosaic-contract.js';
import {unsignedWasm32Pointer} from './memory-range.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {readVerifiedRawResource} from './raw-native-resource.js';
const MiB=1024**2,PAGE=65536,MAXIMUM=2**32;
export const RAW_WORKING_SPACES=Object.freeze({'camera-linear':0,'srgb-linear':1,'adobe-rgb-linear':2,'wide-gamut-d65-linear':3,'prophoto-d65-linear':4,'aces-linear':6,'display-p3-linear':7,'rec2020-linear':8});
export function nativeRawProcessing(value={}){
 requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['workingColorSpace','cameraWhiteBalance','demosaic'].includes(k)),'Unknown native RAW processing option.');
 const p={workingColorSpace:'prophoto-d65-linear',cameraWhiteBalance:true,demosaic:3,...value};requireValue(Object.hasOwn(RAW_WORKING_SPACES,p.workingColorSpace)&&typeof p.cameraWhiteBalance==='boolean'&&Number.isSafeInteger(p.demosaic)&&p.demosaic>=0&&p.demosaic<=12,'Invalid native RAW processing option.');return p;
}
export function nativeRawMemoryPlan(header,encodedBytes,processing){
 const {rawWidth,rawHeight,sourceWidth,sourceHeight}=header??{};requireValue([rawWidth,rawHeight,sourceWidth,sourceHeight,encodedBytes].every(n=>Number.isSafeInteger(n)&&n>0),'Native RAW dimensions and encoded byte length required.');
 // LibRaw0.22.2 dcb() keeps two float[RGB] planes concurrently (dcb_demosaic.cpp855/858/870).
 // Bound them by the same physical/active geometry used by the legacy plan;
 // no extra plane is requested for the unchanged default/AHD/bilinear paths.
 const pixels=Math.max(rawWidth*rawHeight,sourceWidth*sourceHeight),selected=processing===undefined?null:nativeRawProcessing(processing),
  demosaicWorkspaceBytes=selected?.demosaic===4?pixels*2*3*Float32Array.BYTES_PER_ELEMENT:0,
  nativeBytes=Math.ceil((encodedBytes+pixels*18+64*MiB+demosaicWorkspaceBytes)/(16*MiB))*16*MiB;
 requireValue(Number.isSafeInteger(pixels)&&Number.isSafeInteger(nativeBytes),'Native RAW memory arithmetic exceeds its safe range.');if(nativeBytes>MAXIMUM)throw new EngineError('MEMORY_LIMIT','The native RAW workspace exceeds the WebAssembly address range.');
 const width=header.flip&4?sourceHeight:sourceWidth,rowsPerChunk=Math.max(1,Math.min(32,Math.floor(MiB/(width*6))));return{heapMaximumBytes:nativeBytes,encodedWorkspaceBytes:encodedBytes,rowsPerChunk,maximumRgbBandBytes:width*rowsPerChunk*6,sensorMaximumBandBytes:MiB,decodedNativeBytes:sourceWidth*sourceHeight*6,...(demosaicWorkspaceBytes?{demosaic:4,additionalDemosaicWorkspaceBytes:demosaicWorkspaceBytes}:{})};
}
// Every JavaScript heap access consumes an unsigned address validated against
// the current buffer. A Wasm grow may replace that buffer between native calls.
const nativeRange=(m,value,length,options)=>unsignedWasm32Pointer(value,m.HEAPU8.byteLength,length,options);
const nativeBytes=(m,value,length)=>{const heap=m.HEAPU8,pointer=unsignedWasm32Pointer(value,heap.byteLength,length);return heap.slice(pointer,pointer+length);};
const nativeString=(m,value)=>{const heap=m.HEAPU8,pointer=unsignedWasm32Pointer(value,heap.byteLength,value===0?0:1,{allowZero:true});return m.UTF8ToString(pointer,heap.byteLength-pointer);};
async function defaultFactory(){return(await import('../vendor/libraw-native/libraw-native.js')).default;}
async function openRaw(payload,hooks){
 const {blob,maximumMemoryBytes,sourceSha256}=payload??{},signal=hooks.signal;requireValue(blob&&typeof blob.arrayBuffer==='function'&&Number.isSafeInteger(blob.size)&&blob.size>0,'An owned RAW Blob is required.');
 requireValue(Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>=16*MiB&&maximumMemoryBytes<=MAXIMUM&&maximumMemoryBytes%PAGE===0,'An admitted, page-aligned native RAW memory maximum is required.');checkAbort(signal);
 const encoded=new Uint8Array(await blob.arrayBuffer());checkAbort(signal);requireValue(encoded.byteLength===blob.size,'RAW source size changed during reading.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)),n=>n.toString(16).padStart(2,'0')).join('');checkAbort(signal);
 if(sourceSha256!==undefined){requireValue(typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(sourceSha256),'Invalid RAW source identity.');if(hash!==sourceSha256.toLowerCase())throw new EngineError('SOURCE_CHANGED','The RAW bytes differ from the loaded original source.');}
 if(encoded.length+16*MiB>maximumMemoryBytes)throw new EngineError('MEMORY_LIMIT','The RAW encoded input does not fit its admitted workspace.');
 let m,pointer=0,closed=false;
 const close=()=>{if(closed)return;closed=true;try{m?._raw_native_close();}finally{if(pointer)m?._free(pointer);pointer=0;m=null;}};
 try{
  const create=hooks.moduleFactory??await defaultFactory(),wasmBinary=await(hooks.readResource??readVerifiedRawResource)({signal}),wasmMemory=new WebAssembly.Memory({initial:256,maximum:maximumMemoryBytes/PAGE});checkAbort(signal);
  let lastPhase=-1,lastProgress=0;
  m=await create({wasmMemory,wasmBinary,...(hooks.abortFlag?{rawAbortFlag:hooks.abortFlag}:{}),rawProgress(phase,iteration,expected){checkAbort(signal);const now=performance.now();if(phase!==lastPhase||iteration>=expected-1||now-lastProgress>=40){lastPhase=phase;lastProgress=now;hooks.onProgress?.({phase:'decode-camera-raw',nativePhase:phase,iteration,expected});}}});
  // Emscripten does not export its internal typed heap in production builds.
  // The imported memory belongs to this owner and remains valid after growth.
  if(!m.HEAPU8)Object.defineProperty(m,'HEAPU8',{get:()=>new Uint8Array(wasmMemory.buffer)});
  pointer=m._malloc(encoded.length);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','Native RAW input allocation failed.');pointer=nativeRange(m,pointer,encoded.length);m.HEAPU8.set(encoded,pointer);
  const check=ok=>{checkAbort(signal);if(!ok){const code=m._raw_native_error();throw new EngineError(code===-100007?'MEMORY_ALLOCATION':code===-100010?'CANCELLED':'RAW_DECODE_FAILED',nativeString(m,m._raw_native_error_message())||'Native RAW decoding failed.',{details:{nativeCode:code}});}return ok;};
  const open=payload.sensorOnly?m._raw_native_open_sensor:m._raw_native_open;requireValue(typeof open==='function','The admitted RAW decoder has no requested opening mode.');check(open(pointer,encoded.length,Math.floor(maximumMemoryBytes/MiB)));const metadata=JSON.parse(nativeString(m,m._raw_native_metadata()));return{m,check,close,metadata,sourceSha256:hash,encodedWorkspaceBytes:encoded.length,maximumMemoryBytes};
 }catch(error){close();throw error;}
}
function plannedDevelopmentGrid(metadata){
 const crop=metadata.rawInsetCrops?.[0],w=metadata.sourceWidth,h=metadata.sourceHeight;
 // This predicts LibRaw0.22.2's default mask1/maxcrop0.55 for the display-only
 // preview. The useful Read still establishes the final developed grid.
 const valid=crop&&[crop.x,crop.y,crop.width,crop.height].every(Number.isSafeInteger)
  &&crop.x>=0&&crop.y>=0&&crop.x<65535&&crop.y<65535
  &&crop.x+crop.width<=metadata.rawWidth&&crop.y+crop.height<=metadata.rawHeight
  &&crop.width>=Math.trunc(w*.55)&&crop.height>=Math.trunc(h*.55);
 return valid?{x:crop.x,y:crop.y,width:crop.width,height:crop.height}:{x:metadata.leftMargin,y:metadata.topMargin,width:w,height:h};
}
export async function inspectCameraRaw(payload,hooks={}){
 const owner=await openRaw(payload,hooks);try{const d=owner.metadata,g=plannedDevelopmentGrid(d);return{...d,sourceWidth:g.width,sourceHeight:g.height,width:d.flip&4?g.height:g.width,height:d.flip&4?g.width:g.height,
  developmentPreviewGrid:g,uncroppedActiveGrid:{x:d.leftMargin,y:d.topMargin,width:d.sourceWidth,height:d.sourceHeight},
  sourceSha256:owner.sourceSha256,memoryPlan:nativeRawMemoryPlan(d,owner.encodedWorkspaceBytes),previewUsed:false};}finally{owner.close();}
}
export async function decodeCameraRaw(payload,hooks={}){
 const processing=nativeRawProcessing(payload?.processing),includeSensor=payload?.includeSensor===true;requireValue(payload?.includeSensor===undefined||typeof payload.includeSensor==='boolean','Invalid RAW sensor retention option.');requireValue(typeof hooks.onHeader==='function'&&typeof hooks.onBand==='function'&&(!includeSensor||typeof hooks.onSensorBand==='function'),'Native RAW header and band owners are required.');
 const owner=await openRaw(payload,hooks),{m,check,metadata}=owner,signal=hooks.signal,cooperate=createCooperator(signal);let bandPointer=0,maximumBandBytes=0,peak=m.HEAPU8.buffer.byteLength,sensor;
 const allocate=n=>{if(n>maximumBandBytes){if(bandPointer)m._free(bandPointer);maximumBandBytes=n;bandPointer=m._malloc(n);if(!bandPointer)throw new EngineError('MEMORY_ALLOCATION','Native RAW row staging allocation failed.');bandPointer=nativeRange(m,bandPointer,n);}return bandPointer;};
 try{
  await hooks.onMetadata?.({...metadata,sourceSha256:owner.sourceSha256,memoryPlan:nativeRawMemoryPlan(metadata,owner.encodedWorkspaceBytes)});checkAbort(signal);
  if(hooks.onThumbnail&&m._raw_native_unpack_thumbnail()){const size=m._raw_native_thumbnail_size(),pointer=m._raw_native_thumbnail_data();if(size>0&&pointer!==0&&size<=owner.maximumMemoryBytes)await hooks.onThumbnail({bytes:nativeBytes(m,pointer,size),width:m._raw_native_thumbnail_width(),height:m._raw_native_thumbnail_height(),librawFlip:metadata.flip,orientationApplied:false,previewOnly:true});}
  checkAbort(signal);check(m._raw_native_unpack());
  if(includeSensor){const channels=m._raw_native_sensor_channels(),floating=m._raw_native_sensor_float()===1;requireValue(channels>0,'This RAW decoder has no supported native sensor bank.');const bytesPerSample=floating?4:2,rowBytes=metadata.rawWidth*channels*bytesPerSample,rows=Math.max(1,Math.min(32,Math.floor(MiB/rowBytes)));sensor={width:metadata.rawWidth,height:metadata.rawHeight,channels,format:floating?'float32':'uint16',sourceBitDepth:metadata.sourceBitDepth,rawSensor:true};await hooks.onSensorHeader?.(sensor);
   for(let y=0;y<sensor.height;y+=rows){await cooperate();const count=Math.min(rows,sensor.height-y),length=rowBytes*count,p=allocate(length);requireValue(m._raw_native_sensor_rows(y,count,p)===length,'Native RAW sensor rows differ from their declared shape.');const bytes=nativeBytes(m,p,length);await hooks.onSensorBand({bytes,y,rows:count,...sensor,byteOrder:'little-endian'});checkAbort(signal);peak=Math.max(peak,m.HEAPU8.buffer.byteLength);}
  }
  const selectedInset=m._raw_native_apply_vendor_crop();requireValue(Number.isInteger(selectedInset)&&selectedInset>=0&&selectedInset<=2,'Invalid native RAW development crop.');
  check(m._raw_native_process(RAW_WORKING_SPACES[processing.workingColorSpace],Number(processing.cameraWhiteBalance),processing.demosaic));const width=m._raw_native_width(),height=m._raw_native_height();requireValue(width>0&&height>0&&Number.isSafeInteger(width*height*6),'Invalid developed RAW grid.');
  const origin=selectedInset?metadata.rawInsetCrops[selectedInset-1]:{x:metadata.leftMargin,y:metadata.topMargin},
   developmentGeometry={policy:selectedInset?'libraw-vendor-inset':'libraw-active-area',selectedInset,
    rawGrid:{width:metadata.rawWidth,height:metadata.rawHeight,orientation:1},
    originalActiveGrid:{x:metadata.leftMargin,y:metadata.topMargin,width:metadata.sourceWidth,height:metadata.sourceHeight},
    rawOrigin:{x:origin.x,y:origin.y},unorientedSize:{width:metadata.flip&4?height:width,height:metadata.flip&4?width:height},
    outputSize:{width,height},librawFlip:metadata.flip,orientationApplied:true,
    sensorSamplesCropped:false,development:'demosaic over LibRaw selected active frame; interpolation uses neighbouring sensor samples'};
  const profilePointer=m._raw_native_profile_data(),profileBytes=m._raw_native_profile_size();requireValue(profileBytes===0||profileBytes>=128&&profileBytes<=1024,'Invalid LibRaw working profile extent.');const workingProfileBytes=profileBytes?nativeBytes(m,profilePointer,profileBytes):null;
  const header={format:'rgb16',bitDepth:16,analysisDepth:16,width,height,sourceWidth:width,sourceHeight:height,sourceBitDepth:metadata.sourceBitDepth,sourceSha256:owner.sourceSha256,workingColorSpace:processing.workingColorSpace,workingProfileBytes,orientationApplied:true,librawFlip:metadata.flip,linear:true,rawMetadata:metadata,developmentGeometry,thumbnailUsed:false};await hooks.onHeader(header);checkAbort(signal);
  const rowBytes=width*6,rows=Math.max(1,Math.min(32,Math.floor(MiB/rowBytes)));let bands=0;
  for(let y=0;y<height;y+=rows){await cooperate();const count=Math.min(rows,height-y),length=rowBytes*count,p=allocate(length);requireValue(m._raw_native_rows(y,count,p)===width*count*3,'Native RAW output rows differ from their declared shape.');const bytes=nativeBytes(m,p,length);await hooks.onBand({bytes,y,rows:count,width,format:'rgb16',bitDepth:16,byteOrder:'little-endian'});checkAbort(signal);peak=Math.max(peak,m.HEAPU8.buffer.byteLength);bands++;hooks.onProgress?.({phase:'store-camera-raw16',fraction:(y+count)/height});}
  return{header,sensor,provenance:{decoder:'LibRaw-'+nativeString(m,m._raw_native_version()),sourceSha256:owner.sourceSha256,sourceBitDepth:metadata.sourceBitDepth,analysisDepth:16,linear:true,workingColorSpace:processing.workingColorSpace,workingProfile:'LibRaw generated ICC; exact matrix and linear transfer',thumbnailUsed:false,autoBright:false,highlightMode:'standard-clip',developmentGeometry,halfSize:false,demosaic:processing.demosaic,cameraWhiteBalance:processing.cameraWhiteBalance,warnings:m._raw_native_warnings()},metrics:{bands,maximumBandBytes,codecHeapCapacityBytes:Math.max(peak,m.HEAPU8.buffer.byteLength),codecHeapMaximumBytes:owner.maximumMemoryBytes,encodedWorkspaceBytes:owner.encodedWorkspaceBytes}};
 }finally{try{if(bandPointer)m._free(bandPointer);}finally{owner.close();}}
}
export async function readCameraRawThumbnail(payload,hooks={}){
 const owner=await openRaw(payload,hooks),{m,check}=owner;try{check(m._raw_native_unpack_thumbnail());const size=m._raw_native_thumbnail_size(),pointer=m._raw_native_thumbnail_data(),kind=m._raw_native_thumbnail_format();requireValue(size>0&&pointer!==0&&size<=owner.maximumMemoryBytes,'Invalid RAW embedded preview extent.');const bytes=nativeBytes(m,pointer,size);return{bytes,width:m._raw_native_thumbnail_width(),height:m._raw_native_thumbnail_height(),nativeThumbnailFormat:kind,mime:bytes[0]===255&&bytes[1]===216?'image/jpeg':null,librawFlip:owner.metadata.flip,orientationApplied:false,sourceSha256:owner.sourceSha256,previewOnly:true,scientificSource:false};}finally{owner.close();}
}

// Metadata is produced inside the admitted codec heap. The serialized bound
// covers all exported black-pattern arrays and fixed-size matrices. Before a
// JavaScript string/parsed object or transport clone exists, its separate owner
// admits two MiB for strings, number arrays, object nodes and publication overlap.
export const RAW_SENSOR_METADATA_MAXIMUM_BYTES=256*1024;
export function nativeRawSensorMetadataPlan(serializedBytes){
 requireValue(Number.isSafeInteger(serializedBytes)&&serializedBytes>0&&serializedBytes<=RAW_SENSOR_METADATA_MAXIMUM_BYTES,'Sensor metadata exceeds its admitted extent.');
 return Object.freeze({serializedBytes,maximumRetainedBytes:2*MiB,schema:'raw-sensor-post-unpack/1'});
}
/** Sensor-only producer, inactive in normal image imports. The common source
 * samples service owns codec, separately admitted metadata and outgoing bands.
 * This is not a second public reading/lease API. */
export async function readCameraRawSensor(payload,hooks={}){
 requireValue(payload?.frame===undefined||payload.frame===0,'Only the explicitly qualified RAW frame0 is available.');
 requireValue(typeof hooks.onSensorHeader==='function'&&typeof hooks.onSensorBand==='function'&&typeof hooks.admitSensorMetadata==='function','Native sensor header, band and metadata admission owners are required.');
 const owner=await openRaw({...payload,sensorOnly:true},hooks),{m,check}=owner,signal=hooks.signal,cooperate=createCooperator(signal);let pointer=0,maximumBandBytes=0,bands=0,peak=m.HEAPU8.buffer.byteLength;
 try{
  check(m._raw_native_unpack());const metadataReturn=m._raw_native_sensor_metadata();requireValue(metadataReturn!==0,'The decoder has no complete post-unpack sensor metadata.');const metadataPointer=nativeRange(m,metadataReturn,1);
  const metadataPlan=nativeRawSensorMetadataPlan(m._raw_native_sensor_metadata_size()),metadataEnd=metadataPointer+metadataPlan.serializedBytes,heap=m.HEAPU8;nativeRange(m,metadataPointer,metadataPlan.serializedBytes+1);
  requireValue(Number.isSafeInteger(metadataEnd)&&metadataEnd<heap.byteLength&&heap[metadataEnd]===0,'Sensor metadata lies outside its admitted codec heap.');checkAbort(signal);
  const admitted=await hooks.admitSensorMetadata(metadataPlan);requireValue(admitted!==false&&admitted!==0,'Sensor metadata owner did not acknowledge admission.');checkAbort(signal);
  const text=m.UTF8ToString(metadataPointer,metadataPlan.serializedBytes),metadata=JSON.parse(text);
  requireValue(['uint16','float32'].includes(metadata.sampleType)&&[1,3,4].includes(metadata.channels)&&[metadata.width,metadata.height].every(v=>Number.isSafeInteger(v)&&v>0)&&metadata.decoding.floatToInteger===false,'Invalid preserved post-unpack sensor contract.');
  metadata.sourceSha256=owner.sourceSha256;metadata.domain='sensor';metadata.sampleModel='raw-decoded-sensor';
  metadata.rawDemosaic=rawDemosaicCfa(owner.metadata);
  await hooks.onSensorHeader(metadata);checkAbort(signal);
  const sampleBytes=metadata.sampleType==='float32'?4:2,rowBytes=metadata.width*metadata.channels*sampleBytes;requireValue(Number.isSafeInteger(rowBytes)&&Number.isSafeInteger(rowBytes*metadata.height),'Sensor byte geometry exceeds its safe extent.');const rows=Math.max(1,Math.min(32,Math.floor(MiB/rowBytes)));
  for(let y=0;y<metadata.height;y+=rows){await cooperate();const count=Math.min(rows,metadata.height-y),length=rowBytes*count;
   if(length>maximumBandBytes){if(pointer)m._free(pointer);pointer=m._malloc(length);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','Sensor row staging allocation failed.');pointer=nativeRange(m,pointer,length);maximumBandBytes=length;}
   requireValue(m._raw_native_sensor_rows(y,count,pointer)===length,'The preserved sensor band differs from its post-unpack geometry.');
   const bytes=nativeBytes(m,pointer,length);await hooks.onSensorBand({bytes,y,rows:count,width:metadata.width,channels:metadata.channels,sampleType:metadata.sampleType,byteOrder:'little-endian'});checkAbort(signal);bands++;peak=Math.max(peak,m.HEAPU8.buffer.byteLength);
  }
  return{metadata,metrics:{bands,maximumBandBytes,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:owner.maximumMemoryBytes,sensorOnly:true}};
 }finally{try{if(pointer)m._free(pointer);}finally{owner.close();}}
}
