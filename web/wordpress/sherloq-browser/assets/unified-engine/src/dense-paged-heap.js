import "../../runtime-context.js?v=0.14.5";
import {denseAllocationError} from './dense-memory-error.js';
// Emscripten malloc grows the imported linear memory through memory.grow().
// Charge its actual capacity before growth: resizing caches can leave allocator
// holes, so live-vector sizes alone are not a safe shared-budget account.
export function createDensePagedHeap(budget,plannedBytes){
 let memory;try{memory=new WebAssembly.Memory({initial:128,maximum:16384});}catch(error){throw denseAllocationError(error,{operation:'wasm-memory-create',requestedBytes:8*1024**2,currentBytes:0});}
 const grow=memory.grow.bind(memory),releases=[];
 let reservedBytes=plannedBytes,lastError=null,disposed=false;
 memory.grow=pages=>{
  const requested=memory.buffer.byteLength+pages*65536;
  // Let the VM reject invalid/out-of-module requests without a speculative
  // budget reservation. Emscripten checks the same module ceiling first.
  if(!Number.isInteger(pages)||pages<0||requested>1024**3)return grow(pages);
  const extra=Math.max(0,requested+2*1024**2-reservedBytes);let release;
  try{if(extra)release=budget.reserve(extra);}catch(error){lastError=error;throw error;}
  try{const previous=grow(pages);if(release){releases.push(release);reservedBytes+=extra;}lastError=null;return previous;}
  catch(error){release?.();lastError=denseAllocationError(error,{operation:'wasm-memory-grow',requestedBytes:requested,currentBytes:memory.buffer.byteLength,pages});throw lastError;}
 };
 return {memory,get reservedBytes(){return reservedBytes;},get error(){return lastError;},clearError(){lastError=null;},dispose(){if(disposed)return;disposed=true;for(const release of releases)release();releases.length=0;}};
}
