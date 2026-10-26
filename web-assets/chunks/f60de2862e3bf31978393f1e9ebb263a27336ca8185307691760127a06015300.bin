import "../../runtime-context.js?v=0.25.0";
import {allocateWasmMemory,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import createPrepare from '../vendor/learned-prepare/prepare.js';
import {LEARNED_PREPARE_WASM} from './learned-prepare-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {alikedShape} from './aliked-worker.js';
import {validateRgbRows} from './rgb-row-source.js';
import {createRgbRowRetirement} from './rgb-row-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
export async function prepareAlikedRows(source,{budget,signal,onProgress,wasmBinary,onOwner}={}){
 const {width,height}=source,[w,h]=alikedShape(width,height),n=w*h;requireValue(w>0&&h>0&&typeof source.readRows==='function','ALIKED source row dimensions');
 const support=Math.ceil(Math.max(4*Math.max((height/h-1)/2,.001),3))+2,maximum=Math.ceil((32*1024**2+width*16+n*12+(support*2+4)*w*24)/65536)*65536;
 const controller=new AbortController(),currentSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal,rowsOwner=createRgbRowRetirement(),pointers=new Set();let m,context,freeHeap,freeOutput,result,reads=0,finished=false,disposal,settle;
 const settled=new Promise(resolve=>settle=resolve),cancel=()=>controller.abort();
 const releaseHeap=()=>{if(context){m._learned_rows_destroy(context);context=undefined;}for(const p of [...pointers]){m._free(p);pointers.delete(p);}freeHeap?.();freeHeap=undefined;m=undefined;};
 const releaseOutput=()=>{freeOutput?.();freeOutput=undefined;};
 const release=()=>{
  cancel();if(disposal)return disposal;
  // Preserve the historical immediate close after completed construction.
  if(finished&&!rowsOwner.hasLiveRows){releaseHeap();releaseOutput();return;}
  disposal=(async()=>{await settled;await rowsOwner.dispose();releaseHeap();releaseOutput();})().finally(()=>{disposal=undefined;});return disposal;
 };
 const owner=Object.freeze({release,dispose:release,cancel,get hasLiveRows(){return rowsOwner.hasLiveRows;}});let failed=false,primary;
 try{
  onOwner?.(owner);checkAbort(currentSignal);freeHeap=budget.reserve(maximum);freeOutput=budget.reserve(n*12);
  const bytes=wasmBinary??await fetchM3Asset(new URL('../vendor/learned-prepare/prepare.wasm',import.meta.url),LEARNED_PREPARE_WASM,currentSignal);checkAbort(currentSignal);
  m=await createPrepare({wasmBinary:bytes,wasmMemory:allocateWasmMemory({initial:256,maximum:maximum/65536})});
  checkAbort(currentSignal);const alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw wasmAllocationFailure(m,'ALIKED row preparation allocation failed.',Math.max(8,n));pointers.add(p);return p;};
  context=m._learned_rows_create(width,height,w,h);if(!context)throw wasmAllocationFailure(m,'ALIKED row filter allocation failed.',undefined);
  const k=m._learned_rows_ksize(context),row=alloc(width*3),ids=alloc(k*8),refs=alloc(k*8),out=alloc(n*12),active=new Map(),pool=[];
  for(let y=0;y<h;y++){
   if(y%8===0)await controlCheckpoint(currentSignal);m._learned_rows_support(context,y,ids);const indices=copyTypedArray(m.HEAP32.subarray(ids/4,ids/4+k*2),{label:'aliked-rows-output'}),needed=new Set(indices);
   for(const [key,p] of active)if(!needed.has(key)){active.delete(key);pool.push(p);}
   for(const key of needed)if(!active.has(key)){
    checkAbort(currentSignal);const lease=rowsOwner.hold(await source.readRows(key,1,{signal:currentSignal}));reads++;let rowFailed=false,rowPrimary;
    try{checkAbort(currentSignal);m.HEAPU8.set(validateRgbRows(lease,width,1),row);}catch(error){rowFailed=true;rowPrimary=error;throw error;}
    finally{await retireCompositeOwners([()=>rowsOwner.release(lease)],rowFailed?{primary:rowPrimary}:{});}
    checkAbort(currentSignal);
    const p=pool.pop()??alloc(w*24);m._learned_rows_horizontal(context,row,p);active.set(key,p);
   }
   m.HEAP32.set(Int32Array.from(indices,key=>active.get(key)),refs/4);m._learned_rows_vertical(context,refs,y,out);
   if(y%16===15)onProgress?.({phase:'learned-preparation',fraction:(y+1)/h});
  }
  checkAbort(currentSignal);const tensor=copyTypedArray(m.HEAPF32.subarray(out/4,out/4+n*3),{label:'aliked-rows-output'});result={tensor,release,metrics:{sourceReads:reads,preparedShape:[1,3,h,w],maximumHeapBytes:maximum,actualHeapBytes:m.HEAPU8.byteLength,preparation:'native-separable-support-rows'}};
 }catch(error){failed=true;primary=error;}
 try{await retireCompositeOwners([()=>rowsOwner.dispose()],failed?{primary}:{});}catch(error){if(!failed){failed=true;primary=error;}}
 try{if(!rowsOwner.hasLiveRows)releaseHeap();}catch(error){if(!failed){failed=true;primary=error;}}
 if(!failed)try{checkAbort(currentSignal);}catch(error){failed=true;primary=error;}
 try{if(failed&&!rowsOwner.hasLiveRows)releaseOutput();}catch(error){if(!failed){failed=true;primary=error;}}finally{finished=true;settle();}
 if(failed)throw primary;return result;
}
