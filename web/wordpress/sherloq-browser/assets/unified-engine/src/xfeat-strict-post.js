import "../../runtime-context.js?v=0.25.0";
import createPost from '../vendor/xfeat-paged/post.js';
import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {requireValue,EngineError} from './errors.js';
const MiB=1024**2;
/** The original native postprocessor, with its actual live inputs and temporary
 * sorting vector admitted before native allocation. No native math is changed. */
export async function createXfeatStrictPost({budget,moduleFactory=createPost}={}){
 const frees=[],pointers=new Map();let reserved=0,live=0,closed=false,module;
 const ensure=need=>{requireValue(Number.isSafeInteger(need)&&need>=0,'Invalid XFeat post workspace.');const want=Math.ceil((need*1.5+32*MiB)/(16*MiB))*16*MiB;if(want>2048*MiB)throw new EngineError('MEMORY_LIMIT','Native XFeat postprocessing exceeds its unchanged wasm32 address space.',{details:{requestedBytes:want,allocationKind:'wasm'}});if(want>reserved){frees.push(budget.reserve(want-reserved));reserved=want;}};
 try{ensure(0);module=await moduleFactory({wasmMemory:allocateWasmMemory({initial:256,maximum:32768},{label:'native global XFeat NMS/ranking/sampling'})});}catch(error){for(const free of frees)free();throw error;}
 return{module,ensure,get liveBytes(){return live;},get reservedBytes(){return reserved;},alloc(bytes){requireValue(!closed&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid native XFeat allocation.');const size=Math.max(8,bytes);ensure(live+size);const p=module._malloc(size);if(!p)throw wasmAllocationFailure(module,'Native XFeat post allocation failed.',size);pointers.set(p,size);live+=size;return p;},free(pointer){if(!pointers.has(pointer))return;live-=pointers.get(pointer);pointers.delete(pointer);module._free(pointer);},dispose(){if(closed)return;closed=true;const errors=[];for(const pointer of pointers.keys())try{module._free(pointer);}catch(error){errors.push(error);}pointers.clear();for(const free of frees)try{free();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Native XFeat post owner retirement failed.');}};
}
