import "../../runtime-context.js?v=0.30.0";
import {allocateTypedArray} from './allocation.js';
import {EngineError,requireValue,normalizeResourceError,isRecoverableResourceError,serializeEngineError,deserializeEngineError,resourceAllocationKind} from './errors.js';
import {classicSiftRetirement,classicSiftRetireAll,attachClassicSiftCleanup} from './classic-sift-retirement.js';
export function createClassicSiftWorkerResources(post){
 let sequence=0,currentPhase='cpu';const pending=new Map(),outputs=new Map(),allocated=new WeakMap();
 const call=data=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{post({resourceRequest:{...data,id}});}catch(error){pending.delete(id);reject(error);}});
 return{
  reply(data){const job=pending.get(data.id);requireValue(job,'Unexpected SIFT resource ACK.');pending.delete(data.id);Object.hasOwn(data,'error')?job.reject(deserializeEngineError(data.error)):job.resolve(data);},
  fail(error){for(const job of pending.values())job.reject(error);pending.clear();},
  async phase(kind,description){await call({action:'phase',kind,...description});currentPhase=kind;},
  async backing(kind,bytes,label){const id=++sequence;await call({action:'backing',backingId:id,kind,bytes,label});const release=classicSiftRetirement([()=>call({action:'release',backingId:id})]);release.backingId=id;return release;},
  async recover(label,work,{bytes,kind}={}){let retry=false;for(;;){try{const value=await work();if(retry)await call({action:'recovered',label});return value;}catch(caught){const error=normalizeResourceError(caught,{...(bytes===undefined?{}:{requestedBytes:bytes}),...(kind?{allocationKind:kind}:{})});if(!isRecoverableResourceError(error))throw error;await call({action:'recover',label,error:serializeEngineError(error),bytes:error.details?.requestedBytes,kind:resourceAllocationKind(error)??undefined,phase:currentPhase});retry=true;}}},
  async allocate(Type,length,label){const bytes=length*Type.BYTES_PER_ELEMENT;return this.recover(label,async()=>{const release=await this.backing('array-buffer',bytes,label);outputs.set(release.backingId,release);try{const data=allocateTypedArray(Type,length,{label});allocated.set(data.buffer,release.backingId);return data;}catch(error){try{await release();outputs.delete(release.backingId);}catch(cleanup){attachClassicSiftCleanup(error,cleanup);}throw error;}},{bytes,kind:'array-buffer'});},
  async outputMetadata(result){const metadata={};for(const[key,value]of Object.entries(result))if(ArrayBuffer.isView(value)){let id=allocated.get(value.buffer);if(id===undefined){const release=await this.backing('array-buffer',value.buffer.byteLength,'sift-output-'+key);outputs.set(release.backingId,release);id=release.backingId;allocated.set(value.buffer,id);}metadata[key]=id;}return metadata;},
  async retireUnused(metadata={}){const keep=new Set(Object.values(metadata));await classicSiftRetireAll([...outputs].filter(([id])=>!keep.has(id)).map(([id,release])=>async()=>{await release();outputs.delete(id);}));},
  transferOutputs(metadata){for(const id of new Set(Object.values(metadata)))outputs.delete(id);},
  async releaseOutputs(){await classicSiftRetireAll([...outputs].map(([id,release])=>async()=>{await release();outputs.delete(id);}));},
  submitted(){post({resourceEvent:{action:'submitted'}});},
  heap(bytes){post({resourceEvent:{action:'heap',bytes}});}
 };
}
