import {allocateWasmMemory,nativeModuleFailure,wasmAllocationFailure} from './allocation.js';
import {checkAbort,createCooperator,requireValue} from './errors.js';
import {createZeroRetirement} from './zero-native-context-plan.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
export async function tryNativeZeroRegions(votes,width,height,{budget,signal,onProgress,onOwner,gridToExclude=-1,gridMax=63,excludeVotes,excludeGrid,storage='auto',temporarySession,getTemporarySession}={}){
 checkAbort(signal);const n=width*height;requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&width<=65500&&height<=65500&&n<2**31&&votes?.byteLength===n,'Invalid ZERO region dimensions.');requireValue(Number.isInteger(gridToExclude)&&gridToExclude>=-1&&gridToExclude<64&&Number.isInteger(gridMax)&&gridMax>=0&&gridMax<64&&(!excludeVotes||excludeVotes.byteLength===n&&Number.isInteger(excludeGrid)&&excludeGrid>=0&&excludeGrid<64),'Invalid ZERO region grid selection.');
 const heapMaximumBytes=Math.ceil((16*MiB+17*n)/(16*MiB))*16*MiB;if(heapMaximumBytes>2**31)return null;
 let fee;try{fee=budget.reserve(heapMaximumBytes);}catch(e){if(e?.code==='MEMORY_LIMIT')return null;throw e;}
 const resultOwner=createZeroRetirement({signal}),nativeOwner=createZeroRetirement({signal:resultOwner.signal}),pointers=[];let finishNative,finishAll,m,memory,cpuLease,handle=0,backing,regionFee,nativeAllocationFailure=false;
 nativeOwner.waitUntil(new Promise(r=>finishNative=r));resultOwner.waitUntil(new Promise(r=>finishAll=r));resultOwner.add(()=>nativeOwner.dispose(),1);
 nativeOwner.add(async()=>{await cpuLease?.release();cpuLease=null;},0);
 nativeOwner.add(async()=>{let failed=false,primary;const attempt=f=>{try{f();}catch(e){if(!failed){failed=true;primary=e;}}};if(m){if(handle)attempt(()=>{m._zero_byte_regions_dispose(handle);handle=0;});for(let i=pointers.length-1;i>=0;i--)attempt(()=>{m._free(pointers[i]);pointers.splice(i,1);});}if(!handle&&!pointers.length){m=null;memory=null;}if(failed)throw primary;},0);
 nativeOwner.add(async()=>{const retired=await backing?.();backing=null;if(retired!==0)budget.notifyBackingRelease?.('wasm',retired??heapMaximumBytes);},1);nativeOwner.add(fee,2);resultOwner.add(async()=>{await regionFee?.();regionFee=null;},2);
 const allocate=bytes=>{const p=m._malloc(bytes);if(!p){nativeAllocationFailure=true;throw wasmAllocationFailure(m,'ZERO native region allocation failed.',bytes);}pointers.push(p);return p;};
 const cooperate=createCooperator(resultOwner.signal);let maximumStepMs=0,steps=0;
 try{
  try{
   onOwner?.(resultOwner);checkAbort(resultOwner.signal);cpuLease=await getExecutionScheduler(budget).acquire({cpu:1,signal:resultOwner.signal,resourceOwner:'zero',label:'zero-native-components'});try{memory=allocateWasmMemory({initial:256,maximum:heapMaximumBytes/65536});}catch(e){nativeAllocationFailure=e?.code==='MEMORY_ALLOCATION';throw e;}backing=budget.registerBacking?.('wasm',heapMaximumBytes,{owner:'zero',label:'zero-native-regions',identity:memory});
   const{default:create}=await import('../vendor/zero/zero.js');try{m=await create({wasmMemory:memory});}catch(e){const failure=nativeModuleFailure(e,'ZERO region module could not load.');nativeAllocationFailure=failure?.code==='MEMORY_ALLOCATION';throw failure;}checkAbort(resultOwner.signal);
   const input=allocate(n),excluded=excludeVotes?allocate(n):0,maskP=allocate(n),regP=allocate(n),capacity=Math.floor(n/64)+1,regionsP=allocate(capacity*32);
   for(let at=0;at<n;at+=MiB){await cooperate();const count=Math.min(MiB,n-at);await votes.readInto(m.HEAPU8.subarray(input+at,input+at+count),at);checkAbort(resultOwner.signal);if(excluded){await excludeVotes.readInto(m.HEAPU8.subarray(excluded+at,excluded+at+count),at);checkAbort(resultOwner.signal);}}
   handle=m._zero_byte_regions_begin(input,excluded,maskP,regP,regionsP,width,height,gridToExclude,gridMax,excludeGrid??-1);if(!handle){nativeAllocationFailure=true;throw wasmAllocationFailure(m,'ZERO native region graph allocation failed.',12*n+1024);}
   let status=0,nextReport=0;const started=performance.now();while(!status){await cooperate();checkAbort(resultOwner.signal);const at=performance.now();status=m._zero_byte_regions_step(handle,4096);maximumStepMs=Math.max(maximumStepMs,performance.now()-at);steps++;requireValue(status===0||status===1,'Invalid ZERO native region continuation.');if(performance.now()>=nextReport){onProgress?.({phase:m._zero_byte_regions_phase(handle)<3?'zero-regions':'zero-closing',visited:m._zero_byte_regions_visited(handle),components:m._zero_byte_regions_components(handle)});nextReport=performance.now()+16;}}
   checkAbort(resultOwner.signal);const nativeMs=performance.now()-started,count=m._zero_byte_regions_count(handle),components=m._zero_byte_regions_components(handle),visited=m._zero_byte_regions_visited(handle);requireValue(count>=0&&count<=capacity,'Invalid ZERO region count.');regionFee=budget.reserve(count*256);let view=new DataView(m.HEAPU8.buffer);const regions=[];
   for(let i=0;i<count;i++){const at=regionsP+i*32;regions.push({x0:view.getInt32(at,true),y0:view.getInt32(at+4,true),x1:view.getInt32(at+8,true),y1:view.getInt32(at+12,true),grid:view.getInt32(at+16,true),log10_nfa:view.getFloat64(at+24,true)});}
   view=null;const options={budget,storage,temporarySession,getTemporarySession,signal:resultOwner.signal},mask=await createSegmentedBytes(n,options);resultOwner.add(()=>mask.dispose(),0);const maskReg=await createSegmentedBytes(n,options);resultOwner.add(()=>maskReg.dispose(),0);
   for(let at=0;at<n;at+=MiB){await cooperate();const count=Math.min(MiB,n-at);await mask.write(m.HEAPU8.subarray(maskP+at,maskP+at+count),at);checkAbort(resultOwner.signal);await maskReg.write(m.HEAPU8.subarray(regP+at,regP+at+count),at);checkAbort(resultOwner.signal);}await mask.flush();await maskReg.flush();checkAbort(resultOwner.signal);
   const metrics={kernel:'native-bitset-components',components,visited,heapMaximumBytes,heapCapacityBytes:m.HEAPU8.buffer.byteLength,nativeMs,steps,maximumStepMs,maskStorage:mask.storage,regularizedStorage:maskReg.storage};
   finishNative();await nativeOwner.dispose();checkAbort(resultOwner.signal);return{width,height,mask,maskReg,regions,metrics,dispose:()=>resultOwner.dispose()};
  }finally{finishNative();finishAll();}
 }catch(primary){let acknowledged=false;try{await resultOwner.dispose();acknowledged=true;}catch{}if(nativeAllocationFailure&&acknowledged&&!signal?.aborted)return null;throw primary;}
}
