import "../../runtime-context.js?v=0.33.3";
import {createLcmsLinearRgbModel} from './lcms-display-pipeline.js';
import {Budget} from './cache.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
import {allocateWasmMemory} from './allocation.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {LCMS_DISPLAY_CPU_RESOURCES,lcmsDisplayCpuHasSimd,readVerifiedLcmsDisplayCpuResource} from './lcms-display-cpu-resource.js';

const MiB=1024**2,HEAP_MAXIMUM=32*MiB,MODEL_MAXIMUM=2*MiB,RESOURCE_HEADROOM=256*1024;
async function defaultFactory(variant){return (await (variant==='simd'?import('../vendor/lcms-display-cpu/lcms-linear-simd.mjs'):import('../vendor/lcms-display-cpu/lcms-linear-scalar.mjs'))).default;}
/** A bounded execution owner for the actual LCMS float stages. It is loaded
 * only by the profitable Auto fallback, never by the ordinary RGB8 route. */
export async function createLcmsDisplayCpu({pipeline,maximumPixels,maximumMemoryBytes,signal}={},hooks={}){
 requireValue(Number.isSafeInteger(maximumPixels)&&maximumPixels>0&&Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>0,'An admitted CPU color band and workspace are required.');
 requireValue(pipeline?.library===2190&&pipeline.inputChannels===3&&pipeline.outputChannels===3&&pipeline.inputFormat===262170&&pipeline.outputFormat===262169&&pipeline.evaluationMode==='float-stages','An exported native RGB16 float display pipeline is required.');checkAbort(signal);
 const variant=(hooks.hasSimd??lcmsDisplayCpuHasSimd)()?'simd':'scalar',pin=LCMS_DISPLAY_CPU_RESOURCES[variant],pipelineBytes=pipeline.byteLength??pipeline.stages.reduce((n,s)=>n+(s.floatData?.byteLength??0),0),workingMaximum=pipelineBytes+MODEL_MAXIMUM+maximumPixels*3+HEAP_MAXIMUM+RESOURCE_HEADROOM;
 if(workingMaximum>maximumMemoryBytes)throw new EngineError('MEMORY_LIMIT','The complete CPU color workspace was not admitted.',{details:{requestedBytes:workingMaximum,availableBytes:maximumMemoryBytes}});
 const budget=hooks.budget??new Budget(maximumMemoryBytes),free=budget.reserve(workingMaximum),backings=[];
 let value,module,memory,modelPointer=0,inputPointer=0,outputPointer=0,heapBacking,releaseCursor=0,closing=false,closed=false,disposal,pending=Promise.resolve(),bands=0,pixels=0,totalMs=0;
 const began=performance.now();
 function retain(kind,bytes,options){const release=budget.registerBacking(kind,bytes,options);backings.push({kind,bytes,release});return release;}
 async function releaseNative(){
  await retireCompositeOwners([async()=>{if(module&&modelPointer){module._free(modelPointer);modelPointer=0;}},async()=>{if(module&&inputPointer){module._free(inputPointer);inputPointer=0;}},async()=>{if(module&&outputPointer){module._free(outputPointer);outputPointer=0;}}]);
  module=null;memory=null;value=null;pipeline=null;
 }
 async function dispose(){if(closed)return;if(disposal)return disposal;closing=true;const task=(async()=>{await pending;await releaseNative();while(releaseCursor<backings.length){const part=backings[releaseCursor],bytes=await part.release();releaseCursor++;if(bytes!==0)budget.notifyBackingRelease?.(part.kind,bytes??part.bytes);}await free();closed=true;})();disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;}
 try{
  const identities=new Set();for(const stage of pipeline.stages){const a=stage.floatData;if(a&&!identities.has(a.buffer)){identities.add(a.buffer);retain('array-buffer',a.buffer.byteLength,{owner:'cpu-color-display',label:'exported-LCMS-stages',identity:a.buffer});}}
  try{value=createLcmsLinearRgbModel(pipeline,{maximumBytes:MODEL_MAXIMUM});}catch(error){if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Unable to allocate the admitted CPU color model.',{cause:error,details:{allocationKind:'array-buffer'}});throw error;}
  retain('array-buffer',value.byteLength,{owner:'cpu-color-display',label:'LCMS-linear-model',identity:value.model.buffer});
  memory=allocateWasmMemory({initial:32,maximum:HEAP_MAXIMUM/65536},{label:'CPU-color-display'});
  // Adopt the memory before resource loading or module instantiation can fail.
  heapBacking=retain('wasm',HEAP_MAXIMUM,{owner:'cpu-color-display',label:'bounded-LCMS-stages',state:'reserved'});heapBacking.materialize(memory.buffer.byteLength);
  const create=hooks.moduleFactory??await defaultFactory(variant),wasmBinary=await(hooks.readResource??readVerifiedLcmsDisplayCpuResource)({variant,signal});checkAbort(signal);
  module=await create({wasmMemory:memory,wasmBinary});checkAbort(signal);
  modelPointer=module._malloc(value.byteLength);inputPointer=module._malloc(maximumPixels*6);outputPointer=module._malloc(maximumPixels*3);
  if(!modelPointer||!inputPointer||!outputPointer)throw new EngineError('MEMORY_ALLOCATION','The admitted CPU color band could not be allocated.',{details:{allocationKind:'wasm'}});
  new Uint8Array(memory.buffer).set(new Uint8Array(value.model.buffer,value.model.byteOffset,value.byteLength),modelPointer);heapBacking.materialize(memory.buffer.byteLength);
  const modelSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value.model)),n=>n.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  const numerics=Object.freeze({...value.numerics,modelSha256,referenceLibrary:2190,referenceResourceSha256:COLOR_NATIVE_RESOURCE.sha256,schema:'sherloq.color-projection/2',implementation:'lcms-exported-linear-f32-cpu/1',input:'native-rgb16',output:'srgb8',quantization:'f32-product-plus-f64-half-then-lcms-u8',inputProfileSha256:pipeline.inputProfileSha256,intent:pipeline.intent,blackPointCompensation:pipeline.blackPointCompensation,kernelResourceSha256:pin.sha256}),preparationMs=performance.now()-began;
  return{numerics,requiredBytes:workingMaximum,
   convert(samples,{signal:currentSignal=signal}={}){const run=()=>{checkAbort(currentSignal);if(closing||closed)throw new EngineError('CLOSED','The CPU color display owner is closed.');requireValue(samples instanceof Uint16Array&&samples.length>0&&samples.length%3===0&&samples.length/3<=maximumPixels,'Native RGB16 samples exceed the admitted CPU color band.');const at=performance.now();new Uint8Array(memory.buffer).set(new Uint8Array(samples.buffer,samples.byteOffset,samples.byteLength),inputPointer);module[variant==='simd'?'_lcms_linear_rgb8_simd':'_lcms_linear_rgb8_scalar'](modelPointer,inputPointer,outputPointer,samples.length/3);checkAbort(currentSignal);heapBacking.materialize(memory.buffer.byteLength);const output=new Uint8Array(memory.buffer).slice(outputPointer,outputPointer+samples.length);bands++;pixels+=samples.length/3;totalMs+=performance.now()-at;checkAbort(currentSignal);return output;};const task=pending.then(run);pending=task.catch(()=>{});return task;},
   metrics(){return{backend:'cpu',kernel:variant==='simd'?'wasm-simd128-lcms-stages':'wasm-scalar-lcms-stages',variant,pixels,bands,conversionMs:totalMs,preparationMs,numerics,workspaceMaximumBytes:workingMaximum,heapActualBytes:memory?.buffer.byteLength??0,heapMaximumBytes:HEAP_MAXIMUM,ledger:budget.snapshot()};},
   dispose,afterDispose(){return{memory:budget.snapshot(),resources:budget.resourceSnapshot()};}
  };
 }catch(error){if(memory&&heapBacking)heapBacking.materialize(memory.buffer.byteLength);try{await dispose();}catch(cleanup){throw withRetirementOwner(error,{dispose},cleanup);}throw error;}
}
