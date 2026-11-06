import factory from './target-kernel.mjs';
import {cooperator,initial7c,copy7c} from './sherloq7c-math.js';
let modulePromise;
export async function targetWasmModule(){return modulePromise??=factory();}
export async function createTargetWasmModule({memoryBudgetBytes=128*1024*1024}={}){
 if(memoryBudgetBytes<16777216)throw Object.assign(new Error('The target WASM heap needs a 16 MiB minimum.'),{code:'MEMORY_LIMIT'});
 let wasmMemory;try{wasmMemory=new WebAssembly.Memory({initial:256,maximum:Math.floor(memoryBudgetBytes/65536)});}catch(cause){if(!(cause instanceof RangeError))throw cause;throw Object.assign(new Error('Target WASM memory could not be allocated.',{cause}),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',requestedBytes:16777216,maximumBytes:memoryBudgetBytes}});}
 return factory({wasmMemory});
}
const fail=(message,details)=>Object.assign(new Error(message),{code:'NUMERIC_CONVERGENCE',details});
const memoryFailure=bytes=>Object.assign(new Error('WASM target allocation failed.'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',requestedBytes:bytes}});
const statusFailure=(status,m)=>Object.assign(new Error(status===-1?'WASM preconditioner allocation failed.':'WASM preconditioner failed.'),{code:status===-1?'MEMORY_ALLOCATION':'NUMERIC_CONVERGENCE',details:{allocationKind:status===-1?'wasm':undefined,currentBytes:m.HEAPU8.buffer.byteLength}});

// One immutable prepared graph owns one native workspace. Numerical arrays are
// reset for every solve; only the exact sparse symbolic pattern is reused.
export async function createTargetWasmSession(p,{wasmModule,signal}={}){
 const started=performance.now(),m=wasmModule??await targetWasmModule(),n=p.levels.length,E=p.low.length,pointers=[],cooperate=cooperator(signal);let handle=0,seed=0,closed=false;
 const allocate=bytes=>{const at=m._malloc(bytes);if(!at)throw memoryFailure(bytes);pointers.push(at);return at;};
 const copy=v=>{const at=allocate(v.byteLength);m.HEAPU8.set(new Uint8Array(v.buffer,v.byteOffset,v.byteLength),at);return at;};
 try{
  const inputs=[];for(const v of [p.low,p.high,p.area,p.difference,p.multiplicity]){inputs.push(copy(v));await cooperate();}
  handle=m._target_create(n,E,...inputs);if(!handle)throw memoryFailure(0);seed=allocate(n*8);await cooperate();
 }catch(e){if(handle)m._target_destroy(handle);for(const at of pointers)m._free(at);throw e;}
 const session={module:m,graph:p,handle,seed,busy:false,solves:0,setupMs:performance.now()-started,
  writeSeed(values){if(closed||values.length!==n)throw fail('Invalid target session seed.');m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),seed);return seed;},
  dispose(){if(closed)return;if(session.busy)throw Object.assign(new Error('Await target cancellation before session disposal.'),{code:'BUSY'});closed=true;m._target_destroy(handle);for(const at of pointers)m._free(at);pointers.length=0;session.graph=null;session.handle=0;session.seed=0;},
  get closed(){return closed;}};
 return session;
}

export async function solveTarget7cWasm(p,micro,{signal,onProgress,tolerance=2e-4,maxIterations=240,initial,alternativeInitials=[],initialPolicy='provided',maxError=null,preconditioner='ic0',wasmModule,wasmSession,cgBatchIterations,cgRelative}={}){
 const started=performance.now(),n=p.levels.length,E=p.low.length,cooperate=cooperator(signal);
 if(!E)return {z:copy7c(p.levels),metrics:{converged:true,constant:true,rmsErrorBound:0,maxErrorBound:0,elapsedMs:performance.now()-started}};
 const ownSession=!wasmSession,session=wasmSession??await createTargetWasmSession(p,{wasmModule,signal});
 if(session.closed||session.busy||session.graph!==p)throw Object.assign(new Error('Invalid or active target session.'),{code:'BUSY'});
 const m=session.module,handle=session.handle,reused=session.solves>0,batch=cgBatchIterations??Math.max(1,Math.min(4,Math.floor(200000/(n+E))));
 if(!Number.isInteger(batch)||batch<1||batch>64){if(ownSession)session.dispose();throw fail('Invalid conjugate-gradient checkpoint batch.');}
 session.busy=true;
 try{
  // Inexact Newton steps need only a modest inner residual in the fast class.
  // The outer full-graph maximum-error certificate remains the stopping rule.
  // Preserve the historical forcing for reference and stricter classes.
  cgRelative??=maxError===.002?.1:0;
  if(!Number.isFinite(cgRelative)||cgRelative<0||cgRelative>=1)throw fail('Invalid inner CG forcing.');m._target_precision(handle,maxError??-1);m._target_forcing(handle,maxError===null?0:cgRelative);m._target_preconditioner(handle,preconditioner==='ic0'?1:0);m._target_init(handle,micro,p.median,p.weakScale,session.writeSeed(initial??initial7c(p)));let iteration=0,converged=false,info,initialChoice=initial?'provided':'source-ranks';
  if(initial&&initialPolicy==='best-objective'&&m._target_try_initial(handle,session.writeSeed(initial7c(p))))initialChoice='source-ranks';
  for(let i=0;i<alternativeInitials.length;i++)if(m._target_try_initial(handle,session.writeSeed(alternativeInitials[i])))initialChoice='alternative-'+i;
  for(;iteration<=maxIterations;iteration++){
   const status=m._target_gradient(handle);if(status<0)throw statusFailure(status,m);
   info=m.HEAPF64.slice(m._target_info(handle)/8,m._target_info(handle)/8+8);
   if(maxError===null?info[0]<=tolerance:info[1]<=maxError){converged=true;break;}if(iteration===maxIterations)break;
   const factorStatus=m._target_factor(handle);if(factorStatus<0)throw statusFailure(factorStatus,m);
   m._target_cg_begin(handle);while(m._target_cg_batch(handle,batch))await cooperate();
   if(m._target_accept(handle)<0)break;await cooperate();
   if(iteration%5===0)onProgress?.({phase:'sherloq-target',micro,iteration,rmsErrorBound:info[0],maxErrorBound:info[1],kernel:'wasm-f64'});
  }
  const metrics={converged,certifiedSteps:m._target_certified_steps(handle),elapsedMs:performance.now()-started,iterations:iteration,cgIterations:info[4],cgBatchIterations:batch,cgRelative:maxError===null?0:cgRelative,rmsErrorBound:info[0],maxErrorBound:info[1],linearMaxErrorBound:info[6],nodeBarrierMaxErrorBound:info[7],maxErrorBoundType:'M-matrix-and-node-barrier',objective:info[2],gain:info[3],micro,backend:'cpu-wasm-f64',preconditioner,initialChoice,heapBytes:m.HEAPU8.buffer.byteLength,sessionReused:reused,sessionSetupMs:reused?0:session.setupMs};
  if(!converged)throw fail('Sherloq target did not meet its declared precision.',metrics);
  const at=m._target_values(handle)/8;session.solves++;return {z:copy7c(m.HEAPF64,at,at+n),metrics};
 }finally{session.busy=false;if(ownSession)session.dispose();}
}
