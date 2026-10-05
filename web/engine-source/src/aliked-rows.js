import {allocateWasmMemory,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import createPrepare from '../vendor/learned-prepare/prepare.js';
import {LEARNED_PREPARE_WASM} from './learned-prepare-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {alikedShape} from './aliked-worker.js';
import {validateRgbRows} from './rgb-row-source.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
export async function prepareAlikedRows(source,{budget,signal,onProgress,wasmBinary}={}){
 const {width,height}=source,[w,h]=alikedShape(width,height),n=w*h;requireValue(w>0&&h>0&&typeof source.readRows==='function','ALIKED source row dimensions');
 const support=Math.ceil(Math.max(4*Math.max((height/h-1)/2,.001),3))+2,maximum=Math.ceil((32*1024**2+width*16+n*12+(support*2+4)*w*24)/65536)*65536;
 const freeHeap=budget.reserve(maximum),pointers=[];let m,context,freeOutput,complete=false,reads=0;
 try{
  freeOutput=budget.reserve(n*12);
  const bytes=wasmBinary??await fetchM3Asset(new URL('../vendor/learned-prepare/prepare.wasm',import.meta.url),LEARNED_PREPARE_WASM,signal);checkAbort(signal);
  m=await createPrepare({wasmBinary:bytes,wasmMemory:allocateWasmMemory({initial:256,maximum:maximum/65536})});
  const alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw wasmAllocationFailure(m,'ALIKED row preparation allocation failed.',Math.max(8,n));pointers.push(p);return p;};
  context=m._learned_rows_create(width,height,w,h);if(!context)throw wasmAllocationFailure(m,'ALIKED row filter allocation failed.',undefined);
  const k=m._learned_rows_ksize(context),row=alloc(width*3),ids=alloc(k*8),refs=alloc(k*8),out=alloc(n*12),active=new Map(),pool=[];
  for(let y=0;y<h;y++){
   if(y%8===0)await controlCheckpoint(signal);m._learned_rows_support(context,y,ids);const indices=copyTypedArray(m.HEAP32.subarray(ids/4,ids/4+k*2),{label:'aliked-rows-output'}),needed=new Set(indices);
   for(const [key,p] of active)if(!needed.has(key)){active.delete(key);pool.push(p);}
   for(const key of needed)if(!active.has(key)){
    checkAbort(signal);const lease=await source.readRows(key,1,{signal});reads++;
    try{m.HEAPU8.set(validateRgbRows(lease,width,1),row);}finally{lease.release();}
    const p=pool.pop()??alloc(w*24);m._learned_rows_horizontal(context,row,p);active.set(key,p);
   }
   m.HEAP32.set(Int32Array.from(indices,key=>active.get(key)),refs/4);m._learned_rows_vertical(context,refs,y,out);
   if(y%16===15)onProgress?.({phase:'learned-preparation',fraction:(y+1)/h});
  }
  checkAbort(signal);const tensor=copyTypedArray(m.HEAPF32.subarray(out/4,out/4+n*3),{label:'aliked-rows-output'});complete=true;return {tensor,release:freeOutput,metrics:{sourceReads:reads,preparedShape:[1,3,h,w],maximumHeapBytes:maximum,actualHeapBytes:m.HEAPU8.byteLength,preparation:'native-separable-support-rows'}};
 }finally{if(context)m._learned_rows_destroy(context);for(const p of pointers)m._free(p);freeHeap();if(!complete)freeOutput?.();}
}
