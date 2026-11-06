import factory from './target-kernel.mjs';
import {cooperator,initial7c,copy7c} from './sherloq7c-math.js';
import {importedWasmMemoryDescriptor} from './wasm-memory-limit.js';
// This is the verified import type of target-kernel.wasm, not an image limit.
export const TARGET_WASM_MAXIMUM_BYTES=2**32;
// Emscripten reserves the final wasm32 page so heap-size arithmetic never wraps.
const TARGET_WASM_GROWTH_MAXIMUM_BYTES=2**32-65536;
const TARGET_WASM_INITIAL_BYTES=16*1024**2,moduleMemoryLimits=new WeakMap();
let modulePromise;
export async function targetWasmModule(){return modulePromise??=factory().then(module=>{moduleMemoryLimits.set(module,TARGET_WASM_GROWTH_MAXIMUM_BYTES);return module;});}
export async function createTargetWasmModule({memoryBudgetBytes=128*1024*1024}={}){
 const descriptor=importedWasmMemoryDescriptor({initialBytes:TARGET_WASM_INITIAL_BYTES,memoryBudgetBytes,moduleMaximumBytes:TARGET_WASM_MAXIMUM_BYTES});
 let wasmMemory;try{wasmMemory=new WebAssembly.Memory(descriptor);}catch(cause){if(!(cause instanceof RangeError))throw cause;throw Object.assign(new Error('Target WASM memory could not be allocated.',{cause}),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',requestedBytes:TARGET_WASM_INITIAL_BYTES,maximumBytes:descriptor.maximum*65536}});}
 const module=await factory({wasmMemory});moduleMemoryLimits.set(module,Math.min(descriptor.maximum*65536,TARGET_WASM_GROWTH_MAXIMUM_BYTES));return module;
}
const fail=(message,details)=>Object.assign(new Error(message),{code:'NUMERIC_CONVERGENCE',details});
const memoryFailure=(bytes,m)=>{
 const currentBytes=m.HEAPU8.buffer.byteLength,maximumBytes=moduleMemoryLimits.get(m),atLimit=Number.isSafeInteger(maximumBytes)&&(currentBytes>=maximumBytes||bytes>maximumBytes);
 return Object.assign(new Error(atLimit?'The admitted WASM target heap is exhausted.':'WASM target allocation failed.'),{code:atLimit?'MEMORY_LIMIT':'MEMORY_ALLOCATION',details:{allocationKind:'wasm',requestedBytes:bytes,currentBytes,...(maximumBytes?{maximumBytes}:{}),boundary:atLimit?'admitted-heap-maximum':'malloc-null'}});
};
const pointer32=(value,m,bytes=0)=>{
 // wasm32 exports return signed i32 in JavaScript. Preserve their unsigned
 // address bits before indexing host views, including handles above 2 GiB.
 const at=value>>>0;
 if(!Number.isInteger(value)||value<-(2**31)||value>2**32-1||at>m.HEAPU8.byteLength-bytes)throw Object.assign(new Error('Target pointer exceeds its wasm32 heap.'),{code:'MEMORY_LIMIT',details:{allocationKind:'wasm',requestedBytes:bytes,currentBytes:m.HEAPU8.byteLength,maximumBytes:moduleMemoryLimits.get(m),boundary:'wasm32-address'}});
 return at;
};
const statusFailure=(status,m)=>status===-1?memoryFailure(0,m):Object.assign(new Error('WASM preconditioner failed.'),{code:'NUMERIC_CONVERGENCE',details:{currentBytes:m.HEAPU8.buffer.byteLength}});

// One immutable prepared graph owns one native workspace. Numerical arrays are
// reset for every solve; only the exact sparse symbolic pattern is reused.
export async function createTargetWasmSession(p,{wasmModule,signal}={}){
 const started=performance.now(),m=wasmModule??await targetWasmModule(),n=p.levels.length,E=p.low.length,pointers=[],cooperate=cooperator(signal);let handle=0,seed=0,closed=false;
 const allocate=bytes=>{
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>=2**32)throw Object.assign(new Error('Target allocation exceeds the wasm32 address space.'),{code:'MEMORY_LIMIT',details:{allocationKind:'wasm',requestedBytes:bytes,maximumBytes:moduleMemoryLimits.get(m),boundary:'wasm32-size'}});
  const raw=m._malloc(bytes);if(!raw)throw memoryFailure(bytes,m);const at=pointer32(raw,m,bytes);pointers.push(at);return at;
 };
 const copy=v=>{const at=allocate(v.byteLength);m.HEAPU8.set(new Uint8Array(v.buffer,v.byteOffset,v.byteLength),at);return at;};
 try{
  const inputs=[];for(const v of [p.low,p.high,p.area,p.difference,p.multiplicity]){inputs.push(copy(v));await cooperate();}
  const rawHandle=m._target_create(n,E,...inputs);if(!rawHandle)throw memoryFailure(0,m);handle=pointer32(rawHandle,m);seed=allocate(n*8);await cooperate();
 }catch(e){if(handle)m._target_destroy(handle);for(const at of pointers)m._free(at);throw e;}
 const session={module:m,graph:p,handle,seed,busy:false,solves:0,setupMs:performance.now()-started,
  writeSeed(values){if(closed||values.length!==n)throw fail('Invalid target session seed.');m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),seed);return seed;},
  dispose(){if(closed)return;if(session.busy)throw Object.assign(new Error('Await target cancellation before session disposal.'),{code:'BUSY'});closed=true;m._target_destroy(handle);for(const at of pointers)m._free(at);pointers.length=0;session.graph=null;session.handle=0;session.seed=0;},
  get closed(){return closed;}};
 return session;
}

export async function solveTarget7cWasm(p,micro,{signal,onProgress,tolerance=2e-4,maxIterations=240,initial,alternativeInitials=[],initialPolicy='provided',maxError=null,preconditioner='ic0',wasmModule,wasmSession,cgBatchIterations}={}){
 const started=performance.now(),n=p.levels.length,E=p.low.length,cooperate=cooperator(signal);
 if(!E)return {z:copy7c(p.levels),metrics:{converged:true,constant:true,rmsErrorBound:0,maxErrorBound:0,elapsedMs:performance.now()-started}};
 const ownSession=!wasmSession,session=wasmSession??await createTargetWasmSession(p,{wasmModule,signal});
 if(session.closed||session.busy||session.graph!==p)throw Object.assign(new Error('Invalid or active target session.'),{code:'BUSY'});
 const m=session.module,handle=session.handle,reused=session.solves>0,batch=cgBatchIterations??Math.max(1,Math.min(4,Math.floor(200000/(n+E))));
 if(!Number.isInteger(batch)||batch<1||batch>64){if(ownSession)session.dispose();throw fail('Invalid conjugate-gradient checkpoint batch.');}
 session.busy=true;
 try{
  m._target_preconditioner(handle,preconditioner==='ic0'?1:0);m._target_init(handle,micro,p.median,p.weakScale,session.writeSeed(initial??initial7c(p)));let iteration=0,converged=false,info,initialChoice=initial?'provided':'source-ranks';
  if(initial&&initialPolicy==='best-objective'&&m._target_try_initial(handle,session.writeSeed(initial7c(p))))initialChoice='source-ranks';
  for(let i=0;i<alternativeInitials.length;i++)if(m._target_try_initial(handle,session.writeSeed(alternativeInitials[i])))initialChoice='alternative-'+i;
  for(;iteration<=maxIterations;iteration++){
   const status=m._target_gradient(handle);if(status<0)throw statusFailure(status,m);
   const infoAt=pointer32(m._target_info(handle),m,8*8)/8;info=m.HEAPF64.slice(infoAt,infoAt+8);
   if(maxError===null?info[0]<=tolerance:info[1]<=maxError){converged=true;break;}if(iteration===maxIterations)break;
   const factorStatus=m._target_factor(handle);if(factorStatus<0)throw statusFailure(factorStatus,m);
   m._target_cg_begin(handle);while(m._target_cg_batch(handle,batch))await cooperate();
   if(m._target_accept(handle)<0)break;await cooperate();
   if(iteration%5===0)onProgress?.({phase:'sherloq-target',micro,iteration,rmsErrorBound:info[0],maxErrorBound:info[1],kernel:'wasm-f64'});
  }
  const metrics={converged,elapsedMs:performance.now()-started,iterations:iteration,cgIterations:info[4],cgBatchIterations:batch,rmsErrorBound:info[0],maxErrorBound:info[1],linearMaxErrorBound:info[6],nodeBarrierMaxErrorBound:info[7],maxErrorBoundType:'M-matrix-and-node-barrier',objective:info[2],gain:info[3],micro,backend:'cpu-wasm-f64',preconditioner,initialChoice,heapBytes:m.HEAPU8.buffer.byteLength,sessionReused:reused,sessionSetupMs:reused?0:session.setupMs};
  if(!converged)throw fail('Sherloq target did not meet its declared precision.',metrics);
  const at=pointer32(m._target_values(handle),m,n*8)/8;session.solves++;return {z:copy7c(m.HEAPF64,at,at+n),metrics};
 }finally{session.busy=false;if(ownSession)session.dispose();}
}
