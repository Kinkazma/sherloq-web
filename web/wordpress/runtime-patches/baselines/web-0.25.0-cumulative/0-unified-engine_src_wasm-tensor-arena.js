import {EngineError,requireValue,checkAbort,normalizeResourceError} from './errors.js';
const PAGE=65536,MIN_BANK=16*1024**2,ALIGN=8;
const ownedBuffers=new WeakSet();
export const isWasmTensorView=value=>ArrayBuffer.isView(value)&&ownedBuffers.has(value.buffer);
// Data-only Wasm memories use the Wasm page allocator, not an ordinary JS
// ArrayBuffer allocation. Each bank has a fixed maximum equal to its initial
// size: no later allocation can detach a published view. Banks are allocated
// only for useful output, coalesce returned ranges, and are reclaimable idle.
export function createWasmTensorArena({budget,memoryFactory=descriptor=>new WebAssembly.Memory(descriptor)}={}){
 requireValue(budget&&typeof budget.reserve==='function','Tensor arena budget required');
 const banks=new Set();let disposed=false,allocations=0,reuses=0,peakBytes=0;
 const reuse=budget.registerReusableBacking?.('wasm',bytes=>[...banks].some(bank=>bank.free.some(range=>range.bytes>=bytes)));
 const total=()=>[...banks].reduce((n,b)=>n+b.bytes,0);
 function retire(bank){if(bank.live||!banks.delete(bank))return 0;const bytes=bank.bytes;bank.memory=null;bank.free=[];bank.backing?.();bank.reservation();bank.reservation=null;budget.notifyBackingRelease?.('wasm',bytes);return bytes;}
 function reclaim(bytes=Infinity){if(bytes<=0)return 0;let freed=0;for(const bank of [...banks])if(!bank.live){freed+=retire(bank);if(freed>=bytes)break;}return freed;}
 const unregister=budget.registerReclaimer?.(bytes=>{if(budget.total()+bytes>budget.limit)reclaim(budget.total()+bytes-budget.limit);});
 const unregisterAsync=budget.registerAsyncReclaimer?.(({shortfallBytes})=>reclaim(shortfallBytes),{allocationKind:'wasm',priority:100});
 return{
  allocate(Type,length,{signal,label='tensor',zero=true}={}){
   requireValue(!disposed&&[Float32Array,Uint16Array,Uint8Array,Int32Array,Uint32Array,BigInt64Array].includes(Type)&&Number.isSafeInteger(length)&&length>0&&typeof zero==='boolean','Invalid owned tensor allocation');checkAbort(signal);
   const bytes=length*Type.BYTES_PER_ELEMENT,extent=Math.ceil(bytes/ALIGN)*ALIGN;requireValue(Number.isSafeInteger(bytes)&&extent<=2**31,'Tensor exceeds one Wasm bank');
   let bank,slot,index,best=Infinity;
   for(const candidate of banks)for(let i=0;i<candidate.free.length;i++){const range=candidate.free[i];if(range.bytes>=extent&&range.bytes<best){bank=candidate;slot=range;index=i;best=range.bytes;}}
   if(!bank){
    // At least one useful tensor, with only a small bank's amortization. A
    // large tensor obtains precisely its page-rounded extent, never a 4GiB heap.
    const size=Math.ceil(Math.max(MIN_BANK,extent)/PAGE)*PAGE;let reservation,memory;
    try{reservation=budget.reserve(size);}
    catch(error){throw error?.code==='MEMORY_LIMIT'?normalizeResourceError(error,{requestedBytes:size,allocation:label,reuseScope:reuse?.id,reuseBytes:extent}):error;}
    try{memory=memoryFactory({initial:size/PAGE,maximum:size/PAGE});requireValue(memory.buffer.byteLength===size,'Tensor bank capacity');checkAbort(signal);}
    catch(error){memory=null;reservation();throw normalizeResourceError(error,{requestedBytes:size,allocationKind:'wasm',allocation:label,reuseScope:reuse?.id,reuseBytes:extent});}
    ownedBuffers.add(memory.buffer);bank={memory,bytes:size,reservation,backing:budget.registerBacking?.('wasm',size,{owner:'d2prl',label:'tensor-arena',reclaimable:true}),free:[{offset:0,bytes:size}],live:0};banks.add(bank);slot=bank.free[0];index=0;peakBytes=Math.max(peakBytes,total());
   }else reuses++;
   const offset=slot.offset;slot.offset+=extent;slot.bytes-=extent;if(!slot.bytes)bank.free.splice(index,1);bank.live++;bank.backing?.setReclaimable(false);allocations++;
   const unpin=bank.backing?.pin();let data;
   try{data=new Type(bank.memory.buffer,offset,length);if(zero)data.fill(0);}
   catch(error){giveBack();throw normalizeResourceError(error,{requestedBytes:bytes,allocationKind:'wasm',allocation:label,reuseScope:reuse?.id,reuseBytes:extent});}
   let live=true;
   function giveBack(){if(!bank)return;unpin?.();bank.live--;if(!bank.live)bank.backing?.setReclaimable(true);bank.free.push({offset,bytes:extent});bank.free.sort((a,b)=>a.offset-b.offset);for(let i=1;i<bank.free.length;){const a=bank.free[i-1],b=bank.free[i];if(a.offset+a.bytes===b.offset){a.bytes+=b.bytes;bank.free.splice(i,1);}else i++;}data=null;if(disposed)retire(bank);else reuse?.changed();bank=null;}
   return{get data(){requireValue(live,'Released tensor');return data;},byteLength:bytes,release(){if(!live)return;live=false;giveBack();}};
  },
  reclaimIdle(bytes=Infinity){return reclaim(bytes);},
  snapshot(){return{banks:banks.size,residentBytes:total(),liveTensors:[...banks].reduce((n,b)=>n+b.live,0),allocations,reuses,peakBytes};},
  dispose(){if(disposed)return;disposed=true;unregister?.();unregisterAsync?.();reuse?.release();reclaim();}
 };
}
