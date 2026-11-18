import "../../runtime-context.js?v=0.33.2";
import {Budget} from './cache.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {createCachedEncodedSource,mountEncodedSource} from './encoded-source.js';
import {parseSourceFacts} from './magick-ping-facts.js';
import {seekableGenericFormat,seekableSignatureBytes,seekableBandBytes,validateSeekableMedia} from './media-seekable-admission.js';
import {createSourcePrefixVerifier} from './source-prefix-integrity.js';
import {EngineError,requireValue} from './errors.js';

export async function decodeSeekable({blob,name,encodedInput,inspectOnly,magick,decodeGeneric}){
 requireValue(!inspectOnly,'The seekable media job prepares the admitted import.');
 if(typeof FileReaderSync!=='function')throw new EngineError('SYNC_INPUT_UNAVAILABLE','The worker has no synchronous file reader.');
 const {manifest,cacheBytes,heapBytes,genericTiff}=encodedInput;
 validateSeekableMedia(encodedInput,manifest,blob.size);
 const verifier=await createSourcePrefixVerifier(manifest);
 const reader=new FileReaderSync();
 const input=createCachedEncodedSource({byteLength:blob.size,cacheBytes,budget:new Budget(2*cacheBytes),owner:'media-seekable-input',
  readChunk(offset,length){
   const buffer=reader.readAsArrayBuffer(blob.slice(offset,offset+length));
   verifier.verifyRangeSync(offset,new Uint8Array(buffer),()=>{throw new EngineError('SOURCE_CHANGED','An unverified file slice entered the decoder.');});
   return buffer;
  }});
 let unmount,retireMount,failed=false,primary;
 try{
  const bytes=new Uint8Array(Math.min(seekableSignatureBytes,blob.size));
  requireValue(input.readInto(bytes,0)===bytes.length,'Incomplete verified media signature.');
  const format=seekableGenericFormat(bytes,name,genericTiff);
  if(!format||format!==encodedInput.format)throw new EngineError('SOURCE_CHANGED','The verified media coder differs from its admission.');
  const m=await magick(resource=>boundWasmMemory(resource,heapBytes));
  m.ResourceLimits.memory=BigInt(heapBytes);
  m.ResourceLimits.maxMemoryRequest=BigInt(heapBytes);
  try{
   unmount=mountEncodedSource(m.ImageMagick._api.FS,input);
   retireMount=unmount;
  }catch(error){
   if(error?.cleanupOwner)retireMount=()=>error.cleanupOwner.dispose();
   throw error;
  }
  const settings=new m.MagickReadSettings({format:m.MagickFormat[format]??format,frameIndex:0,frameCount:1});
  const imageInput='/native-source/original';
  const image=m.MagickImage.create();
  let info;
  try{
   image.ping(imageInput,settings);
   let sourceSamples=null,sourceSamplesLimitation='decoder-source-metadata-unavailable';
   const artifact=image.getArtifact('sherloq:source-samples');
   if(artifact!=null)try{
    sourceSamples=parseSourceFacts(artifact);
    sourceSamplesLimitation=sourceSamples.selection.metadataComplete?null:'decoder-source-metadata-incomplete';
   }catch{sourceSamplesLimitation='decoder-source-metadata-invalid';}
   info={width:image.width,height:image.height,orientation:image.orientation,sourceSamples,sourceSamplesLimitation};
  }finally{image.dispose();}
  if(unmount.failed)throw unmount.failure;
  const managedTiff=genericTiff?.photometric===5&&genericTiff.samples===4?genericTiff:undefined;
  const result=await decodeGeneric({m,settings,info,imageInput,bytes,name,format,manifest,managedTiff,seekableHeapBytes:heapBytes,bandBytes:seekableBandBytes,encodedSource:input});
  if(unmount.failed)throw unmount.failure;
  return result;
 }catch(error){
  failed=true;
  primary=unmount?.failed?unmount.failure:error;
  throw primary;
 }finally{
  try{await retireMount?.();await input.dispose();}
  catch(error){
   if(!failed)throw error;
   if(primary&&typeof primary==='object')try{(primary.cleanupErrors??=[]).push({code:error?.code,message:String(error?.message??error)});}catch{}
  }
 }
}

