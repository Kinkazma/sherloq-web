import "../../runtime-context.js?v=0.14.5";
import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from './scientific-zip.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {npyHeader} from './npz.js';
import {scientificJson,scientificJsonBound} from './scientific-json.js';
const encoder=new TextEncoder(),BLOCK=65536,crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const updateCrc=(crc,bytes)=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc;};
export async function streamScientificNpz(arrays,metadata,provenance,request,{budget,signal,onProgress,onTemporarySession}={}){
 let session,store,release,complete=false;
 try{
  requireValue(Array.isArray(arrays),'Scientific array list required.');
  release=budget.reserve(2*1024**2+8*(scientificJsonBound(metadata)+scientificJsonBound(provenance))+arrays.reduce((n,e)=>n+512+12*String(e.key).length+16*(e.shape?.length??0),0));checkAbort(signal);const entries=[],names=new Set(['metadata_json','browser_provenance_json']);
  for(const e of arrays){requireValue(typeof e.key==='string'&&e.key.length>0&&!/[\x00/\\]/.test(e.key)&&!names.has(e.key),'Invalid or duplicate scientific array name.');names.add(e.key);requireValue(Number.isSafeInteger(e.count)&&e.count>=0&&[1,2,4,8].includes(e.elementBytes)&&typeof e.read==='function'&&Array.isArray(e.shape)&&e.shape.length<=32&&e.shape.every(v=>Number.isSafeInteger(v)&&v>=0)&&e.shape.reduce((a,b)=>a*b,1)===e.count&&/^(?:[<|][iu][1248]|<f[48]|\|b1)$/.test(e.descr)&&Number(e.descr.slice(2))===e.elementBytes&&Number.isSafeInteger(e.count*e.elementBytes),'Invalid scientific array stream.');entries.push({...e,bytes:e.count*e.elementBytes,header:npyHeader(e.descr,e.shape)});}
  requireValue(request.metadataSerialization===undefined||request.metadataSerialization==='python','Invalid scientific metadata serialization.');
  for(const [key,value]of [['metadata_json',metadata],['browser_provenance_json',provenance]]){const points=Array.from(request.metadataSerialization==='python'?scientificJson(value):JSON.stringify(value),x=>x.codePointAt(0));entries.push({key,points,elementBytes:4,bytes:points.length*4,header:npyHeader('<U'+points.length,[])});}
  for(const e of entries){e.name=encoder.encode(e.key+'.npy');e.size=e.header.length+e.bytes;}
  const zip=scientificZipPlan(entries,{zip64:request.zip64??false}),{capacity,central}=zip;
  requireValue(request.maxBytes===undefined||Number.isSafeInteger(request.maxBytes)&&request.maxBytes>0,'Positive NPZ output limit required.');if(capacity>(request.maxBytes??Number.MAX_SAFE_INTEGER))throw new EngineError('EXPORT_LIMIT','Scientific NPZ exceeds the requested output limit.');
  requireValue(request.storage===undefined||['auto','memory','temporary'].includes(request.storage),'Invalid scientific export storage.');const fits=request.storage==='memory'||request.storage!=='temporary'&&capacity+4*1024**2<=budget.limit-budget.retained-budget.active;if(!fits){session=await createTemporarySession({budget,signal,id:request.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}
  store=await createSegmentedBytes(capacity,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});const output=new Uint8Array(BLOCK*8),view=new DataView(output.buffer);
  const assemblyStarted=performance.now();let at=0,stamp=performance.now();const cooperate=async()=>{checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
  for(const e of entries){await controlCheckpoint(signal);const local=scientificZipLocal(e);await store.write(local,at);at+=local.length;await store.write(e.header,at);at+=e.header.length;let crc=updateCrc(0xffffffff,e.header);
   const count=e.points?.length??e.count,step=BLOCK;
   for(let first=0;first<count;first+=step){await cooperate();const length=Math.min(step,count-first),size=length*e.elementBytes,bytes=output.subarray(0,size);
    if(e.points)for(let i=0;i<length;i++)view.setUint32(i*4,e.points[first+i],true);
    else await e.read(bytes,first,length);
    crc=updateCrc(crc,bytes);await store.write(bytes,at);at+=size;onProgress?.({phase:request.progressPhase??'scientific-npz',fraction:at/capacity,array:e.key});
   }
   e.crc=(crc^0xffffffff)>>>0;const patch=new Uint8Array(4);new DataView(patch.buffer).setUint32(0,e.crc,true);await store.write(patch,e.offset+14);
  }
  requireValue(at===central,'NPZ central offset mismatch.');for(const e of entries){const bytes=scientificZipCentral(e);await store.write(bytes,at);at+=bytes.length;}
  requireValue(at===zip.endOffset,'NPZ end offset mismatch.');await store.write(scientificZipEnd(zip),at);await store.flush();const assemblyMs=performance.now()-assemblyStarted,hashStarted=performance.now(),{createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256();let progressStamp=performance.now();for(let offset=0;offset<capacity;offset+=BLOCK){await cooperate();const bytes=output.subarray(0,Math.min(BLOCK,capacity-offset));await store.readInto(bytes,offset);hash.update(bytes);if(performance.now()-progressStamp>=16||offset+bytes.length===capacity){onProgress?.({phase:(request.progressPhase??'scientific-npz')+'-hash',fraction:(offset+bytes.length)/capacity});progressStamp=performance.now();}}checkAbort(signal);const hashMs=performance.now()-hashStarted;complete=true;
  return {store,session,byteLength:capacity,sha256:hash.digest('hex'),metrics:{storage:store.storage,temporaryBackend:session?.backend??null,arrays:entries.length,zip64:zip.zip64,assemblyMs,hashMs,maximumScalarChunk:BLOCK,outputCapacityBytes:capacity},mime:'application/zip',format:'npz'};
 }finally{release?.();if(!complete){try{await store?.dispose();}finally{await session?.dispose();}}}
}
