import {streamNeuralNpz} from './neural-npz-stream.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
// Uses the same owned export descriptor/page lifecycle as M5 raster exports.
// Integration can dispatch streamNeuralNpz from its common scientific manager.
export function createNeuralExports(budget,{onTemporarySession}={}){
 const records=new Map(),MiB=1024**2;
 async function dispose(record){try{await record.store.dispose();}finally{await record.session?.dispose();}}
 return {
  async createScientific(record,request,{signal,onProgress,imageId,originalSha256}={}){
   requireValue(request.format==='npz'&&record.neuralAnalysis,'Scientific NPZ export requires a live neural result surface.');let result,published=false;
   try{
    result=await streamNeuralNpz(record.neuralAnalysis,record.provenance,request,{budget,signal,onProgress,onTemporarySession});
    const descriptor={id:crypto.randomUUID(),revision:1,mime:result.mime,format:'npz',width:record.surface.descriptor.width,height:record.surface.descriptor.height,byteLength:result.byteLength,sha256:result.sha256,imageId,sourceSurfaceId:record.surface.descriptor.id,sourceSurfaceRevision:record.surface.descriptor.revision,provenance:{originalSha256,operation:record.provenance.operation,coordinates:'full-resolution',arrays:'Native float32 probability/role planes and uint8 masks; no pickle'},metrics:{...result.metrics,memory:budget.snapshot()}};
    onProgress?.({phase:'complete',fraction:1});checkAbort(signal);records.set(descriptor.id,{descriptor,store:result.store,session:result.session});published=true;return structuredClone(descriptor);
   }finally{if(result&&!published)await dispose(result);}
  },
  async read({exportId,revision,offset=0,length},{signal}={}){
   const record=records.get(exportId);if(!record)throw new EngineError('NOT_FOUND','Scientific export no longer exists.');const totalBytes=record.descriptor.byteLength;requireValue(revision===record.descriptor.revision,'Stale export revision.');length??=Math.min(MiB,totalBytes-offset);requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&length<=4*MiB&&offset<=totalBytes-length,'Invalid export page; maximum 4 MiB.');await controlCheckpoint(signal);const release=budget.reserve(length);
   try{const bytes=new Uint8Array(length);await record.store.readInto(bytes,offset);checkAbort(signal);return {exportId,revision,offset,bytes,totalBytes,nextOffset:offset+length,done:offset+length===totalBytes,mime:record.descriptor.mime};}finally{release();}
  },
  async release(id){const record=records.get(id);if(!record)throw new EngineError('NOT_FOUND','Scientific export no longer exists.');records.delete(id);await dispose(record);},
  async clear(){const all=[...records.values()];records.clear();const outcomes=await Promise.allSettled(all.map(dispose)),failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;},
  get size(){return records.size;}
 };
}
