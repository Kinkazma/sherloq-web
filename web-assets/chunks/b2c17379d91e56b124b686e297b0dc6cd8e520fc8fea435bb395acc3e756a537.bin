import {d2prlSpatialConfig} from './input-side.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from '../../src/errors.js';
import {validateRgbRows} from '../../src/rgb-row-source.js';
import {createRgbRowRetirement} from '../../src/rgb-row-retirement.js';
import {retireCompositeOwners} from '../../src/composite-owner-release.js';
// Resize happens after ToTensor in the released torchvision0.11 pipeline.
// This identity is explicit: modern torchvision otherwise enables antialias.
export const D2PRL_PREPARATION=Object.freeze({id:'d2prl-tensor-bilinear448-noaa-v1',side:448,layout:'NCHW-float32',antialias:false,alignCorners:false});
const PAGE=16*1024**2,MAX=512*1024**2;
export async function createPreparation(factory,{budget,arena,inputSide=448,operation:recover=(_label,work)=>work()}={}){
 const spatial=d2prlSpatialConfig(inputSide),side=spatial.inputSide,OUTPUT=3*side*side*4,preprocessing=side===448?D2PRL_PREPARATION:Object.freeze({...D2PRL_PREPARATION,id:'d2prl-tensor-bilinear'+side+'-noaa-v1',side,spatial});
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');const ownsArena=!arena,resident=[];let module,backing,trackedHeapBytes=0,accounted=PAGE,busy=false,disposed=false,closing=false,disposal;const rowsOwner=createRgbRowRetirement();
 const trackHeap=()=>{const bytes=module.HEAPU8.byteLength;if(bytes===trackedHeapBytes)return;backing?.();backing=budget.registerBacking?.('wasm',bytes,{owner:'d2prl',label:'prepare-heap'});trackedHeapBytes=bytes;};
 try{resident.push(budget.reserve(PAGE));arena??=createWasmTensorArena({budget});module=await factory();requireValue(module.HEAPU8.length<=accounted&&typeof module._d2prl_noaa_rows==='function','Released non-antialiased preparation runtime required');trackHeap();}catch(error){resident.pop()?.();if(ownsArena)arena?.dispose();throw error;}
 async function runRows({readRows,width,height},{signal,onProgress,rowsPerRead,resourceOperation}={}){
  if(busy)throw new EngineError('BUSY','Preparation busy');requireValue(!disposed&&!closing&&typeof readRows==='function'&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=131072),'Qualified RGB row-source geometry required');requireValue(rowsPerRead===undefined||Number.isSafeInteger(rowsPerRead)&&rowsPerRead>0,'Preparation row group');
  const rows=Math.min(height,rowsPerRead??2,2),inputBytes=width*Math.min(height,2)*3,normalizedBytes=inputBytes*4,required=inputBytes+normalizedBytes+OUTPUT+PAGE,target=Math.max(accounted,Math.ceil(required/PAGE)*PAGE);if(target>MAX)throw new EngineError('MEMORY_LIMIT','Row preparation exceeds helper heap limit');checkAbort(signal);busy=true;
  const pointers=[];let borrowed,outputRelease,complete=false,reads=0,readMs=0,normalizeMs=0,resizeMs=0,stamp=performance.now();const began=stamp,checkpoint=async()=>{if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
  try{
   await rowsOwner.retry();checkAbort(signal);
   resourceOperation?.setState('compute');borrowed=budget.reserve(inputBytes+target-accounted);if(target>accounted){resident.push(borrowed.split(target-accounted));accounted=target;}
   const allocate=bytes=>{const ptr=module._malloc(bytes);trackHeap();if(!ptr)throw new EngineError('MEMORY_ALLOCATION','Native D2PRL allocation refused');pointers.push(ptr);requireValue(module.HEAPU8.length<=accounted,'Preparation allocation');return ptr;},ip=allocate(inputBytes),normalized=allocate(normalizedBytes),out=allocate(OUTPUT);
   const scale=Math.fround(height/side);
   for(let y=0;y<side;y++){
    await checkpoint();checkAbort(signal);const sourceY=height===side?y:Math.min(height-1,Math.floor(Math.max(0,Math.fround(scale*(y+.5)-.5)))),last=height===side?sourceY:Math.min(sourceY+1,height-1),count=last-sourceY+1;
    for(let offset=0;offset<count;offset+=rows){let window,primary,failed=false;const n=Math.min(rows,count-offset),at=performance.now();try{resourceOperation?.setState('waiting-child');window=rowsOwner.hold(await recover('preparation:rows:'+sourceY+':'+offset,()=>readRows(sourceY+offset,n,{signal}),{bytes:n*width*3}));resourceOperation?.setState('compute');const rgb=validateRgbRows(window,width,n);checkAbort(signal);module.HEAPU8.set(rgb,ip+offset*width*3);readMs+=performance.now()-at;reads++;}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>rowsOwner.release(window)],failed?{primary}:{});}}
    let at=performance.now();for(let start=0;start<width*count;start+=65536){requireValue(module._d2prl_rgb_normalize(ip,width*count,start,Math.min(start+65536,width*count),normalized)===1,'Normalization rejected');await checkpoint();}normalizeMs+=performance.now()-at;checkAbort(signal);
    at=performance.now();requireValue(module._d2prl_noaa_rows(normalized,3,height,width,side,side,y,y+1,sourceY,count,out)===1,'Non-antialiased bilinear resize rejected');resizeMs+=performance.now()-at;onProgress?.({phase:'preparation-rows',completed:y+1,total:side});
   }
   checkAbort(signal);resourceOperation?.commit();resourceOperation?.setState('waiting-child');const result=await recover('preparation:copy',({resourceOperation:copyOperation}={})=>{copyOperation?.setState('compute');const value=arena.allocate(Float32Array,OUTPUT/4,{signal,zero:false,label:'preparation'});try{value.data.set(module.HEAPF32.subarray(out/4,(out+OUTPUT)/4));return value;}catch(error){value.release();throw error;}},{bytes:OUTPUT});outputRelease=result.release;complete=true;
   return{get data(){return result.data;},shape:[1,3,side,side],preprocessing,release:outputRelease,metrics:{totalMs:performance.now()-began,readMs,normalizeMs,resizeMs,sourceReads:reads,rowsPerRead:rows,sourceBandBytes:inputBytes,heapCapacityBytes:module.HEAPU8.length,admittedHeapBytes:accounted,preprocessing}};
  }finally{resourceOperation?.setState('waiting-child');for(const ptr of pointers)module._free(ptr);borrowed?.();if(!complete)outputRelease?.();busy=false;}
 }
 return{identity:preprocessing,runRows,async run({rgb,width,height},options={}){requireValue(!disposed&&!closing&&rgb instanceof Uint8Array&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=8192)&&width*height<=32*1024**2&&rgb.length===3*width*height,'Qualified RGB8 geometry required');return runRows({width,height,readRows:async(y,count)=>({pixels:{width,height:count,format:'rgb8',data:rgb.subarray(y*width*3,(y+count)*width*3)},release(){}})},options);},dispose(){requireValue(!busy,'Preparation busy');if(disposal)return disposal;if(disposed)return;closing=true;const finish=()=>{if(ownsArena)arena.dispose();const bytes=module.HEAPU8.byteLength;module=null;backing?.();backing=null;budget.notifyBackingRelease?.('wasm',bytes);for(const free of resident)free();disposed=true;};if(!rowsOwner.hasLiveRows){finish();return;}disposal=rowsOwner.dispose().then(finish).catch(error=>{disposal=undefined;throw error;});return disposal;}};
}
