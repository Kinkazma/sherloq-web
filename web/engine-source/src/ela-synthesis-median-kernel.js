import {EngineError,checkAbort,requireValue,createCooperator} from './errors.js';
import {allocateWasmMemory} from './allocation.js';
import {ELA_SYNTHESIS_MEDIAN_KERNEL as pin} from './ela-synthesis-median-kernel-pin.js';
import {retireCompositeOwners} from './composite-owner-release.js';

const PAGE=65536,HEADER=PAGE,CONTROL=PAGE;

// A small pinned SIMD module, verified before compilation. This path accepts
// neither caller-supplied bytes nor a replacement resource identity.
export async function readElaSynthesisMedianKernel({signal,fetcher=globalThis.fetch}={}){
 checkAbort(signal);const response=await fetcher(new URL(pin.url),{signal,credentials:'same-origin',cache:'no-cache'});try{checkAbort(signal);}catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 const details={resource:'ela-synthesis-median/median.wasm',expectedBytes:pin.bytes,expectedSha256:pin.sha256};
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new EngineError('DEPENDENCY_HTTP','Synthesis median kernel download failed.',{details:{...details,status:response.status}});}
 const reader=response.body?.getReader();requireValue(reader,'Synthesis median kernel response body is missing.');let complete=false,used=0;
 try{
  const data=new Uint8Array(pin.bytes);
  for(;;){checkAbort(signal);const part=await reader.read();checkAbort(signal);if(part.done)break;
   if(!(part.value instanceof Uint8Array)||part.value.byteLength>pin.bytes-used)throw new EngineError('DEPENDENCY_SIZE','Synthesis median kernel exceeds its pinned extent.',{details});
   data.set(part.value,used);used+=part.value.byteLength;
  }
  if(used!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','Synthesis median kernel is truncated.',{details});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  if(digest!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','Synthesis median kernel SHA-256 differs.',{details:{...details,receivedSha256:digest}});
  complete=true;return data;
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}

// The complete memory (including Wasm stack/page rounding) and small module /
// fetch / compilation workspace are reserved before initialization. The input
// matrix is populated directly by the accumulator's bounded readInto calls.
export async function createElaSynthesisSimdWorkspace({count,frameBytes,maximumWorkingBytes,budget,signal,fetcher}={}){
 requireValue(Number.isInteger(count)&&count>=1&&count<=256&&Number.isSafeInteger(frameBytes)&&frameBytes>0&&Number.isSafeInteger(maximumWorkingBytes)&&maximumWorkingBytes>0&&budget?.reserve&&budget?.total,'A bounded synthesis median workspace is required.');checkAbort(signal);
 if(count===1)return{unavailable:'single-frame'};
 if(typeof WebAssembly!=='object'||typeof WebAssembly.Memory!=='function')return{unavailable:'wasm-unavailable'};
 // Browser assets use HTTP(S). Node callers can explicitly supply their asset
 // reader without introducing a filesystem import into the browser graph.
 if(!fetcher&&new URL(pin.url).protocol==='file:')return{unavailable:'asset-reader-unavailable'};
 const available=Math.min(maximumWorkingBytes,Math.max(0,budget.limit-budget.total())),pagesAvailable=Math.floor((available-CONTROL)/PAGE);
 const blockBytes=Math.min(frameBytes,196608,Math.floor((pagesAvailable*PAGE-HEADER)/(count+1)/3)*3);
 if(blockBytes<3)return{unavailable:'workspace-budget'};
 const memoryBytes=Math.ceil((HEADER+(count+1)*blockBytes)/PAGE)*PAGE,workingBytes=memoryBytes+CONTROL;
 if(memoryBytes<2*PAGE||workingBytes>available)return{unavailable:'workspace-budget'};
 const releaseMemory=budget.reserve(workingBytes);let memory,instance,backing,matrix,output,values,closing=false,closed=false,pending=null,disposal=null,unregister=null,backingRetired=false,reservationRetired=false,retiredBytes,notified=false,allocated=false;
 const release=async()=>{
  // A refused or pending backing ACK still owns the actual memory and every
  // view. Keep those references and the complete reservation for the retry.
  if(!backingRetired){retiredBytes=await backing?.();backingRetired=true;backing=null;}
  matrix=output=values=null;instance=null;memory=null;
  if(!reservationRetired){await releaseMemory();reservationRetired=true;}
  if(allocated&&!notified&&retiredBytes!==0){budget.notifyBackingRelease?.('wasm',retiredBytes??memoryBytes);notified=true;}
 };
 const dispose=()=>{
  if(disposal)return disposal;if(closed)return Promise.resolve();closing=true;
  const task=(async()=>{await pending?.catch(()=>{});await release();closed=true;unregister?.();unregister=null;})();disposal=task;
  void task.catch(()=>{if(disposal===task)disposal=null;
   // Construction can fail before a workspace reaches its caller. The budget
   // keeps only this failed retirement owner, never an unaccounted orphan.
   if(!unregister)unregister=budget.registerAsyncReclaimer?.(()=>dispose(),{owner:'ela-synthesis',label:'median-simd-retirement',allocationKind:'wasm'});
  });return task;
 };
 try{
  const binary=await readElaSynthesisMedianKernel({signal,fetcher});checkAbort(signal);
  if(!WebAssembly.validate(binary)){await dispose();return{unavailable:'simd-unavailable'};}
  memory=allocateWasmMemory({initial:memoryBytes/PAGE,maximum:memoryBytes/PAGE},{label:'synthesis-median-simd'});
  allocated=true;
  backing=budget.registerBacking?.('wasm',memoryBytes,{owner:'ela-synthesis',label:'median-simd-workspace',identity:memory.buffer});
  const module=await WebAssembly.compile(binary);checkAbort(signal);instance=await WebAssembly.instantiate(module,{env:{memory}});checkAbort(signal);
  requireValue(typeof instance.exports.median_block==='function','The pinned median kernel export is missing.');
  matrix=new Uint8Array(memory.buffer,HEADER,count*blockBytes);output=new Uint8Array(memory.buffer,HEADER+count*blockBytes,blockBytes);values=new Uint8Array(memory.buffer,32768,count);
 }catch(error){await retireCompositeOwners([dispose],{primary:error});throw error;}
 // Fast RAM blocks often each take less than 8 ms. The deadline must survive
 // between blocks, otherwise a stream of resolved reads can starve controls.
 const cooperate=createCooperator();
 const workspace={blockBytes,workingBytes,backend:'wasm-simd16',get matrix(){return matrix;},get output(){return output;},get values(){return values;},
  reduce(block,target,channelValues,{signal}={}){
   requireValue(!closing&&!closed,'Synthesis median workspace is closed.');if(pending)throw new EngineError('BUSY','Another median block is active.');
   requireValue(block instanceof Uint8Array&&target instanceof Uint8Array&&channelValues===values&&block.buffer===memory.buffer&&block.byteOffset===HEADER&&target.buffer===memory.buffer&&target.byteOffset===output.byteOffset&&target.length>0&&target.length<=blockBytes&&block.length===target.length*count,'The complete owned frame-major median block is required.');
   const task=(async()=>{checkAbort(signal);const quantum=Math.max(16,Math.floor(524288/count/16)*16);
    for(let start=0;start<target.length;start+=quantum){checkAbort(signal);await cooperate();checkAbort(signal);instance.exports.median_block(block.byteOffset,target.byteOffset,count,target.length,start,Math.min(target.length,start+quantum));}
    checkAbort(signal);return target;
   })();pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
  },
  dispose
 };
 return workspace;
}
