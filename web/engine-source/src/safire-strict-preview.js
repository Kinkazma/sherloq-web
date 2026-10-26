import {allocateWasmMemory} from './allocation.js';
import {fetchM3Asset} from './m3-asset.js';
import {RESEARCH_POST_WASM} from './research-post-assets.js';
import {clusterSafireNative,projectSafireFragmentNative} from './safire-global-post.js';
import {checkAbort,requireValue} from './errors.js';
/** Cache only the small postprocessing runtime, never a model or source copy.
 * The parent owns all proposal loans and outputs for the entire draft. */
export function createStrictSafirePreviewPost(budget,{moduleFactory}={}){
 let module,capacity=0,closed=false,running=false;const drop=()=>{if(running)return;module=null;budget.retained-=capacity;capacity=0;},unregister=budget.registerReclaimer?.(drop,{allocationKind:'wasm',label:'idle-strict-safire-preview'});
 return{async run(job,{signal}={}){requireValue(!closed&&!running,'SAFIRE preview postprocessor is closed or active.');checkAbort(signal);running=true;try{let cold=false;const start=performance.now();if(!module||capacity<job.postHeapBytes){module=null;budget.retained-=capacity;capacity=0;const release=budget.reserve(job.postHeapBytes);try{const create=moduleFactory??(await import('../vendor/research-post/post.js')).default,wasmBinary=moduleFactory?undefined:await fetchM3Asset(new URL('../vendor/research-post/post.wasm',import.meta.url),RESEARCH_POST_WASM,signal),m=await create({wasmBinary,wasmMemory:allocateWasmMemory({initial:256,maximum:job.postHeapBytes/65536})});checkAbort(signal);requireValue(!closed&&m.HEAPU8.byteLength<=job.postHeapBytes,'SAFIRE preview heap exceeded admission.');release();budget.retain(job.postHeapBytes);module=m;capacity=job.postHeapBytes;cold=true;}finally{release();}}
  checkAbort(signal);const output=job.task==='cluster-global'?clusterSafireNative(module,job):projectSafireFragmentNative(module,job);checkAbort(signal);return{...output,metadata:{...output.metadata,previewCold:cold,previewPostMilliseconds:performance.now()-start}};
 }finally{running=false;if(closed)drop();}},async dispose(){closed=true;unregister?.();drop();},get state(){return{closed,running,capacity};}};
}
