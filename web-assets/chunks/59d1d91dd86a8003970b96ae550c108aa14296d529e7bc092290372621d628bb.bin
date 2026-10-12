// Offline candidate: only write-loop yielding differs from M1.28.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {createSegmentedBytes} from '../../src/segmented-bytes.js';
import {createTemporarySession} from '../../src/temporary-storage.js';
import {npyHeader} from '../../src/npz.js';
const encoder=new TextEncoder(),BLOCK=65536,crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const updateCrc=(crc,bytes)=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc;};
export async function streamScientificNpz(arrays,metadata,provenance,request,{budget,signal,onProgress,onTemporarySession}={}){
 let session,store,release,complete=false;
 const jsonBound=value=>value===null||typeof value!=='object'?typeof value==='string'?value.length*6+2:32:Object.entries(value).reduce((sum,[key,v])=>sum+key.length*6+jsonBound(v)+4,2);
 try{
  release=budget.reserve(2*1024**2+8*(jsonBound(metadata)+jsonBound(provenance)));checkAbort(signal);const entries=[];
  for(const e of arrays){requireValue(Number.isSafeInteger(e.count)&&e.count>=0&&[1,4,8].includes(e.elementBytes)&&typeof e.read==='function','Invalid scientific array stream.');entries.push({...e,bytes:e.count*e.elementBytes,header:npyHeader(e.descr,e.shape)});}
  for(const [key,value]of [['metadata_json',metadata],['browser_provenance_json',provenance]]){const points=Array.from(JSON.stringify(value),x=>x.codePointAt(0));entries.push({key,points,elementBytes:4,bytes:points.length*4,header:npyHeader('<U'+points.length,[])});}
  let capacity=22;for(const e of entries){e.name=encoder.encode(e.key+'.npy');e.size=e.header.length+e.bytes;e.offset=capacity-22;capacity+=30+e.name.length+e.size;}
  const central=capacity-22;for(const e of entries)capacity+=46+e.name.length;
  requireValue(request.maxBytes===undefined||Number.isSafeInteger(request.maxBytes)&&request.maxBytes>0,'Positive NPZ output limit required.');if(capacity>0xffffffff||capacity>(request.maxBytes??0xffffffff))throw new EngineError('EXPORT_LIMIT','Scientific NPZ exceeds the ZIP32 or requested output limit.');
  requireValue(request.storage===undefined||['auto','memory','temporary'].includes(request.storage),'Invalid scientific export storage.');const fits=request.storage==='memory'||request.storage!=='temporary'&&capacity+4*1024**2<=budget.limit-budget.retained-budget.active;if(!fits){session=await createTemporarySession({budget,signal,id:request.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}
  store=await createSegmentedBytes(capacity,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});const output=new Uint8Array(BLOCK*8),view=new DataView(output.buffer);
  let at=0,stamp=performance.now();const cooperate=async()=>{checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
  for(const e of entries){await controlCheckpoint(signal);const local=new Uint8Array(30+e.name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(18,e.size,true);v.setUint32(22,e.size,true);v.setUint16(26,e.name.length,true);local.set(e.name,30);await store.write(local,at);at+=local.length;await store.write(e.header,at);at+=e.header.length;let crc=updateCrc(0xffffffff,e.header);
   const count=e.points?.length??e.count,step=BLOCK;
   for(let first=0;first<count;first+=step){await cooperate();const length=Math.min(step,count-first),size=length*e.elementBytes,bytes=output.subarray(0,size);
    if(e.points)for(let i=0;i<length;i++)view.setUint32(i*4,e.points[first+i],true);
    else await e.read(bytes,first,length);
    crc=updateCrc(crc,bytes);await store.write(bytes,at);at+=size;onProgress?.({phase:request.progressPhase??'scientific-npz',fraction:at/capacity,array:e.key});
   }
   e.crc=(crc^0xffffffff)>>>0;const patch=new Uint8Array(4);new DataView(patch.buffer).setUint32(0,e.crc,true);await store.write(patch,e.offset+14);
  }
  requireValue(at===central,'NPZ central offset mismatch.');for(const e of entries){const bytes=new Uint8Array(46+e.name.length),v=new DataView(bytes.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(14,33,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.size,true);v.setUint32(24,e.size,true);v.setUint16(28,e.name.length,true);v.setUint32(42,e.offset,true);bytes.set(e.name,46);await store.write(bytes,at);at+=bytes.length;}
  const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,at-central,true);ev.setUint32(16,central,true);await store.write(end,at);await store.flush();const {createSHA256}=await import('../../vendor/hash-wasm/hashes.js'),hash=await createSHA256();await store.visit(bytes=>hash.update(bytes),{signal,blockBytes:BLOCK});checkAbort(signal);complete=true;
  return {store,session,byteLength:capacity,sha256:hash.digest('hex'),metrics:{storage:store.storage,temporaryBackend:session?.backend??null,arrays:entries.length,maximumScalarChunk:BLOCK,outputCapacityBytes:capacity},mime:'application/zip',format:'npz'};
 }finally{release?.();if(!complete){try{await store?.dispose();}finally{await session?.dispose();}}}
}
