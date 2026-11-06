import {allocateWasmMemory,wasmAllocationFailure,nativeModuleFailure} from './allocation.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';
import {createZeroRetirement} from './zero-native-context-plan.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
export async function createZeroVoteRefiner(input,width,height,{budget,signal,onOwner,allocationContext}={}){
 checkAbort(signal);const n=width*height;requireValue(input instanceof Uint8Array&&input.length===n&&Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&n<=4*1024**2,'Invalid ZERO refinement source.');
 const ownedAllocation=fn=>{try{return fn();}catch(error){if(allocationContext&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))allocationContext.refusal=error;throw error;}};
 const heapMaximumBytes=Math.ceil((16*MiB+13*n)/(16*MiB))*16*MiB,fee=ownedAllocation(()=>budget.reserve(heapMaximumBytes)),owner=createZeroRetirement({signal}),pointers=[];
 let memory,m,backing,cpuLease,loaded=false,active=false,finishInitialization;owner.waitUntil(new Promise(r=>finishInitialization=r));owner.add(async()=>{await cpuLease?.release();cpuLease=null;},0);
 owner.add(async()=>{let failed=false,primary;if(m)for(let i=pointers.length-1;i>=0;i--)try{m._free(pointers[i]);pointers.splice(i,1);}catch(e){if(!failed){failed=true;primary=e;}}if(!pointers.length){m=null;memory=null;}if(failed)throw primary;},0);
 owner.add(async()=>{const retired=await backing?.();backing=null;if(retired!==0)budget.notifyBackingRelease?.('wasm',retired??heapMaximumBytes);},1);
 owner.add(fee,2);
 try{
  try{
   onOwner?.(owner);checkAbort(owner.signal);cpuLease=await getExecutionScheduler(budget).acquire({cpu:1,signal:owner.signal,resourceOwner:'zero',label:'zero-refiner-initialization'});memory=ownedAllocation(()=>allocateWasmMemory({initial:256,maximum:heapMaximumBytes/65536}));backing=budget.registerBacking?.('wasm',heapMaximumBytes,{owner:'zero',label:'zero-threshold-refiner',identity:memory});const{default:create}=await import('../vendor/zero/zero.js');try{m=await create({wasmMemory:memory});}catch(e){const error=nativeModuleFailure(e,'ZERO refinement module could not load.');if(allocationContext&&error?.code==='MEMORY_ALLOCATION')allocationContext.refusal=error;throw error;}checkAbort(owner.signal);requireValue(typeof m._zero_refine_byte_codes_range==='function','ZERO refinement ABI missing.');
   const alloc=bytes=>{const p=m._malloc(bytes);if(!p){const error=wasmAllocationFailure(m,'ZERO refinement allocation failed.',bytes);if(allocationContext)allocationContext.refusal=error;throw error;}pointers.push(p);return p;},source=alloc(n),codes=alloc(n*4),low=alloc(n*4),high=alloc(n*4);m.HEAPU8.set(input,source);
   return{
    signal:owner.signal,
    load(values){checkAbort(owner.signal);if(active)throw new EngineError('BUSY','ZERO native count borrow is active.');requireValue(values instanceof Uint32Array&&values.length===n*3,'Invalid ZERO mapped threshold planes.');m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,n*4),codes);m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset+n*4,n*4),low);m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset+n*8,n*4),high);loaded=true;},
    async run({signal}={}){
     const combined=signal?AbortSignal.any([signal,owner.signal]):owner.signal;checkAbort(combined);if(active)throw new EngineError('BUSY','ZERO native refiner is busy.');requireValue(loaded,'ZERO threshold state was not loaded or was already consumed.');loaded=false;active=true;let finish;owner.waitUntil(new Promise(r=>finish=r));let returned=false;
     try{
      const cooperate=createCooperator(combined);let refined=0;for(let start=0;start<n;start+=262144){await cooperate();checkAbort(combined);const count=m._zero_refine_byte_codes_range(source,codes,low,high,width,height,start,Math.min(262144,n-start));requireValue(count>=0,'ZERO GPU produced an invalid threshold-filter state.');refined+=count;}checkAbort(combined);
      let counts=new Uint32Array(m.HEAPU8.buffer,codes,n),alive=true;const result={refined,exactRefinements:m._zero_gpu_exact_refinement_count(),get counts(){if(!alive)throw new EngineError('DISPOSED','ZERO refined count borrow was released.');return counts;},release(){if(!alive)return;alive=false;counts=null;active=false;finish();}};returned=true;return result;
     }finally{if(!returned){active=false;finish();}}
    },
    get metrics(){return{heapMaximumBytes,fma64Qualified:m?.zeroFmaDifferences===0,fma64Enabled:m?m._zero_fma64_enabled?.()??false:false};},dispose:()=>owner.dispose()
   };
  }finally{try{await cpuLease?.release();cpuLease=null;}finally{finishInitialization();}}
 }catch(primary){try{await owner.dispose();}catch{}throw primary;}
}
