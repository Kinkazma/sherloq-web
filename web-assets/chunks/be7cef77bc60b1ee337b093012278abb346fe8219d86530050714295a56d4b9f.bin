import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
import {noisesnifferOwnerRetirement as acknowledgedRetirement} from './noisesniffer-owner-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
const MiB=1024**2,HEAP_MAX=64*MiB,MAX_COEFFICIENT_BYTES=24*MiB;
async function loadModule(){try{return(await import('../vendor/ela-gpu/entropy/jpeg-coeff-stream.js')).default;}catch(error){throw new EngineError('CODEC_UNAVAILABLE','Native JPEG coefficient entropy unavailable.',{cause:error});}}
// One native entropy state per budget/service. Coefficients are copied into a
// bounded imported heap; only acknowledged external output crosses Asyncify.
export class ElaJpegCoefficientEncoder{
 constructor(budget,{load=loadModule}={}){requireValue(budget?.reserve&&typeof load==='function','Native JPEG entropy budget/loader required.');this.budget=budget;this.load=load;this.module=null;this.memory=null;this.ready=null;this.heapBacking=null;this.heapFree=null;this.retireOwner=null;this.unregister=null;this.writer=null;this.busy=false;this.closed=false;this.pointers=new Set();this.fallbackFailures=new WeakSet();this.retirementNeeded=false;this.nativeNeedsClose=false;}
 mark(error){if(error&&typeof error==='object')this.fallbackFailures.add(error);return error;}
 mayFallback(error){return !!error&&typeof error==='object'&&this.fallbackFailures.has(error);}
 reserve(bytes){try{return this.budget.reserve(bytes);}catch(error){throw this.mark(error);}}
 async initialize(signal){
  if(this.retirementNeeded||this.retireOwner?.started)await this.retireOwner?.();if(this.module)return this.module;
  if(!this.ready)this.ready=(async()=>{
   let retiredBytes,actual=0;this.retireOwner=acknowledgedRetirement([
    async()=>{if(this.nativeNeedsClose){await this.module?._jpeg_coeff_close();this.nativeNeedsClose=false;}},
    async()=>{if(this.nativeNeedsClose)throw new EngineError('BUSY','Native entropy close ACK is pending.');for(const pointer of [...this.pointers]){await this.module?._free(pointer);this.pointers.delete(pointer);}},
    ()=>{if(this.nativeNeedsClose||this.pointers.size)throw new EngineError('BUSY','Native entropy input retirement is pending.');actual=Math.max(actual,this.module?.HEAPU8.byteLength??this.memory?.buffer.byteLength??0);if(this.module)closeMemoryRanges(this.module);this.module=null;this.memory=null;this.ready=null;},
    async()=>{if(this.module||this.memory)throw new EngineError('BUSY','Native entropy heap is still referenced.');if(this.heapBacking){retiredBytes=await this.heapBacking();this.heapBacking=null;}},
    ()=>{if(this.module||this.memory||this.heapBacking)throw new EngineError('BUSY','Native entropy backing ACK is pending.');if(actual&&retiredBytes!==0)this.budget.notifyBackingRelease?.('wasm',retiredBytes??actual);},
    async()=>{if(this.module||this.memory||this.heapBacking||this.nativeNeedsClose||this.pointers.size)throw new EngineError('BUSY','Native entropy owner is still live.');await this.heapFree?.();this.heapFree=null;}
   ],{onRetired:()=>{this.retirementNeeded=false;this.unregister?.();this.unregister=null;}});
   this.heapFree=this.reserve(HEAP_MAX);this.unregister??=this.budget.registerAsyncReclaimer?.(async()=>{if(this.busy)return 0;const before=this.budget.total();await this.retireOwner();return Math.max(0,before-this.budget.total());},{allocationKind:'wasm',owner:'ela',label:'idle-native-JPEG-coefficient-heap'});
   try{this.memory=allocateWasmMemory({initial:256,maximum:1024},{label:'native-JPEG-coefficient-heap'});}catch(error){throw this.mark(error);}this.heapBacking=this.budget.registerBacking?.('wasm',HEAP_MAX,{owner:'ela',label:'native-JPEG-coefficient-heap',state:'reserved'});actual=this.memory.buffer.byteLength;this.heapBacking?.materialize(actual);const create=await this.load();checkAbort(signal);
   const module=await create({wasmMemory:this.memory,writeEncoded:async(pointer,length)=>{requireValue(this.writer&&this.module,'Native JPEG output owner is idle.');await this.writer(wasmRange(this.module,pointer,length));}});this.module=module;actual=module.HEAPU8.byteLength;this.heapBacking?.materialize(actual);checkAbort(signal);return module;
  })().catch(error=>{this.ready=null;this.retirementNeeded=true;if(this.load===loadModule&&error?.code==='CODEC_UNAVAILABLE')this.mark(error);throw error;});return this.ready;
 }
 async encode(coefficients,width,height,quality,{signal,writeEncoded,onProgress}={}){
  const blocks=Math.ceil(width/8)*Math.ceil(height/8)+2*Math.ceil(width/16)*Math.ceil(height/16);
  requireValue(coefficients instanceof Int16Array&&[width,height,quality].every(Number.isInteger)&&width>0&&height>0&&width<=65500&&height<=65500&&quality>=1&&quality<=100&&coefficients.length===blocks*64&&typeof writeEncoded==='function','Exact native JPEG coefficients, geometry, quality and output owner required.');checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Native JPEG coefficient encoder closed.');if(this.busy)throw new EngineError('BUSY','Native JPEG coefficient encoder already running.');if(coefficients.byteLength>MAX_COEFFICIENT_BYTES)throw this.mark(new EngineError('GPU_LIMIT','Native JPEG coefficient entropy exceeds its admitted64MiB heap.'));
  this.busy=true;this.fallbackFailures=new WeakSet();let lease,module,pointer,failed=false,primary,bytes=0;const started=performance.now();
  try{if(this.retirementNeeded||this.pointers.size||this.retireOwner?.started)await this.retireOwner?.();lease=await getExecutionScheduler(this.budget).acquire({cpu:1,gpu:0,signal,resourceOwner:'ela',label:'native-JPEG-coefficient-entropy'});module=await this.initialize(signal);checkAbort(signal);pointer=module._malloc(coefficients.byteLength);if(!pointer)throw this.mark(wasmAllocationFailure(module,'Native JPEG coefficient input allocation failed.'));this.pointers.add(pointer);this.heapBacking?.materialize(module.HEAPU8.byteLength);module.HEAP16.set(coefficients,pointer/2);module.ioFailed=false;module.ioFailure=undefined;
   this.writer=async range=>{checkAbort(signal);await writeEncoded(range);bytes+=range.byteLength;onProgress?.({phase:'jpeg-encode',encodedBytes:bytes});checkAbort(signal);};
   let ok;this.nativeNeedsClose=true;try{ok=await module.ccall('jpeg_coeff_encode','number',['number','number','number','number'],[pointer,width,height,quality],{async:true});}catch(error){if(module.ioFailed)throw module.ioFailure;throw error;}this.heapBacking?.materialize(module.HEAPU8.byteLength);if(module.ioFailed)throw module.ioFailure;if(!ok){if(module._jpeg_coeff_error()===2)throw this.mark(wasmAllocationFailure(module,'Native JPEG coefficient entropy allocation failed.'));throw new EngineError('COMPUTE_FAILED','Native JPEG coefficient entropy failed.');}checkAbort(signal);return{encodedBytes:bytes,kernel:'native-coefficient-entropy',heapMaximumBytes:HEAP_MAX,heapCapacityBytes:module.HEAPU8.byteLength,totalMs:performance.now()-started};
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   this.writer=null;try{await retireCompositeOwners([()=>{if(module)this.heapBacking?.materialize(module.HEAPU8.byteLength);},async()=>{if(module&&this.nativeNeedsClose){await module._jpeg_coeff_close();this.nativeNeedsClose=false;}},async()=>{if(module&&pointer&&!this.nativeNeedsClose){await module._free(pointer);this.pointers.delete(pointer);}},()=>lease?.release()],failed?{primary}:{});}finally{this.busy=false;}
  }
 }
 async dispose(){if(this.busy)throw new EngineError('BUSY','Native JPEG entropy must drain before disposal.');this.closed=true;await this.retireOwner?.();}
}
