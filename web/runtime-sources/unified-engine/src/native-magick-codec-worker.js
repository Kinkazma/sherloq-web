import "../../runtime-context.js?v=0.33.3";
// The preparation codec produces samples for the existing Original-owned A/B.
import {createNativeMagickDecoder}from'./native-magick-runtime.js';
import {encodedBytesSource,createCachedEncodedSource}from'./encoded-source.js';
import {createWorkerCacheBridge}from'./native-magick-worker-cache.js';
import {Budget}from'./cache.js';
import {createSourcePrefixVerifier}from'./source-prefix-integrity.js';
import {EngineError,checkAbort,requireValue,serializeEngineError,deserializeEngineError}from'./errors.js';
import {readVerifiedMediaResource} from './media-resource-integrity.js';
import {nativeMagickResource} from './native-magick-resources.js';
const encode=v=>v===null||['undefined','boolean','number','string'].includes(typeof v)?{primitive:true,type:typeof v,...(v===undefined?{}:{value:v})}:{engine:serializeEngineError(v)};
const decode=v=>v?.primitive?v.type==='undefined'?undefined:v.value:deserializeEngineError(v.engine);
let serial=0,pending,queue=Promise.resolve(),flight,controller,abortFlag,decoder,input,inputBudget,closed=false,nativeRetired=false,constructorStarted=false;
const fatal=error=>{queueMicrotask(()=>{throw error instanceof Error?error:new Error('Codec transport failed.',{cause:error});});};
const post=(value,transfer=[])=>self.postMessage(value,transfer);
function request(action,value,transfer=[]){
 const run=()=>new Promise((resolve,reject)=>{
  if(closed){reject(new EngineError('CLOSED','The HP codec is retired.'));return;}
  const id=++serial;pending={id,resolve,reject};try{post({kind:'request',id,action,value},transfer);}catch(error){pending=null;reject(error);}
 });
 const next=queue.then(run,run);queue=next;return next;
}
const signal=()=>({get aborted(){return controller.signal.aborted||!!(abortFlag&&Atomics.load(abortFlag,0));}});
const abort=()=>controller?.abort();
async function prepare(payload){
 const{preflight,sourceIntegrity,resource,admission}=payload;
 const pinnedResource = nativeMagickResource(resource?.quantumDepth);
 requireValue(resource.wasmBytes === pinnedResource.wasmBytes && resource.wasmSha256 === pinnedResource.wasmSha256,
  'The native Magick resource differs from the admitted identity.');
 requireValue(preflight?.sourceSha256===payload.sourceSha256&&sourceIntegrity?.sha256===payload.sourceSha256
  &&sourceIntegrity.byteLength===payload.blob.size,'The HP producer needs the captured Original identity.');
 requireValue(['owned-array','seekable'].includes(admission.encodedInputMode)
  &&(admission.encodedInputMode!=='seekable'||typeof FileReaderSync==='function'),'The admitted encoded-input mode is unavailable; no unfinanced full-Blob fallback is allowed.');
 const verifier=await createSourcePrefixVerifier(sourceIntegrity,{expectedSha256:payload.sourceSha256});

 if(admission.encodedInputMode==='seekable'){
  const reader=new FileReaderSync(),capacity=sourceIntegrity.chunkBytes;
  inputBudget=new Budget(Math.min(capacity,payload.blob.size)*2);
  input=createCachedEncodedSource({byteLength:payload.blob.size,budget:inputBudget,cacheBytes:capacity,
   readChunk:(offset,length)=>{const buffer=reader.readAsArrayBuffer(payload.blob.slice(offset,offset+length)),bytes=new Uint8Array(buffer);
    verifier.verifyRangeSync(offset,bytes,(at,n)=>new Uint8Array(reader.readAsArrayBuffer(payload.blob.slice(at,at+n))));return buffer;}});
 }else{
  // This explicitly admitted owned-array mode retains one encoded copy.
  const bytes=new Uint8Array(await payload.blob.arrayBuffer());
  verifier.verifyRangeSync(0,bytes,()=>{throw new Error('A complete owned array needs no second read.');});input=encodedBytesSource(bytes);
 }
 checkAbort(signal());
 let wasmBinary;
 try {
   wasmBinary = await readVerifiedMediaResource(pinnedResource.wasmResourceId, {signal: controller.signal});
 } catch (error) {
   checkAbort(signal());
   throw error;
 }
 checkAbort(signal());
 const module = await import(pinnedResource.moduleURL);
 checkAbort(signal());
 const moduleFactory=module.default;
 constructorStarted=true;decoder=await createNativeMagickDecoder({moduleFactory,wasmBinary,maximumMemoryBytes:admission.maximumMemoryBytes,
  initialAdmittedBytes:admission.initialHeapBytes,bandBytes:admission.bandBytes,
  createPixelCacheOwner:async()=>createWorkerCacheBridge(request,admission.cacheTransferBytes)});
 let result,externalBandAdmitted=0;
 result=await decoder.decode({source:input,format:payload.coder,signal:signal(),sourcePreflight:preflight,
  onInputAdmission:async()=>({codecHeapBytes:admission.codecHeapBytes}),
  onHeader:async h=>{const grant=await request('decoded-admit',h);externalBandAdmitted=grant.externalBandBytes;return grant;},
  onDecodedHeader:async(h,borrow)=>{
   if(h.maximumExternalBandBytes>externalBandAdmitted){const grant=await request('decoded-grid-admit',h);externalBandAdmitted=grant.externalBandBytes;}
   const model=h.model,publicColor={sourceModel:model,sourceColorSpace:h.sourceColorSpace,
    colorSpaceOrigin:h.iccProfileLength?'embedded-profile':'decoder-model-not-a-declared-profile',
    ...(h.cicp?{cicp:h.cicp}:{}),...(h.chromaticities?{chromaticities:h.chromaticities}:{})};
   if(h.iccProfileLength){await request('decoded-profile-admit',{bytes:h.iccProfileLength});const bytes=new Uint8Array(h.iccProfileLength);borrow.readColorProfileInto(bytes);await request('decoded-profile',{bytes,color:publicColor},[bytes.buffer]);}
   const floating=h.decodedSampleFormat==='float32';
   await request('decoded-header',{width:h.width,height:h.height,orientation:h.orientation,orientationApplied:false,colorConversionApplied:false,
    channels:h.channels,layout:h.layout,sampleType:h.decodedSampleFormat,sourceDepth:preflight.sourceDepth,sourceModel:model,
    bindingOriginal:payload.bindingOriginal,decoder:h.decoder,publicColor,alphaAssociation:'decoder-defined-unqualified',additionalNativeProbe:false,
    gridOwner:h.gridOwner,admissionGrid:h.admissionGrid,
    valueEncoding:{kind:floating?'decoded-floating-values':'normalized-unsigned-codes',units:floating?(model==='CMYK'?'normalized-ink0..1':'relative-color-1'):'unsigned-code-values-0..65535',
     codedDepth:preflight.sourceDepth,decodedContainerBits:floating?32:16,normalization:floating?'Core FloatPixel export':'Core ShortPixel export'}});
   return{externalBandBytes:externalBandAdmitted};
  },
  onBand:band=>request('decoded-band',band,[band.samples.buffer]),
 });return{metrics:{...result.metrics,encodedIdentity:'consumed ranges verified against Original prefix states',input:input.metrics?.()??{ownedEncodedBytes:payload.blob.size}}};
}
self.onmessage=({data})=>{
 if(data.kind==='response'){if(pending&&pending.id===data.id){const p=pending;pending=null;data.ok?p.resolve(data.value):p.reject(decode(data.error));}return;}
 if(data.kind==='abort'){abort();return;}
 if(data.kind==='start'){
  if(flight||closed){try{post({kind:'failed',error:encode(new EngineError('INVALID_INPUT','The HP codec starts once.'))});}catch(error){fatal(error);}return;}
  controller=new AbortController();abortFlag=data.abortFlag;
  flight=(async()=>{try{const result=await prepare(data.payload);post({kind:'done',result});}catch(error){try{post({kind:'failed',error:encode(error)});}catch(transport){fatal(transport);}}})();return;
 }
 if(data.kind==='close'){
  abort();const id=data.id;
  (async()=>{try{await flight;if(decoder){await decoder.dispose();decoder=null;nativeRetired=true;}else if(!constructorStarted)nativeRetired=true;if(input){const value=await input.dispose?.();if(value===false||value===0)throw value;input=null;}requireValue(!inputBudget||inputBudget.total()===0,'The encoded input loan did not retire.');inputBudget=null;closed=true;post({kind:'closed',id,closed:true,nativeRetired});}
   catch(error){try{post({kind:'closed',id,closed:false,nativeRetired,error:encode(error)});}catch(transport){fatal(transport);}}})().catch(fatal);
 }
};
