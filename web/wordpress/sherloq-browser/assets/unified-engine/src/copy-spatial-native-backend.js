import "../../runtime-context.js?v=0.30.0";
import {wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

const MAXIMUM_HEAP_BYTES=64*1024**2;
const EXPECTED_HELPER_SOURCE_SHA256='7997019cd3238f162bffaf79a034c020ba62ad80b8a5bd0eefd4d194e5df78f6';
async function nativeTreeModule(){const {default:create}=await import('../native/sparse-float-distance/copy-tree-sdk4.js');return create();}
async function auditedSidecar(memory,variant,signal){
  requireValue(['scalar-control','simd-ordered'].includes(variant),'Invalid private distance variant.');
  const stem=new URL('../native/sparse-float-distance/'+variant,import.meta.url),auditResponse=await fetch(stem.href+'.audit.json',{signal});
  if(!auditResponse.ok)throw Error('Private distance audit unavailable.');
  const audit=await auditResponse.json();checkAbort(signal);
  requireValue(audit.status==='passed-imported-memory-no-writes'&&audit.sourceSha256===EXPECTED_HELPER_SOURCE_SHA256&&audit.importMemoryOnly===true&&audit.noStart===true&&audit.noDataSegments===true&&audit.noLinearStores===true&&audit.noLinearStack===true,'Private distance audit rejected.');
  const response=await fetch(stem.href+'.wasm',{signal});if(!response.ok)throw Error('Private distance helper unavailable.');
  const bytes=await response.arrayBuffer();checkAbort(signal);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  requireValue(bytes.byteLength===audit.bytes&&digest===audit.sha256,'Private distance helper identity changed.');
  const compiled=await WebAssembly.compile(bytes);checkAbort(signal);
  const imports=WebAssembly.Module.imports(compiled),exports=WebAssembly.Module.exports(compiled);
  requireValue(imports.length===1&&imports[0].module==='env'&&imports[0].name==='memory'&&imports[0].kind==='memory'&&exports.length===1&&exports[0].name==='sparse_float_distance'&&exports[0].kind==='function','Private distance ABI changed.');
  const instance=await WebAssembly.instantiate(compiled,{env:{memory}});checkAbort(signal);
  return instance.exports.sparse_float_distance;
}

// Dependencies are injected only by the protocol units. Actual source uses the
// original SDK4 binary plus a private wrapper exposing its existing memory.
export function distanceBackend({createTreeModule=nativeTreeModule,loadSidecar=auditedSidecar,onModuleRetired}={}){
  return async function openDistance(coords,descriptors,dimensions,{signal,reserveMemory,variant='simd-ordered'}={}){
    requireValue(coords instanceof Float64Array&&coords.length%2===0&&coords.length<=2000000&&coords.every(Number.isFinite)&&typeof reserveMemory==='function','Invalid copy spatial index.');
    requireValue(descriptors instanceof Float32Array&&Number.isSafeInteger(dimensions)&&dimensions>0&&dimensions<=1024&&descriptors.length===coords.length/2*dimensions,'Invalid private descriptor bank.');
    reserveMemory(MAXIMUM_HEAP_BYTES+coords.length*2);checkAbort(signal);
    let module=await createTreeModule(),cp=0,op=0,bank=0,helper=null,closed=false;
    const metrics={mode:'js',variant,maximumHeapBytes:MAXIMUM_HEAP_BYTES,bankBytes:0,liveBankBytes:0,actualHeapBytes:0,copyBytes:0,helperCalls:0,completedHelperCalls:0,fallbackReason:null,cleanupError:null};
    const dropBank=()=>{
      helper=null;
      if(bank){const pointer=bank;bank=0;try{module._free(pointer);metrics.liveBankBytes=0;}catch(error){metrics.cleanupError=error.message;}}
    };
    // The historical tree module becomes unreachable after ranks. In a JS
    // fallback there is no native bank/helper using it, so preserve that life.
    // The optional retirement observer exists only for deterministic units and
    // receives no module/memory/view reference. Production does not supply it.
    const retireModule=reason=>{if(!module)return;module=null;onModuleRetired?.({reason,moduleCleared:module===null});};
    const dispose=()=>{if(closed)return;closed=true;dropBank();retireModule('dispose');metrics.liveBankBytes=0;};
    let ranks;
    try{
      // The original ranks and allocation order remain exact. No descriptor
      // bank is borrowed until both tree pointers have been freed.
      metrics.actualHeapBytes=module.HEAPU8.byteLength;
      try{
        checkAbort(signal);const count=coords.length/2;
        cp=module._malloc(Math.max(8,coords.byteLength));op=module._malloc(Math.max(8,count*4));
        if(!cp||!op)throw wasmAllocationFailure(module,'Copy spatial index allocation failed.',undefined);
        module.HEAPU8.set(new Uint8Array(coords.buffer,coords.byteOffset,coords.byteLength),cp);
        if(!module._copy_tree_order(cp,op,count))throw new EngineError('INVALID_INPUT','Copy spatial index failed.');
        ranks=new Uint32Array(count);for(let i=0;i<count;i++)ranks[module.HEAPU32[op/4+i]]=i;checkAbort(signal);
      }finally{if(cp){const pointer=cp;cp=0;module._free(pointer);}if(op){const pointer=op;op=0;module._free(pointer);}}
      metrics.actualHeapBytes=module.HEAPU8.byteLength;
      try{
        checkAbort(signal);
        if(!descriptors.byteLength||descriptors.byteLength>=MAXIMUM_HEAP_BYTES){metrics.fallbackReason='bank-outside-existing-cap';}
        else if(!(module.wasmMemory instanceof WebAssembly.Memory)){metrics.fallbackReason='existing-memory-unavailable';}
        else{
          helper=await loadSidecar(module.wasmMemory,variant,signal);checkAbort(signal);
          requireValue(typeof helper==='function','Private distance export missing.');
          bank=module._malloc(descriptors.byteLength);metrics.actualHeapBytes=module.HEAPU8.byteLength;checkAbort(signal);
          if(!bank){helper=null;metrics.fallbackReason='bank-allocation-refused';}
          else{
            // malloc may grow and detach the old ordinary buffer; acquire this
            // view afterwards. No Wasm view crosses an await or survives here.
            const heap=module.HEAPU8;
            requireValue(heap instanceof Uint8Array&&heap.buffer===module.wasmMemory.buffer&&heap.byteLength<=MAXIMUM_HEAP_BYTES&&bank%4===0&&bank<=heap.byteLength-descriptors.byteLength,'Private distance bank outside existing heap.');
            heap.set(new Uint8Array(descriptors.buffer,descriptors.byteOffset,descriptors.byteLength),bank);
            metrics.actualHeapBytes=heap.byteLength;metrics.bankBytes=descriptors.byteLength;metrics.liveBankBytes=descriptors.byteLength;metrics.copyBytes=descriptors.byteLength;metrics.mode='native';
          }
        }
      }catch(error){checkAbort(signal);metrics.fallbackReason=error.message;dropBank();}
      if(!helper){dropBank();retireModule('js-fallback');}
      const distance=(i,j)=>{
        if(closed||!helper)return null;
        try{metrics.helperCalls++;const score=helper(bank,dimensions,i,j);if(typeof score!=='number'||Number.isNaN(score)||score<0||Math.fround(score)!==score)throw Error('Private distance returned an invalid score.');metrics.completedHelperCalls++;return score;}
        catch(error){checkAbort(signal);metrics.fallbackReason=error.message;metrics.mode='js';dropBank();retireModule('native-fallback');return null;}
      };
      return {ranks,distance,metrics,dispose};
    }catch(error){dispose();throw error;}
  };
}
export const openDistance=distanceBackend();
