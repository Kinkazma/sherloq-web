import{EngineError,requireValue,checkAbort,controlCheckpoint}from'./errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {allocateTypedArray} from './allocation.js';
export const NEURAL_SPATIAL_HEAP_BYTES=64*1024**2;
// onRows consumes a temporary owned Float32Array before its reservation ends.
// Projection coordinates and vector tails always belong to the whole output.
export async function createNeuralSpatialRows(factory,{budget}){
 let resident=budget.reserve(NEURAL_SPATIAL_HEAP_BYTES),backing,module,busy=false,disposed=false;
 const scheduler=getExecutionScheduler(budget);
 try{module=await scheduler.run({cpu:1,resourceOwner:'neural',domains:{wasm:NEURAL_SPATIAL_HEAP_BYTES},label:'neural-spatial-init'},()=>factory());requireValue(module.HEAPU8.length===NEURAL_SPATIAL_HEAP_BYTES,'Fixed spatial heap required');backing=budget.registerBacking?.('wasm',module.HEAPU8.byteLength,{owner:'neural',label:'spatial-heap'});}catch(error){resident();throw error;}
 return{
  async run({input,width,height,outWidth,outHeight,nearest},{signal,onRows,rowsPerBlock,onProgress,startRow=0,borrowRows=false,resourceOperation}={}){
   if(busy)throw new EngineError('BUSY','Neural projection busy');
   requireValue(!disposed&&[width,height,outWidth,outHeight].every(Number.isSafeInteger)&&width>0&&height>0&&width<=512&&height<=512&&outWidth>0&&outHeight>0&&outWidth<=131072&&outHeight<=131072&&typeof nearest==='boolean'&&input instanceof Float32Array&&input.length===width*height&&typeof onRows==='function','Neural spatial rows domain');
   requireValue((rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0)&&Number.isSafeInteger(startRow)&&startRow>=0&&startRow<=outHeight,'Projection row group');checkAbort(signal);
   const overhead=input.byteLength+16384,heapRows=Math.floor((NEURAL_SPATIAL_HEAP_BYTES-2*1024**2-input.byteLength-outWidth*8)/(outWidth*4)),rows=Math.min(outHeight,rowsPerBlock??Math.max(1,Math.floor(1048576/outWidth)),heapRows,Math.floor((budget.limit-budget.retained-budget.active-overhead)/(outWidth*4)));
   if(rows<1)throw new EngineError('MEMORY_LIMIT','One projection row does not fit the shared budget');
   busy=true;let staging,ip,op;const started=performance.now();let blocks=0,computeMs=0,consumerMs=0;
   try{
    staging=budget.reserve(overhead+(borrowRows?0:rows*outWidth*4));ip=module._malloc(input.byteLength);if(!ip)throw new EngineError('MEMORY_ALLOCATION','Spatial input malloc failed',{details:{allocationKind:'wasm',requestedBytes:input.byteLength}});op=module._malloc(rows*outWidth*4);if(!op)throw new EngineError('MEMORY_ALLOCATION','Spatial band malloc failed',{details:{allocationKind:'wasm',requestedBytes:rows*outWidth*4}});module.HEAPF32.set(input,ip/4);
    for(let y=startRow;y<outHeight;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,outHeight-y);let at=performance.now();await scheduler.run({cpu:1,signal,resourceOwner:resourceOperation?.owner??'neural',operation:resourceOperation,label:'neural-spatial-rows'},()=>{if(module._neural_spatial_rows(ip,width,height,outWidth,outHeight,y,count,Number(nearest),op)!==1)throw new EngineError('INVALID_INPUT','Spatial projection rejected');});const view=module.HEAPF32.subarray(op/4,op/4+count*outWidth),values=borrowRows?view:allocateTypedArray(Float32Array,view.length,{label:'neural-spatial-band',operation:resourceOperation});if(!borrowRows)values.set(view);computeMs+=performance.now()-at;checkAbort(signal);at=performance.now();await onRows(values,{y,rows:count,width:outWidth,height:outHeight,borrowed:borrowRows});consumerMs+=performance.now()-at;checkAbort(signal);blocks++;onProgress?.({phase:'neural-projection-rows',completed:y+count,total:outHeight});}
    checkAbort(signal);return{totalMs:performance.now()-started,computeMs,consumerMs,blocks,rowsPerBlock:rows,heapCapacityBytes:NEURAL_SPATIAL_HEAP_BYTES};
   }finally{if(ip)module._free(ip);if(op)module._free(op);staging?.();busy=false;}
  },
  dispose(){requireValue(!busy,'Neural projection busy');if(disposed)return;disposed=true;module=null;backing?.();backing=null;resident();resident=null;budget.notifyBackingRelease?.('wasm',NEURAL_SPATIAL_HEAP_BYTES);}
 };
}
