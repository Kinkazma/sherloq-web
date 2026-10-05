import "../../runtime-context.js?v=0.14.5";
import {allocateTypedArray} from './allocation.js';
import {EngineError,normalizeResourceError,isRecoverableResourceError,serializeEngineError,deserializeEngineError,resourceAllocationKind} from './errors.js';

export function createSiftWorkerResources(post){
 let sequence=0,currentPhase='cpu';const pending=new Map(),outputs=[],allocated=new WeakMap();
 const call=data=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{post({resourceRequest:{...data,id}});}catch(error){pending.delete(id);reject(error);}});
 const notify=data=>post({resourceEvent:data});
 return {
  reply(data){const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(deserializeEngineError(data.error)):job.resolve(data);},
  fail(error){for(const job of pending.values())job.reject(error);pending.clear();},
  async phase(kind,description){await call({action:'phase',kind,...description});currentPhase=kind;},
  async backing(kind,bytes,label){const id=++sequence;await call({action:'backing',backingId:id,kind,bytes,label});let released=false;const release=()=>{if(released)return;released=true;notify({action:'release',backingId:id});};release.backingId=id;return release;},
  async recover(label,work,{bytes,kind}={}){let retry=false;for(;;){try{const result=await work();if(retry)await call({action:'recovered',label});return result;}catch(caught){const error=normalizeResourceError(caught,{...(bytes===undefined?{}:{requestedBytes:bytes}),...(kind?{allocationKind:kind}:{})});if(!isRecoverableResourceError(error))throw error;await call({action:'recover',label,error:serializeEngineError(error),bytes:error.details?.requestedBytes,kind:resourceAllocationKind(error)??undefined,phase:currentPhase});retry=true;}}},
  async allocate(Type,length,label){const bytes=length*Type.BYTES_PER_ELEMENT;return this.recover(label,async()=>{const release=await this.backing('array-buffer',bytes,label);try{const data=allocateTypedArray(Type,length,{label});outputs.push(release);allocated.set(data.buffer,release.backingId);return data;}catch(error){release();throw error;}},{bytes,kind:'array-buffer'});},
  async outputMetadata(result){const metadata={};for(const [key,value] of Object.entries(result))if(ArrayBuffer.isView(value)){let id=allocated.get(value.buffer);if(id===undefined){const release=await this.backing('array-buffer',value.buffer.byteLength,'sift-output-'+key);outputs.push(release);id=release.backingId;allocated.set(value.buffer,id);}metadata[key]=id;}return metadata;},
  clearOutputs(){outputs.length=0;},
  releaseOutputs(){for(const release of outputs)release();outputs.length=0;},
  heap(bytes){notify({action:'heap',bytes});}
 };
}
