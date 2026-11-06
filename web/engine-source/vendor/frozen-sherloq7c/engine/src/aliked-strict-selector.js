import createPrepare from '../vendor/learned-prepare/aliked-controls-v1/prepare.js';
import {LEARNED_PREPARE_WASM} from './learned-prepare-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {allocateWasmMemory,allocateOwnedTypedArray,wasmAllocationFailure} from './allocation.js';
import {alikedNativeParameters} from './aliked-native-parameters.js';
import {requireValue,checkAbort} from './errors.js';

/** The existing native selector, including strict Float32 selected detection threshold,
 * fallback and its exact std::sort tie behavior above20000. No graph runs. */
export async function createAlikedNativeSelector({budget,maximumCells,signal,wasmBinary,detectionThreshold=.2}={}){
 alikedNativeParameters({detectionThreshold});requireValue(budget?.reserve&&Number.isSafeInteger(maximumCells)&&maximumCells>0,'ALIKED native selection needs admitted cell capacity.');const maximum=Math.ceil((32*1024**2+maximumCells*17+80000)/65536)*65536;requireValue(maximum<=2048*1024**2,'ALIKED native selection exceeds the unchanged32bit Wasm capacity.');const free=budget.reserve(maximum);let m,complete=false,closed=false;
 try{const binary=wasmBinary??await fetchM3Asset(new URL('../vendor/learned-prepare/aliked-controls-v1/prepare.wasm',import.meta.url),LEARNED_PREPARE_WASM,signal);checkAbort(signal);m=await createPrepare({wasmBinary:binary,wasmMemory:allocateWasmMemory({initial:256,maximum:maximum/65536})});complete=true;
  return{maximumHeapBytes:maximum,
   select(scores,nms,mask,width,height,mean){requireValue(!closed&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&scores instanceof Float32Array&&nms instanceof Float32Array&&mask instanceof Uint8Array&&scores.length===width*height&&nms.length===scores.length&&mask.length===scores.length&&scores.length<=maximumCells&&Number.isFinite(mean)&&Math.fround(mean)===mean,'Invalid native ALIKED selection arrays.');checkAbort(signal);const pointers=[],alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw wasmAllocationFailure(m,'ALIKED common selector allocation failed.',n);pointers.push(p);return p;};let output;
    try{const sp=alloc(scores.byteLength),np=alloc(nms.byteLength),mp=alloc(mask.byteLength),op=alloc(80000);m.HEAPF32.set(scores,sp/4);m.HEAPF32.set(nms,np/4);m.HEAPU8.set(mask,mp);const count=m._aliked_select_threshold(sp,np,mp,width,height,mean,detectionThreshold,op);if(count<0)throw wasmAllocationFailure(m,'Native ALIKED common selection failed.');requireValue(count<=20000,'Native ALIKED detector cap changed.');output=allocateOwnedTypedArray(Int32Array,count,{budget,owner:'aliked-common-native-indices'});output.data.set(m.HEAP32.subarray(op/4,op/4+count));return{indices:output.data,release:()=>output.release(),actualHeapBytes:m.HEAPU8.byteLength};}
    catch(error){output?.release();throw error;}finally{for(const p of pointers)m._free(p);}
   },
   dispose(){if(closed)return;closed=true;m=null;free();}};
 }finally{if(!complete)free();}
}
