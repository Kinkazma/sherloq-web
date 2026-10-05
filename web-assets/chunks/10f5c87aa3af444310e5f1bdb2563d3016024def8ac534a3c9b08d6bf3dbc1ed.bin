import "../../runtime-context.js?v=0.14.5";
import {streamM3ResearchNpz} from './m3-research-export.js';
import {streamNeuralNpz} from './neural-npz-stream.js';
import {streamEnergyNpz} from './energy-npz-stream.js';
import {streamZeroNpz} from './zero-npz-stream.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createTemporarySession} from './temporary-storage.js';
const MiB=1024**2,OUTPUT_CHUNK=256*1024;
export function pngExportPlan({width,height,format}){
 requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'PNG export dimensions must be within1–65500.');
 requireValue(['rgb8','mask8','rgb-flags8'].includes(format),'PNG export requires an RGB, mask or RGB-flag surface.');const channels=format==='mask8'?1:3,rows=Math.min(32,height),rowBytes=width*channels,filtered=(rowBytes+1)*height;
 // zlib compressBound with conservative PNG chunk/framing allowance. The writer
 // uses default window/memory settings and emits IDAT chunks of at most64KiB.
 const compressed=filtered+Math.ceil(filtered/4096)+Math.ceil(filtered/16384)+Math.ceil(filtered/33554432)+13,bound=compressed+12*Math.ceil(compressed/65536)+MiB;
 const heapMaximumBytes=Math.ceil((8*MiB+rowBytes*40+512*1024)/(16*MiB))*16*MiB;
 requireValue(Number.isSafeInteger(bound)&&heapMaximumBytes<=64*MiB,'PNG export workspace exceeds the bounded range.');
 return {channels,rows,rowBytes,bound,heapMaximumBytes,workingBytes:heapMaximumBytes+8*MiB+OUTPUT_CHUNK};
}
export function createRasterExports(budget,{onTemporarySession}={}){
 const records=new Map();
 async function dispose(record){if(record.dispose)return record.dispose();try{await record.store.dispose();}finally{await record.session?.dispose();}}
 return {
  async create(surface,request,{signal,onProgress,imageId,originalSha256,wasmBinary}={}){
   requireValue((request.format??'png')==='png','Only lossless PNG raster export is qualified.');requireValue(request.storage===undefined||['auto','temporary'].includes(request.storage),'Invalid raster export storage.');const compression=request.compression??6;requireValue(Number.isInteger(compression)&&compression>=0&&compression<=9,'PNG compression must be an integer0–9.');
   const shape=surface.descriptor,plan=pngExportPlan(shape),maximum=request.maxBytes??plan.bound;requireValue(Number.isSafeInteger(maximum)&&maximum>0,'Positive raster output limit required.');const capacity=Math.min(plan.bound,maximum);await controlCheckpoint(signal);const release=budget.reserve(plan.workingBytes);let store,session,m,pointer=0,published=false;
   try{
    const selectedStorage=request.storage??(shape.storage==='temporary'?'temporary':'auto'),fits=selectedStorage!=='temporary'&&capacity+plan.rowBytes*(plan.rows+1)+4*MiB<=budget.limit-budget.retained-budget.active;
    if(!fits){session=await createTemporarySession({budget,signal,id:request.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}
    store=await createSegmentedBytes(capacity,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
    const {createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256(),buffer=new Uint8Array(OUTPUT_CHUNK);let buffered=0,written=0,writeCalls=0;
    const flush=async()=>{if(!buffered)return;checkAbort(signal);await store.write(buffer.subarray(0,buffered),written);written+=buffered;buffered=0;writeCalls++;};
    async function writeEncoded(pointer,length){checkAbort(signal);if(written+buffered+length>capacity)throw new EngineError('EXPORT_LIMIT','PNG output exceeds its requested byte limit.');let at=0;while(at<length){const count=Math.min(length-at,buffer.length-buffered),part=m.HEAPU8.subarray(pointer+at,pointer+at+count);hash.update(part);buffer.set(part,buffered);buffered+=count;at+=count;if(buffered===buffer.length)await flush();}}
    const {default:create}=await import('../vendor/png-export/png-export.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536}),writeEncoded,...(wasmBinary?{wasmBinary}:{})});
    const call=async(name,types=[],args=[])=>{const ok=await m.ccall(name,'number',types,args,{async:true});if(m.writeFailure)throw m.writeFailure;if(!ok)throw new EngineError(m._png_export_error()===2?'MEMORY_LIMIT':'COMPUTE_FAILED','Native PNG encoder failed.');checkAbort(signal);};
    pointer=m._malloc(plan.rowBytes*plan.rows);if(!pointer)throw new EngineError('MEMORY_LIMIT','PNG source-band allocation failed.');await call('png_export_open',['number','number','number','number'],[shape.width,shape.height,plan.channels,compression]);let peak=m.HEAPU8.buffer.byteLength;
    for(let y=0;y<shape.height;y+=plan.rows){await controlCheckpoint(signal);const count=Math.min(plan.rows,shape.height-y),part=await surface.readWindow({x:0,y,width:shape.width,height:count},{signal});try{m.HEAPU8.set(part.pixels.data,pointer);}finally{part.release();}await call('png_export_rows',['number','number'],[pointer,count]);peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'encode-png',fraction:(y+count)/shape.height});}
    await call('png_export_end');await flush();await store.flush();checkAbort(signal);const id=crypto.randomUUID(),descriptor={id,revision:1,mime:'image/png',format:'png',width:shape.width,height:shape.height,byteLength:written,sha256:hash.digest('hex'),imageId,sourceSurfaceId:shape.id,sourceSurfaceRevision:shape.revision,sourceFormat:shape.format,provenance:{originalSha256,coordinates:'full-resolution',pixels:'exact surface bytes',metadata:'No original EXIF, ICC, alpha or authenticity assertions are copied.',...(shape.range?{range:[...shape.range],semantics:shape.semantics}:{}),encoder:'libpng-1.6.43/emscripten-4.0.15/rows-v1',compression},metrics:{storage:store.storage,temporaryBackend:session?.backend??null,outputCapacityBytes:capacity,encodedWriteCalls:writeCalls,maxSourceWindowBytes:plan.rowBytes*plan.rows,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:plan.heapMaximumBytes,memory:budget.snapshot()}};
    onProgress?.({phase:'complete',fraction:1});checkAbort(signal);records.set(id,{descriptor,store,session});published=true;return structuredClone(descriptor);
   }finally{if(m){m._png_export_close();if(pointer)m._free(pointer);}try{if(!published){try{await store?.dispose();}finally{await session?.dispose();}}}finally{release();}}
  },
  adopt(archive,{imageId,analysisId,operation,originalSha256,width,height,mime=archive?.mime??'application/zip',format=archive?.format??'npz'}){
   requireValue(archive?.store&&typeof archive.dispose==='function','Owned scientific archive required.');
   const descriptor={id:crypto.randomUUID(),revision:1,mime,format,width,height,byteLength:archive.byteLength,sha256:archive.sha256,imageId,analysisId,provenance:{originalSha256,operation,coordinates:'full-resolution'},metrics:{...archive.metrics,memory:budget.snapshot()}};
   const result=structuredClone(descriptor);records.set(descriptor.id,{descriptor,store:archive.store,dispose:()=>archive.dispose()});return result;
  },
  async createScientific(record,request,{signal,onProgress,imageId,originalSha256}={}){
   requireValue(request.format==='npz'&&(record.zeroAnalysis||record.energyAnalysis||record.neuralAnalysis||record.m3Research),'Scientific NPZ export requires a live ZERO, energy or neural result surface.');const energy=!!record.energyAnalysis,neural=!!record.neuralAnalysis,m3=!!record.m3Research;let result,published=false;
   try{result=await (m3?streamM3ResearchNpz:neural?streamNeuralNpz:energy?streamEnergyNpz:streamZeroNpz)(record.m3Research??record.neuralAnalysis??record.energyAnalysis??record.zeroAnalysis,record.provenance,request,{budget,signal,onProgress,onTemporarySession});const descriptor={id:crypto.randomUUID(),revision:1,mime:result.mime,format:'npz',width:record.surface.descriptor.width,height:record.surface.descriptor.height,byteLength:result.byteLength,sha256:result.sha256,imageId,sourceSurfaceId:record.surface.descriptor.id,sourceSurfaceRevision:record.surface.descriptor.revision,provenance:{originalSha256,operation:neural||m3?record.provenance.operation:energy?'ela.energy':'jpeg.zero',coordinates:'full-resolution',arrays:m3?'Native research grids, features and labels; no pickle':neural?'Native float32 probability/role planes and uint8 masks; no pickle':energy?'Native float32 energy/scores and int32 scopes/labels; no pickle':'Native float64 luminance/NFA and int32 votes/masks; no pickle'},metrics:{...result.metrics,memory:budget.snapshot()}};onProgress?.({phase:'complete',fraction:1});checkAbort(signal);records.set(descriptor.id,{descriptor,store:result.store,session:result.session});published=true;return structuredClone(descriptor);}finally{if(result&&!published)await dispose(result);}
  },
  async read({exportId,revision,offset=0,length},{signal}={}){
   const record=records.get(exportId);if(!record)throw new EngineError('NOT_FOUND','Raster export no longer exists.');const totalBytes=record.descriptor.byteLength;requireValue(revision===record.descriptor.revision,'Stale raster export revision.');length??=Math.min(MiB,totalBytes-offset);requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&length<=4*MiB&&offset<=totalBytes-length,'Invalid raster export page; maximum4MiB.');await controlCheckpoint(signal);const release=budget.reserve(length);
   try{const bytes=new Uint8Array(length);await record.store.readInto(bytes,offset);checkAbort(signal);return {exportId,revision,offset,bytes,totalBytes,nextOffset:offset+length,done:offset+length===totalBytes,mime:record.descriptor.mime};}finally{release();}
  },
  async release(id){const record=records.get(id);if(!record)throw new EngineError('NOT_FOUND','Raster export no longer exists.');records.delete(id);await dispose(record);},
  async clear(){const all=[...records.values()];records.clear();const results=await Promise.allSettled(all.map(dispose));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;},
  get size(){return records.size;}
 };
}
