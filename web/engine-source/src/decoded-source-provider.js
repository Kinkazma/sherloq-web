// The decoded producer shares the existing source service and captured peer.
// Memory/backing allowances come from the caller's actual Original plan.
import {createPrepareProviderDecoded}from'./prepare-provider-decoded.js';
import {createSourceSamplesCodecPeer}from'./source-samples-codec-peer.js';
import {createParentCacheBridge}from'./native-magick-parent-cache.js';
import {createCapturedCodecCpuPhase}from'./captured-codec-cpu-phase.js';
import {requireValue}from'./errors.js';
const PAGE=65536,MiB=1024**2;
const checked=async fn=>{const v=await fn();if(v===0||v===false)throw v;return v;};
export function createDecodedSourceProvider({record,header,sourceSamples=record?.provenance?.sourceSamples??header?.sourceSamples,
 originalBlob=record?.source?.blob?.()??record?.blob,sourceIntegrity=()=>record?.source?.integrity?.()??record?.sourceIntegrity,
 resourceForQuantum,workerFactory,resourcePlan,isCurrent,adoptDecodedMetadata,simpleRgb8=false,createFaithfulBorrow,storageOptions={},
 preflightOrigin='existing-q8-ping',captureCpu=false,execution}={}){
 requireValue(typeof resourceForQuantum==='function'&&typeof workerFactory==='function'&&typeof resourcePlan==='function','A captured codec and real resource plan are required.');
 const sessions=new WeakMap();
 const codecPlan=async info=>{
  const{context,selection}=info;
  if(info.stage==='bootstrap'){
   requireValue(selection.kind==='high-precision','The real Q8 channel producer is a separate unchanged reader.');
   const resource=await resourceForQuantum(selection.quantumDepth),plan=await resourcePlan(info);
   requireValue(resource&&Number.isSafeInteger(resource.wasmBytes)&&resource.wasmBytes>0
    &&/^[a-f0-9]{64}$/.test(resource.wasmSha256)&&typeof resource.moduleURL==='string','Pinned HP resources must precede construction.');
   requireValue([plan.maximumMemoryBytes,plan.codecHeapBytes,plan.runtimeBytes,plan.bandBytes,plan.cacheTransferBytes,
    plan.cacheMemoryBytes,plan.cacheResidentBytes,plan.cacheLogicalBytes,plan.metadataHeadroomBytes].every(Number.isSafeInteger)
    &&plan.maximumMemoryBytes>=32*MiB&&plan.maximumMemoryBytes<=2**32&&plan.maximumMemoryBytes%PAGE===0
    &&plan.codecHeapBytes>=32*MiB&&plan.codecHeapBytes<=plan.maximumMemoryBytes&&plan.codecHeapBytes%PAGE===0
    &&plan.runtimeBytes>=2*resource.wasmBytes&&plan.bandBytes>0&&plan.cacheTransferBytes>0
    &&plan.cacheMemoryBytes>0&&plan.cacheMemoryBytes<plan.maximumMemoryBytes
    &&plan.cacheResidentBytes>=0&&plan.cacheLogicalBytes>0&&plan.metadataHeadroomBytes>=0,
   'The HP heap/cache/band plan differs from its admitted producer.');
   const manifest=typeof sourceIntegrity==='function'?sourceIntegrity():sourceIntegrity;requireValue(manifest?.sha256===context.bindingOriginal.sourceSha256
    &&originalBlob instanceof Blob&&manifest.byteLength===originalBlob.size,'Original prefix identity must be retained before the source codec starts.');
   const inputBytes=plan.encodedInputMode==='owned-array'?2*originalBlob.size:2*Math.min(originalBlob.size,manifest.chunkBytes);
   requireValue(['owned-array','seekable'].includes(plan.encodedInputMode),'The encoded input storage must be declared.');
   const transport=Math.max(plan.bandBytes,plan.cacheTransferBytes),session={resource,plan,manifest,inputBytes,transport,
    profileBytes:0,cache:null,bankFee:null};
   session.bytes=()=>plan.codecHeapBytes+plan.runtimeBytes+inputBytes+2*session.transport+2*manifest.states.byteLength+16384+session.profileBytes*2;
   sessions.set(context,session);
   return{bytes:session.bytes(),admission:{maximumMemoryBytes:plan.maximumMemoryBytes,initialHeapBytes:32*MiB,
    codecHeapBytes:plan.codecHeapBytes,bandBytes:plan.bandBytes,cacheTransferBytes:plan.cacheTransferBytes,encodedInputMode:plan.encodedInputMode}};
  }
  const s=sessions.get(context);requireValue(s,'The captured codec plan is unavailable.');
  if(info.stage==='decode'){
   requireValue(!s.cache,'The decoder already owns a cache admission.');
   s.transport=Math.max(s.transport,info.header.maximumExternalBandBytes);
   const h=info.header,bankBytes=h.width*h.height*h.channels*(h.decodedSampleFormat==='float32'?4:2);
   requireValue(Number.isSafeInteger(bankBytes)&&bankBytes>0,'Invalid decoded source bank size.');
   // Fund its RAM slot before lending the remainder to the Core cache. The
   // constructor takes over that slot after the useful Read/profile phase.
   if(storageOptions.storage!=='temporary'&&bankBytes<=context.budget.limit-context.budget.total())s.bankFee=context.budget.reserve(bankBytes);
   const bankSlot={dispose(){s.bankFee?.();s.bankFee=null;}};try{context.adoptAuxiliaryOwner(bankSlot);}catch(error){bankSlot.dispose();throw error;}
   const available=Math.max(0,context.budget.limit-context.budget.total()-s.plan.metadataHeadroomBytes);
   s.cache=createParentCacheBridge({budget:context.budget,maximumResidentBytes:Math.min(s.plan.cacheResidentBytes,available),
    maximumLogicalBytes:s.plan.cacheLogicalBytes,maximumTransferBytes:s.plan.cacheTransferBytes,
    temporarySession:storageOptions.temporarySession,getTemporarySession:storageOptions.getTemporarySession});
   s.admittedPixels=h.width*h.height;s.admittedChannels=h.channels;
   return{bytes:s.bytes(),admission:{codecHeapBytes:s.plan.codecHeapBytes,cacheMemoryBytes:s.plan.cacheMemoryBytes,
    externalBandBytes:info.header.maximumExternalBandBytes,cacheBackingBytes:s.plan.cacheLogicalBytes}};
  }
  if(info.stage==='read-grid'){
   const h=info.header;requireValue(Number.isSafeInteger(h.width*h.height)&&h.width*h.height===s.admittedPixels
    &&h.channels===s.admittedChannels&&Number.isSafeInteger(h.maximumExternalBandBytes)&&h.maximumExternalBandBytes>0,
   'The useful Read must retain its admitted sample product and channel layout.');
   s.transport=Math.max(s.transport,h.maximumExternalBandBytes);
   return{bytes:s.bytes(),admission:{externalBandBytes:h.maximumExternalBandBytes}};
  }
  if(info.stage==='profile-transfer'){s.profileBytes=info.header.bytes;return{bytes:s.bytes()};}
  if(info.stage==='source-bank'){s.bankFee?.();s.bankFee=null;return{bytes:s.bytes()};}
  throw new Error('Unknown captured HP admission stage.');
 };
 const transferFactory=url=>{
  const worker=workerFactory(url);
  // This facade only transfers a parent-owned cache reply instead of cloning
  // it. The same captured Worker/done/terminate identity reaches the peer.
  return{get done(){return worker.done;},addEventListener:(...a)=>worker.addEventListener(...a),
   removeEventListener:(...a)=>worker.removeEventListener(...a),terminate:()=>worker.terminate(),
   postMessage(message,transfer=[]){const bytes=message.kind==='response'&&message.value?.cacheBytes;
    return worker.postMessage(message,bytes instanceof Uint8Array&&bytes.byteLength===bytes.buffer.byteLength?[bytes.buffer]:transfer);}};
 };
 const peerFactory=({signal,handleRequest})=>createSourceSamplesCodecPeer({workerFactory:transferFactory,workerURL:new URL('./native-magick-codec-worker.js',import.meta.url),signal,handleRequest});
 const provider=createPrepareProviderDecoded({record,header,sourceSamples,isCurrent,storageOptions,codecPlan,originalBlob,adoptDecodedMetadata,simpleRgb8,createFaithfulBorrow,preflightOrigin,
  createCodecPeer:({selection,phase,context,signal,handleRequest})=>{
   const s=sessions.get(context);let cpu;
   if(captureCpu){requireValue(execution?.budget===context.budget,'The source codec scheduler must use the same Original budget.');cpu=createCapturedCodecCpuPhase({execution,signal:context.signal,resourceOwner:phase.id,label:'native-color-source-codec'});}
   const handle=(action,value)=>action.startsWith('cache-')?(requireValue(s.cache,'The Core cache was not admitted.'),s.cache.request(action,value)):handleRequest(action,value);
   const peer=peerFactory({selection,signal:cpu?.codecSignal??signal,
    handleRequest:(action,value)=>cpu?cpu.suspend(()=>handle(action,value)):handle(action,value)});
   const captured={async start(payload){const coder=(header.decoderCoder??header.format??payload.sourceSamples.coder).toUpperCase();const result=await peer.start({...payload,coder,resource:s.resource,sourceIntegrity:s.manifest});return result;},
    async dispose(){await checked(()=>peer.dispose());await checked(()=>s.cache?.dispose());},
    async terminate(){return checked(()=>peer.terminate());}};
   return cpu?cpu.capture(captured):captured;
  }});
 return provider;
}
