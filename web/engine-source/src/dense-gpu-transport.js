import {allocateBuffer} from './allocation.js';
import {EngineError,requireValue} from './errors.js';

const keys=['queryDescriptors','candidateDescriptors','best'];

// Active lengths are independent of the backing capacities returned by the
// GPU. Only standalone, distinct buffers owned by this RPC may be transferred.
export function denseGpuInputTransfer(job){
 const {pairCount,dimensions,distanceDimensions=dimensions}=job??{};
 requireValue(Number.isSafeInteger(pairCount)&&pairCount>=0&&Number.isInteger(dimensions)&&dimensions>0&&dimensions<=128&&Number.isInteger(distanceDimensions)&&distanceDimensions>=dimensions&&distanceDimensions<=128,'Invalid dense GPU transport dimensions.');
 const lengths=[pairCount*dimensions,pairCount*dimensions,pairCount],buffers=keys.map((key,index)=>{
  const view=job[key];requireValue(view instanceof Float32Array&&view.length===lengths[index]&&view.byteOffset===0&&view.buffer instanceof ArrayBuffer&&view.buffer.byteLength>=view.byteLength,'Invalid dense GPU transport input.');try{new Uint8Array(view.buffer);}catch(cause){throw new EngineError('WORKER_MESSAGE_FAILED','Dense GPU transport backing is detached.',{cause});}return view.buffer;
 });
 requireValue(new Set(buffers).size===buffers.length,'Dense GPU transport inputs must have distinct backings.');return buffers;
}

export function denseGpuInputPublication(job){
 denseGpuInputTransfer(job);return Object.fromEntries(keys.map(key=>[key,job[key]]));
}

export function restoreDenseGpuInputs(job,inputs){
 const candidate={...job,...Object.fromEntries(keys.map(key=>[key,inputs?.[key]]))};denseGpuInputTransfer(candidate);Object.assign(job,denseGpuInputPublication(candidate));return job;
}

export function denseGpuResultTransfer(result,inputs){
 const buffers=keys.map(key=>inputs[key].buffer);
 if(result!==null&&result!==undefined){requireValue(result instanceof Float32Array&&result.buffer instanceof ArrayBuffer&&!buffers.includes(result.buffer),'Invalid dense GPU transport result.');buffers.push(result.buffer);}
 return buffers;
}

// Exactly one native distance call is active. Its reservation follows the
// three backings through both worker hops and back; idle reuse stays charged.
export class DenseGpuTransport {
 constructor({request,post,read,reuse=false}){this.request=request;this.post=post;this.read=read;this.reuse=reuse;this.serial=0;this.active=null;this.cache=null;this.closed=false;this.metrics={batches:0,bufferAllocations:0,allocatedBytes:0,copiedBytes:0,reusedBuffers:0,reusedBytes:0,retainedBytes:0,peakRetainedBytes:0,evictions:0};}
 async batch({ranges,pairCount,dimensions,distanceDimensions=dimensions}){
  if(this.closed)throw new EngineError('DISPOSED','Dense GPU transport closed.');
  if(this.active)throw new EngineError('BUSY','Dense GPU transport already executing.');
  requireValue(Number.isSafeInteger(pairCount)&&pairCount>=0&&Number.isInteger(dimensions)&&dimensions>0&&dimensions<=128&&Number.isInteger(distanceDimensions)&&distanceDimensions>=dimensions&&distanceDimensions<=128,'Invalid dense GPU transport dimensions.');
  const lengths=[pairCount*dimensions,pairCount*dimensions,pairCount],bytes=lengths.map(length=>length*4);
  requireValue(ranges.length===3&&ranges.every((range,index)=>range.byteLength===bytes[index]),'Invalid dense GPU transport ranges.');
  const previous=this.cache,reuse=previous&&previous.buffers.every((buffer,index)=>buffer.byteLength>=bytes[index]),id=++this.serial;
  const capacities=reuse?previous.buffers.map(buffer=>buffer.byteLength):bytes,stagingBytes=capacities.reduce((sum,value)=>sum+value,0)+capacities[2];
  this.cache=null;this.metrics.retainedBytes=0;
  const state=this.active={id,capacities,granted:false,returned:null};
  if(previous&&!reuse)previous.buffers=null;
  try{
   const allowed=await this.request('gpuPrepare',{id,bytes:stagingBytes,...(previous?reuse?{reuseId:previous.id}:{retireId:previous.id}:{})});
   if(!allowed)return null;
   state.granted=true;
   const buffers=reuse?previous.buffers:capacities.map(size=>{const buffer=allocateBuffer(size,{label:'dense-gpu-transport'});this.metrics.bufferAllocations++;this.metrics.allocatedBytes+=size;return buffer;});
   const job={pairCount,dimensions,distanceDimensions,reuseGpuTransport:this.reuse};
   for(let index=0;index<keys.length;index++){const source=this.read(ranges[index]);new Uint8Array(buffers[index],0,bytes[index]).set(source);job[keys[index]]=new Float32Array(buffers[index],0,lengths[index]);}
   this.metrics.batches++;this.metrics.copiedBytes+=bytes.reduce((sum,value)=>sum+value,0);
   if(reuse){this.metrics.reusedBuffers+=3;this.metrics.reusedBytes+=bytes.reduce((sum,value)=>sum+value,0);}
   const response=await this.request('gpuRequest',{id,job},denseGpuInputTransfer(job));
   if(response.inputs){restoreDenseGpuInputs(job,response.inputs);const returned=denseGpuInputTransfer(job);requireValue(returned.every((buffer,index)=>buffer.byteLength===capacities[index]),'Dense GPU transport returned unexpected capacities.');if(!response.error&&!response.discard)state.returned=returned;}
   if(response.error)throw Object.assign(new Error(response.error.message),{code:response.error.code});
   return response.result;
  }catch(error){throw error;}
 }
 consumed(){
  const state=this.active;if(!state)return;this.active=null;
  if(state.granted){
   if(state.returned&&!this.closed&&this.reuse){this.cache={id:state.id,buffers:state.returned};this.metrics.retainedBytes=state.capacities.reduce((sum,value)=>sum+value,0);this.metrics.peakRetainedBytes=Math.max(this.metrics.peakRetainedBytes,this.metrics.retainedBytes);this.post({gpuConsumed:{id:state.id,retained:true}});}
   else this.post({gpuConsumed:state.id});
  }
 }
 drop(id){if(this.closed||this.active||this.cache?.id!==id)return false;this.cache=null;this.metrics.retainedBytes=0;this.metrics.evictions++;return true;}
 dispose(){if(this.closed)return;this.closed=true;this.cache=null;this.metrics.retainedBytes=0;}
 snapshot(){return {...this.metrics};}
}
