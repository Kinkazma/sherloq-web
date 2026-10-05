import {wasmAllocationFailure} from './allocation.js';
import {EngineError,checkAbort,controlCheckpoint,requireValue} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
// Same global pyramid and in-place update order as OpenCV. Only matrix storage
// changes; no independent optical-flow tiles or displacement clipping.
export const stereoPagedFlowBytes=(width,height)=>20*1024**2+width*Math.min(96,height)*80+width*32;
export async function stereoPagedFlow(image,offset,plane,{budget,signal,onProgress,original=false,storage='temporary'}={}){
 const {width,height}=image.surface.descriptor,w=width-offset;
 requireValue(Number.isInteger(offset)&&offset>=1&&w>0&&height>0,'Invalid stereo pair.');
 const workspace=stereoPagedFlowBytes(w,height);
 if(workspace>1000*1024**2)throw new EngineError('MEMORY_LIMIT','The complete Farneback row stencils exceed the available module space.');
 const release=budget.reserve(workspace),stores=new Map(),metrics={workspaceBytes:workspace,reads:0,writes:0,readBytes:0,writeBytes:0,temporaryPeakBytes:0,heapBytes:0,preflightExecutions:0};let next=0,temporaryBytes=0,m,error,lo=Infinity,hi=-Infinity;
 try{
  const session=image.session??(storage==='temporary'?await image.ensureTemporarySession?.():undefined);
  const {default:create}=await import('../vendor/stereo-paged/stereo-paged.js');m=await create();let last=performance.now();
  m.checkpoint=async(completed,total)=>{checkAbort(signal);if(performance.now()-last<20)return;onProgress?.({phase:'stereo-paged-'+m.stage.phase,level:m.stage.level,iteration:m.stage.iteration,completed,total,...metrics});await controlCheckpoint(signal);last=performance.now();};
  m.allocate=async bytes=>{checkAbort(signal);const id=next++,store=await createSegmentedBytes(bytes,{budget,storage,temporarySession:session,getTemporarySession:image.ensureTemporarySession,signal});stores.set(id,store);temporaryBytes+=bytes;metrics.temporaryPeakBytes=Math.max(metrics.temporaryPeakBytes,temporaryBytes);return id;};
  m.drop=async id=>{const store=stores.get(id);if(!store)return;temporaryBytes-=store.byteLength;await store.dispose();stores.delete(id);};
  m.transfer=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=m.HEAPU8.subarray(pointer,pointer+length),store=stores.get(id);if(write){await store.write(bytes,offset);metrics.writes++;metrics.writeBytes+=length;}else{await store.readInto(bytes,offset);metrics.reads++;metrics.readBytes+=length;}};
  m.sourceRows=async(y,h,pointer)=>{const part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{m.HEAPU8.set(part.pixels.data,pointer);}finally{part.release();}};
  m.outputRow=async(y,width,pointer)=>{const values=m.HEAPF32.subarray(pointer/4,pointer/4+width);for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}await plane.write(values,0,y,width,1,{signal});};
  error=m._malloc(1024);if(!error)throw wasmAllocationFailure(m,'Farneback error buffer allocation failed.',1024);
  const code=await m.ccall('stereo_paged_flow','number',['number','number','number','number','number'],[width,height,offset,+original,error],{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);await plane.store.flush();metrics.heapBytes=m.HEAPU8.byteLength;return {lo,hi,heapBytes:metrics.heapBytes,paged:true,metrics};
 }finally{if(m){if(error)m._free(error);for(const key of ['checkpoint','allocate','drop','transfer','sourceRows','outputRow'])m[key]=null;}await Promise.allSettled([...stores.values()].map(s=>s.dispose()));release();}
}
