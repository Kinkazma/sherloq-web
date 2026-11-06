import factory from './gpu-pack-kernel.mjs';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {cooperator} from './sherloq7c-math.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
const retiredPackingFailures=new WeakSet();
export const nativeGpuPackMayFallback=error=>!!error&&typeof error==='object'&&retiredPackingFailures.has(error)&&error.code==='MEMORY_ALLOCATION'&&error.details?.allocationKind==='wasm';
const MiB=1024*1024,page=65536,align=bytes=>Math.ceil(bytes/8)*8;
export function nativeGpuPackPlan(n,e,packedIndices){
 requireValue(Number.isSafeInteger(n)&&n>0&&n<2**31&&Number.isSafeInteger(e)&&e>0&&e<2**30&&(!packedIndices||n<=65536),'Invalid native GPU pack shape.');
 const words=packedIndices?5:6;
 const fields=[['low',4*e],['high',4*e],['difference',8*e],['multiplicity',8*e],['counts',8*n],['nativeLevels',2*n],['node',8*n],['ptr',4*(n+1)],['adj',8*e],['edges',4*words*e],['states',8*n],['w',8*e],['order',4*n],['histogram',65537*4],['cursor',4*(n+1)]];
 let arenaBytes=0;const offsets={};for(const [name,bytes] of fields){offsets[name]=arenaBytes;arenaBytes+=align(bytes);}
 const heapMaximumBytes=Math.ceil(Math.max(16*MiB,arenaBytes+2*MiB)/page)*page;
 if(heapMaximumBytes>2**31)throw new EngineError('MEMORY_LIMIT','Native GPU packing exceeds its heap limit.');
 return{n,e,packedIndices,edgeWords:words,arenaBytes,heapMaximumBytes,offsets};
}

// The caller reserves plan.heapMaximumBytes before entering. Output arrays are
// existing provider-owned buffers; this helper never transfers their ownership.
export async function nativeGpuPack(p,{node,ptr,adj,edges,states,w,order},{gain,dualScale,plan,signal}={}){
 const started=performance.now(),n=p.levels.length,E=p.low.length,cooperate=cooperator(signal);
 requireValue(plan?.n===n&&plan?.e===E,'Native GPU pack plan differs from graph.');
 requireValue(Number.isSafeInteger(plan.heapMaximumBytes)&&plan.heapMaximumBytes>=16*MiB&&plan.heapMaximumBytes<=2**31&&plan.heapMaximumBytes%page===0&&Number.isSafeInteger(plan.arenaBytes)&&plan.arenaBytes>0&&plan.arenaBytes<plan.heapMaximumBytes,'Invalid native GPU pack heap plan.');
 requireValue(Number.isFinite(gain)&&gain>0&&Number.isFinite(dualScale)&&dualScale>0&&Number.isFinite(p.median)&&p.median>0&&Number.isFinite(p.weakScale)&&p.weakScale>0,'Invalid native GPU pack controls.');
 for(const [name,Type,length] of [['low',Uint32Array,E],['high',Uint32Array,E],['difference',Float64Array,E],['multiplicity',Float64Array,E],['counts',Float64Array,n],['nativeLevels',Uint16Array,n]])requireValue(p[name] instanceof Type&&p[name].length===length,'Invalid native GPU pack input '+name);
 for(let i=0;i<n;i++){requireValue(p.levels[i]===p.nativeLevels[i]/65535,'Native16 levels disagree with prepared graph.');if((i&8191)===0)await cooperate();}
 const outputs={node,ptr,adj,edges,states,w,order};
 for(const [name,Type,length] of [['node',Float32Array,n*2],['ptr',Uint32Array,n+1],['adj',Uint32Array,E*2],['edges',Uint32Array,E*plan.edgeWords],['states',Float32Array,n*2],['w',Float64Array,E],['order',Uint32Array,n]])requireValue(outputs[name] instanceof Type&&outputs[name].length===length,'Invalid native GPU pack destination '+name);
 let memory,module,arena=0,handle=0,primary,failed=false;
 const failure=(message,cause)=>new EngineError('MEMORY_ALLOCATION',message,{cause,details:{allocationKind:'wasm',maximumBytes:plan.heapMaximumBytes}});
 try{
  try{memory=new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/page});}catch(cause){if(cause instanceof RangeError)throw failure('Native GPU pack heap allocation failed.',cause);throw cause;}
  module=await factory({wasmMemory:memory});
  await cooperate();arena=module._malloc(plan.arenaBytes);if(!arena)throw failure('Native GPU pack arena allocation failed.');
  const pointer=name=>arena+plan.offsets[name];
  for(const name of ['low','high','difference','multiplicity','counts','nativeLevels']){
   const v=p[name],bytes=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
   for(let at=0;at<bytes.length;at+=MiB){module.HEAPU8.set(bytes.subarray(at,Math.min(bytes.length,at+MiB)),pointer(name)+at);await cooperate();}
  }
  handle=module._gpu_pack_create(n,E,p.width*p.height,gain,p.median,p.weakScale,dualScale,plan.packedIndices?1:0,...['low','high','difference','multiplicity','counts','nativeLevels','node','ptr','adj','edges','states','w','order','histogram','cursor'].map(pointer));
  if(!handle)throw failure('Native GPU pack state allocation failed.');
  let status=0;while(status!==1){status=module._gpu_pack_step(handle,65536);if(status<0)throw new EngineError('INVALID_INPUT','Native GPU packing rejected malformed graph input.',{details:{status}});await cooperate();}
  const info=module.HEAPF64.slice(module._gpu_pack_info(handle)/8,module._gpu_pack_info(handle)/8+4);
  for(const [name,out] of Object.entries(outputs)){
   const bytes=new Uint8Array(out.buffer,out.byteOffset,out.byteLength),from=pointer(name);
   for(let at=0;at<bytes.length;at+=MiB){bytes.set(module.HEAPU8.subarray(from+at,from+Math.min(bytes.length,at+MiB)),at);await cooperate();}
  }
  await cooperate();return{strong:info[1],gain:info[2],uniqueLevels:info[3],heapBytes:module.HEAPU8.buffer.byteLength,heapMaximumBytes:plan.heapMaximumBytes,elapsedMs:performance.now()-started};
 }catch(error){primary=error;failed=true;throw error;}
 finally{
  let cleanup,cleanupFailed=false;
  try{if(handle)module._gpu_pack_destroy(handle);}catch(e){cleanup=e;cleanupFailed=true;}
  try{if(arena)module._free(arena);}catch(e){if(cleanupFailed)attachGpuCleanup(cleanup,e);else{cleanup=e;cleanupFailed=true;}}
  module=null;memory=null;
  if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
  else if(failed&&primary&&typeof primary==='object')retiredPackingFailures.add(primary);
 }
}

// Optional acceleration: policy refusal and recognized native allocation
// failure fall back only after both native state and its lease are retired.
export async function tryNativeGpuPack(p,outputs,{gain,dualScale,packedIndices,signal,reserveHeap}={}){
 let plan,release;
 try{plan=nativeGpuPackPlan(p.levels.length,p.low.length,packedIndices);release=reserveHeap(plan.heapMaximumBytes);}
 catch(error){checkAbort(signal);if(error?.code!=='MEMORY_LIMIT')throw error;return{accepted:false,fallback:{code:error.code,reason:'native-heap-admission'}};}
 let failure,result,retired=false,failed=false;
 try{result=await nativeGpuPack(p,outputs,{gain,dualScale,plan,signal});}catch(error){failure=error;failed=true;}
 finally{try{await release();retired=true;}catch(cleanup){if(failed)attachGpuCleanup(failure,cleanup);else{failure=cleanup;failed=true;}}}
 checkAbort(signal);
 if(failed){if(retired&&nativeGpuPackMayFallback(failure))return{accepted:false,fallback:{code:failure.code,reason:'native-heap-allocation',allocationKind:'wasm'}};throw failure;}
 return{accepted:true,stats:result};
}

