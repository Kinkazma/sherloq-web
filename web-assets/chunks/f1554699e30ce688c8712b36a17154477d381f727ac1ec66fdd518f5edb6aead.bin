import "../../runtime-context.js?v=0.33.2";
// Optional HDR representation in the existing Original-owned sample service.
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createNativeSampleBank} from './native-sample-bank.js';
import {createSourceSamplesCodecPeer} from './source-samples-codec-peer.js';
import {createCapturedCodecCpuPhase} from './captured-codec-cpu-phase.js';
const MiB=1024**2,HOST_LE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
export function createPrepareProviderHdr({blob,execution,workerFactory,storageOptions={}}={}){
 requireValue(blob instanceof Blob&&blob.size>0&&typeof workerFactory==='function'&&Object.keys(storageOptions).every(key=>['storage','chunkBytes','temporarySession','getTemporarySession'].includes(key)),'Captured encoded Original, codec peer and shared storage are required.');
 return async context=>{
  requireValue(execution?.budget===context.budget,'The HDR codec execution scheduler must use the same Core budget.');
  requireValue(context.domain==='decoded'&&context.frame===0&&context.representation?.kind==='hdr-linear-rgb-float32','An explicit versioned HDR decoded representation is required.');checkAbort(context.signal);
  const phase=context.codecPhase({bytes:64*MiB+2*blob.size+4*MiB,label:'avif-hdr-source-codec'});let header,bank,failedBankOwner,bandLimit,metadata;
  const owner={async dispose(){const result=bank?await bank.dispose():failedBankOwner?await failedBankOwner.dispose():undefined;if(result===false||result===0)throw result;bank=failedBankOwner=header=metadata=null;}};
  context.adoptSourceOwner(owner);
  const cpu=createCapturedCodecCpuPhase({execution,signal:context.signal,resourceOwner:phase.id,label:'hdr-source-codec'});let cpuStage='header';
  const handleRequest=async(action,value)=>{
   if(action==='codec-cpu-phase'){
    requireValue(value?.phase==={header:'av1',av1:'conversion',conversion:'native-closed'}[cpuStage], 'The HDR CPU phase is out of order.');
    if(value.phase==='av1')requireValue(header&&value.kind==='active'&&Number.isSafeInteger(value.topology?.decoderCount)&&value.topology.decoderCount>0
      &&typeof value.topology.multithreaded==='boolean'&&value.cpu>0&&(!value.topology.multithreaded?value.cpu===1:value.cpu*value.topology.decoderCount<=64),'HDR AV1 topology differs.');
    else requireValue(value.phase==='conversion'?value.kind==='active'&&value.cpu===1&&value.minCpu===1:value.kind==='native-closed'&&value.cpu===0&&value.minCpu===0,'HDR CPU continuation differs.');
    const receipt=await cpu.request(value);cpuStage=value.phase==='av1'?'av1':value.phase==='conversion'?'conversion':'closed';return receipt;
   }
   requireValue(action==='hdr-header'?cpuStage==='header':action==='hdr-band'&&cpuStage==='conversion','The HDR data request is out of CPU phase.');
   const result=await cpu.suspend(async()=>{
   checkAbort(context.signal);
   if(action==='hdr-header'){
    requireValue(!header&&value?.sourceSha256===context.bindingOriginal.sourceSha256&&value.frame===0&&value.format==='avif'&&value.gainMap===true&&value.alpha===false&&value.iccBytes===0&&value.altIccBytes===0&&[value.width,value.height].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isInteger(value.orientation)&&value.orientation>=1&&value.orientation<=8&&Number.isSafeInteger(value.codecMemoryBytes)&&value.codecMemoryBytes>0,'HDR source header differs from captured Original/type/domain.');
    header=value;const maximumPixels=Math.max(value.width*Math.max(1,Math.min(128,Math.floor((32*MiB)/(value.width*24)))),Math.min(1024**2,value.width*value.height));bandLimit=maximumPixels*12;
    phase.admitCapacity(value.codecMemoryBytes+2*blob.size+2*bandLimit+4*MiB);return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='hdr-band'){
    requireValue(header&&value?.bytes instanceof Uint8Array&&value.sampleType==='float32'&&value.byteOrder==='little-endian'&&value.width===header.width&&Number.isSafeInteger(value.y)&&Number.isSafeInteger(value.rows)&&value.y>=0&&value.rows>0&&value.rows<=header.height-value.y&&value.bytes.byteLength===value.width*value.rows*12&&value.bytes.byteLength<=bandLimit&&value.representation?.sampleModel==='hdr-linear-rgb'&&value.representation?.targetHeadroom===context.representation.targetHeadroom&&value.representation.preClamp===true,'HDR Float32 band differs from its declared representation.');
    if(!bank){metadata=value.representation;requireValue(metadata.mathPrimaries===context.representation.profileIdentity.gainMathPrimaries&&metadata.sourceDepth===header.depth,'HDR math colour/precision differs from the request.');
     try{bank=await createNativeSampleBank({width:header.width,height:header.height,orientation:header.orientation,sampleType:'float32',channels:3,channelMap:['R','G','B'],sourceDepth:header.depth,domain:'decoded',sampleModel:'hdr-linear-rgb',sampleSemantics:{role:'reconstructed-hdr',targetHeadroom:metadata.targetHeadroom,frame:0,preClamp:true,preToneMap:true,preGamutMap:true},valueEncoding:metadata.valueEncoding,color:{model:'RGB',primariesCicp:metadata.mathPrimaries,transfer:'linear',profileIdentity:context.representation.profileIdentity},provenance:{decoder:'libavif1.4.2/dav1d1.5.4',algorithm:metadata.algorithm,representation:context.representation,originalBanksUnmodified:true,acquisition:'on-demand reopen of captured encoded Original'},bindingOriginal:context.bindingOriginal,budget:context.budget,signal:context.signal,...storageOptions});}catch(error){failedBankOwner=error?.cleanupOwner;throw error;}
    }else requireValue(JSON.stringify(value.representation)===JSON.stringify(metadata),'HDR recipe cannot change between bands.');
    let bytes=value.bytes;if(!HOST_LE){bytes=bytes.slice();for(let i=0;i<bytes.length;i+=4){[bytes[i],bytes[i+3]]=[bytes[i+3],bytes[i]];[bytes[i+1],bytes[i+2]]=[bytes[i+2],bytes[i+1]];}}
    await bank.writeBand({y:value.y,width:value.width,rows:value.rows,samples:new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4)},{signal:context.signal});return{stored:true};
   }
   throw new EngineError('INVALID_INPUT','Unknown HDR source preparation action.');
   });return{...result,cpuResume:cpu.resumeReceipt()};
  };
  const peer=createSourceSamplesCodecPeer({workerURL:new URL('./hdr-codec-worker.js',import.meta.url),workerFactory,signal:cpu.codecSignal,handleRequest});const codec=cpu.capture(peer);phase.adopt(codec);
  await codec.start({blob,sourceSha256:context.bindingOriginal.sourceSha256,frame:0,representation:context.representation,colorBackend:'auto'});checkAbort(context.signal);requireValue(bank,'HDR source has no complete float bank.');context.publishSource(await bank.seal({signal:context.signal}));
 };
}
