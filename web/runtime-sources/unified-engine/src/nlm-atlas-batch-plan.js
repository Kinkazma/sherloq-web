import "../../runtime-context.js?v=0.30.0";
const HEAP=64*1024**2,MAX_U32=0xffffffff;
const valid=v=>Number.isSafeInteger(v)&&v>=0;
const align=v=>Math.ceil(v/8)*8;
// Geometry and conservative accounting only: no iterator of all image cores,
// RGB access, allocation, Native call, adapter request or GPU operation.
export function planNlmAtlasBatch(shapes,{limits,availableBytes,ioWorkspaceBytes,maxEntries=16,maxPoints=256,tableBytes=1200000,pipelineBytes=2*1024**2}={}){
 if(!Array.isArray(shapes)||!shapes.length||shapes.length>maxEntries||!valid(maxEntries)||maxEntries<1||maxEntries>64||!valid(maxPoints)||maxPoints<1||maxPoints>4096)return null;
 if(!valid(availableBytes)||!valid(ioWorkspaceBytes)||!valid(tableBytes)||tableBytes%4||!valid(pipelineBytes))return null;
 const binding=Math.min(limits?.maxStorageBufferBindingSize??0,limits?.maxBufferSize??0),workgroups=limits?.maxComputeWorkgroupsPerDimension??0;
 if(!valid(binding)||binding<4||!valid(workgroups)||workgroups<1)return null;
 let selected=null,points=0,maximumOriginalPoints=0;
 for(let index=0;index<shapes.length;index++){
  const shape=shapes[index];if(!shape||!Number.isSafeInteger(shape.width)||shape.width<27||shape.width%27||shape.height!==27)return null;
  const count=shape.width/27;if(count>maxPoints)break;
  points+=count;maximumOriginalPoints=Math.max(maximumOriginalPoints,count);if(points>maxPoints)break;
  const width=points*27,pixels=width*27,packedSourceBytes=pixels*4,packedOutputBytes=width*4,returnedRgbBytes=width*3,maxOriginalPixels=maximumOriginalPoints*27*27;
  const sourceRgbScratchBytes=maxOriginalPixels*3,sourceSupportPixels=(maximumOriginalPoints+26)*27,sourceSupportBytes=sourceSupportPixels*7+3*Math.max(maximumOriginalPoints+26,27),centreRgbBytes=points*3,metadataBytes=4096+(index+1)*256;
  // Original-size aligned Native pack/unpack scratch, combined packed source,
  // and the pre-existing coefficient/workspace margin. All mallocs must still
  // succeed before the caller reads the first source, never after a promise.
  const nativeWorkspaceBytes=maxOriginalPixels*32+packedSourceBytes+packedOutputBytes+maximumOriginalPoints*27*7+4*1024**2;
  const gpuBytes=packedSourceBytes+2*packedOutputBytes+tableBytes+40;
  const cpuBytes=sourceRgbScratchBytes+sourceSupportBytes+centreRgbBytes+returnedRgbBytes+metadataBytes;
  const chargeBytes=cpuBytes+gpuBytes+packedOutputBytes+pipelineBytes+ioWorkspaceBytes;
  if(![width,pixels,packedSourceBytes,packedOutputBytes,returnedRgbBytes,nativeWorkspaceBytes,gpuBytes,cpuBytes,chargeBytes].every(valid)||width>MAX_U32||pixels>MAX_U32||nativeWorkspaceBytes>HEAP||Math.ceil(points/64)>workgroups||Math.max(packedSourceBytes,packedOutputBytes,tableBytes,32)>binding||chargeBytes>availableBytes)break;
  let prefix=0;const entries=shapes.slice(0,index+1).map((s,i)=>{const entry={index:i,width:s.width,height:27,points:s.width/27,prefixWidth:prefix,unpackWidth:s.width,unpackHeight:1,outputByteOffset:prefix*4,outputByteLength:s.width*4,nativeAlignment:8};prefix+=s.width;return Object.freeze(entry);});
  selected=Object.freeze({entries:Object.freeze(entries),pointCount:points,width,height:27,start:13,rows:1,packedSourceBytes,packedOutputBytes,returnedRgbBytes,nativeWorkspaceBytes,gpuBytes,cpuBytes,cpuOwnedBytes:cpuBytes-sourceSupportBytes,sourceLoanAllowanceBytes:sourceSupportBytes,sourceRgbScratchBytes,centreRgbBytes,metadataBytes,mapStagingBytes:packedOutputBytes,pipelineBytes,tableBytes,ioWorkspaceBytes,chargeBytes,nativeAlignment:8,minimumAlignedNativeScratchBytes:align(sourceRgbScratchBytes)+align(maxOriginalPixels*4)+align(maximumOriginalPoints*27*4)+align(maximumOriginalPoints*27*3)});
 }
 return selected?.entries.length>=2?selected:null;
}

// The caller owns/funds target and each source. Copy raw packed bytes row by
// row: words may represent BGR, Lab or gray, never a synthesized RGBA colour.
export function copyNlmPackedAtlasInto(plan,index,source,target){
 const entry=plan?.entries?.[index];if(!entry||!(source instanceof Uint8Array)||source.length!==entry.width*27*4||!(target instanceof Uint8Array)||target.length!==plan.packedSourceBytes)throw new TypeError('Funded packed atlas extents differ');
 if(source.buffer===target.buffer&&source.byteOffset<target.byteOffset+target.byteLength&&target.byteOffset<source.byteOffset+source.byteLength)throw new TypeError('Packed atlas source aliases target');
 for(let row=0;row<27;row++)target.set(source.subarray(row*entry.width*4,(row+1)*entry.width*4),(row*plan.width+entry.prefixWidth)*4);
}

// Copy into separately aligned original-size Native scratch before unpack;
// a prefix inside the combined row is not necessarily 8-byte aligned.
export function copyNlmPackedOutputInto(plan,index,source,target){
 const entry=plan?.entries?.[index];if(!entry||!(source instanceof Uint8Array)||source.length!==plan.packedOutputBytes||!(target instanceof Uint8Array)||target.length!==entry.outputByteLength||target.byteOffset%8)throw new TypeError('Aligned original Native output scratch required');
 if(source.buffer===target.buffer&&source.byteOffset<target.byteOffset+target.byteLength&&target.byteOffset<source.byteOffset+source.byteLength)throw new TypeError('Packed output source aliases target');
 target.set(source.subarray(entry.outputByteOffset,entry.outputByteOffset+entry.outputByteLength));
}
