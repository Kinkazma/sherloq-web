// Experimental direct native materialization. No root/next/pixel-level JS copy.
import factory from './graph-memory-native-compact-kernel.mjs';
import {createFundedMemory,verifiedGrowthBinary} from './graph-memory-native-compact-growth.mjs';
import {cooperator} from './sherloq7c-math.js';
const MiB=1024*1024,page=65536;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
export function nativeMaterializedPlan(width,height,memoryBudgetBytes=2**31){
 const pixels=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(pixels)||pixels>=2**31)throw fail('INVALID_INPUT','Invalid native materialization dimensions.');
 if(!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<16*MiB||memoryBudgetBytes>2**31||memoryBudgetBytes%page)throw fail('MEMORY_LIMIT','Native materialization needs an admitted 16 MiB–2 GiB heap.');
 const minimumHeapBytes=Math.ceil(Math.max(16*MiB,6*pixels+8*MiB)/page)*page;
 if(memoryBudgetBytes<minimumHeapBytes)throw fail('MEMORY_LIMIT','Root and native-level preparation do not fit the admitted heap.',{minimumHeapBytes,memoryBudgetBytes});
 return{pixels,wasmMaximumBytes:memoryBudgetBytes,minimumHeapBytes,transferBytes:Math.min(pixels,65536)*2};
}
export async function createNativeMaterializedGraph(source,{memoryBudgetBytes=2**31,memoryReservation='dynamic',rowCapacity=65536,reserve,registerBacking,signal,onProgress,blockWork=65536}={}){
 const {width,height}=source;let data=source.data;const plan=nativeMaterializedPlan(width,height,memoryBudgetBytes),N=plan.pixels,flat=data instanceof Uint16Array;
 if((!flat&&typeof source.maxAt!=='function')||(flat&&data.length!==3*N)||!Number.isInteger(blockWork)||blockWork<1||blockWork>1048576||!Number.isInteger(rowCapacity)||rowCapacity<8||rowCapacity>2**25||(rowCapacity&(rowCapacity-1))||!['dynamic','fixed'].includes(memoryReservation))throw fail('INVALID_INPUT','Invalid native materialization source or checkpoint/hash capacity.');
 const pause=cooperator(signal),leases=new Set(),outputs=[],backings=new Set();let funding,transferLease,heapBacking,transferBacking,m,memory,handle=0,primary,failed=false,p,componentOfPixel,stats;
 const backing=(kind,bytes,identity,label)=>{const release=registerBacking?.(kind,bytes,{identity,owner:'sherloq7c-compact-graph',label});if(release)backings.add(release);return release;};
 const retireBacking=release=>{release?.();backings.delete(release);};
 const noteHeap=()=>heapBacking?.resize?.(m?.HEAPU8.buffer.byteLength??memory.buffer.byteLength);
 const reserveOwned=bytes=>{const free=reserve?.(bytes)??(()=>{});let live=true;const release=()=>{if(!live)return;live=false;leases.delete(release);free();};leases.add(release);return release;};
 const oom=(message,cause)=>fail('MEMORY_ALLOCATION',message,{allocationKind:'wasm',maximumBytes:plan.wasmMaximumBytes,cause:String(cause??'')});
 try{
  await pause();const growthProof=await verifiedGrowthBinary(factory);await pause();
  funding=createFundedMemory({maximumBytes:plan.wasmMaximumBytes,mode:memoryReservation==='dynamic'&&growthProof.verified?'dynamic':'fixed',reserve,signal,onGrow:bytes=>heapBacking?.resize?.(bytes)});
  memory=funding.memory;transferLease=reserveOwned(plan.transferBytes);
  try{heapBacking=backing('wasm',memory.buffer.byteLength,memory,'compact graph heap');m=await factory({wasmMemory:memory,wasmBinary:growthProof.bytes});funding.checkFailure();}catch(cause){funding.checkFailure();if(cause instanceof RangeError)throw oom('Native materialized graph heap allocation failed.',cause);throw cause;}
  handle=m._nc_create(width,height,plan.wasmMaximumBytes,rowCapacity);funding.checkFailure();noteHeap();if(!handle)throw oom('Native materialized graph workspace allocation failed.');
  let transfer;try{transfer=new Uint16Array(plan.transferBytes/2);}catch(cause){throw fail('MEMORY_ALLOCATION','Native graph transfer allocation failed.',{allocationKind:'array-buffer',requestedBytes:plan.transferBytes,cause:String(cause)});}
  transferBacking=backing('array-buffer',transfer.byteLength,transfer.buffer,'compact graph input band');const input=m._nc_array(handle,0)/2;
  for(let at=0;at<N;at+=transfer.length){const count=Math.min(transfer.length,N-at);for(let i=0;i<count;i++){const j=at+i,value=flat?Math.max(data[3*j],data[3*j+1],data[3*j+2]):source.maxAt(j);if(!flat&&(!Number.isInteger(value)||value<0||value>65535))throw fail('INVALID_INPUT','maxAt must return Uint16 levels.');transfer[i]=value;}m.HEAPU16.set(transfer.subarray(0,count),input+at);await pause();}
  transfer=null;retireBacking(transferBacking);transferBacking=null;transferLease();transferLease=null;
  let status=0,prior=-1;
  while(status!==1){
   status=m._nc_step(handle,blockWork);funding.checkFailure();noteHeap();const info=m.HEAPF64.subarray(m._nc_info(handle)/8,m._nc_info(handle)/8+8);
   if(status<0){if(status===-4||status===-5)throw fail(status===-4?'GRAPH_TARGET_LIMIT':'GRAPH_MATERIALIZATION_LIMIT','The exact materialized graph exceeds its admitted native plan.',{components:info[1],edges:info[2],requiredBytes:info[7],heapMaximumBytes:plan.wasmMaximumBytes});throw oom('Native graph materialization allocation failed.');}
   if(info[0]!==prior){prior=info[0];onProgress?.({phase:'native-compact-materialize',nativePhase:prior,components:info[1],edges:info[2]});}await pause();
  }
  const info=m.HEAPF64.slice(m._nc_info(handle)/8,m._nc_info(handle)/8+12),C=info[1],E=info[2],labelCount=C===1||C===N?0:N;
  if(!Number.isSafeInteger(C)||C<1||C>N||!Number.isSafeInteger(E)||E<0)throw fail('NUMERIC_RANGE','Invalid native compact graph counts.');
  // All final outputs are financed together before the first JS allocation.
  const ownedBytes=4*labelCount+26*C+24*E,outputLease=reserveOwned(ownedBytes);
  p={width,height,sourceMin:info[3]/65535,sourceMax:info[4]/65535,median:info[5],weakScale:info[6],ownedBytes,labels:null};
  const fields=[['labels',Uint32Array,labelCount,1],['levels',Float64Array,C,2],['nativeLevels',Uint16Array,C,3],['counts',Float64Array,C,4],['area',Float64Array,C,5],['low',Uint32Array,E,6],['high',Uint32Array,E,7],['difference',Float64Array,E,8],['multiplicity',Float64Array,E,9]];
  for(const [name,Type,length,field]of fields){
   if(name==='labels'&&!length)continue;let out;
   try{out=new Type(length);}catch(cause){throw fail('MEMORY_ALLOCATION','Native compact output allocation failed: '+name,{allocationKind:'array-buffer',requestedBytes:length*Type.BYTES_PER_ELEMENT,cause:String(cause)});}
   backing('array-buffer',out.byteLength,out.buffer,'compact graph output '+name);const to=new Uint8Array(out.buffer),from=m._nc_array(handle,field);
   for(let at=0;at<to.length;at+=MiB){to.set(m.HEAPU8.subarray(from+at,from+Math.min(to.length,at+MiB)),at);await pause();}
   p[name]=out;outputs.push(out);
  }
  componentOfPixel=C===1?()=>0:C===N?i=>i:i=>p.labels[i];
  stats={preparationBackend:'native-exact-materialized',components:C,edges:E,labelsMode:C===1?'constant':C===N?'identity':'compact-labels',heapMaximumBytes:plan.wasmMaximumBytes,heapBytes:m.HEAPU8.buffer.byteLength,heapFunding:{...funding.stats(),requestedMode:memoryReservation,growthProofVerified:growthProof.verified,growthProofFallback:growthProof.reason},ownedBytes,requiredNativeBytes:info[7],rowRangeReplays:info[8],rowCapacity:info[9]};
 }catch(error){primary=error;failed=true;}
 finally{if(handle)m._nc_destroy(handle);handle=0;m=null;memory=null;data=null;source=null;retireBacking(transferBacking);transferBacking=null;retireBacking(heapBacking);heapBacking=null;transferLease?.();transferLease=null;funding?.dispose();funding=null;}
 if(failed){p=null;outputs.length=0;for(const release of [...backings])retireBacking(release);for(const release of [...leases])release();if(signal?.aborted)throw fail('CANCELLED','Native graph materialization cancelled.');throw primary;}
 let closed=false;const result={p,componentOfPixel,exactLegacyGraph:true,stats,dispose(){if(closed)return;closed=true;componentOfPixel=null;result.componentOfPixel=null;outputs.length=0;for(const name of ['labels','levels','nativeLevels','counts','area','low','high','difference','multiplicity'])p[name]=null;for(const release of [...backings])retireBacking(release);for(const release of [...leases])release();}};return result;
}
