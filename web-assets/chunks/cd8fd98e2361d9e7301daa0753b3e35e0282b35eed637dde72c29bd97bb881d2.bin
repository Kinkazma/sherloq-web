import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,EngineError} from './errors.js';
import {allocateWasmMemory,wasmAllocationFailure,registerArrayViews} from './allocation.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {scheduledWorkerCall} from './scheduled-worker-call.js';
import {createSelfDMProposalColourAddresses,estimateSelfDMProposalColourSeedsMemory} from './selfdm-proposal-colour-addresses.js';

export const SELFDM_PROPOSAL_COLOUR_KERNEL='selfdm-proposal-admitted-native-colour-SEEDS/1';
export const SELFDM_PROPOSAL_COLOUR_WASM=Object.freeze({bytes:981811,sha256:'47c1f0dbd2cbde50f7b6c4dae5b3cd884503d18d96d49dbe1870d7be22dccf23'});
const factory=async options=>(await import('../vendor/selfdm-proposal/seeds-support.mjs')).default(options);
const remove=(list,value)=>{const i=list.indexOf(value);if(i>=0)list.splice(i,1)};

/** Product admission/ownership around the already received additive native
 * color/SEEDS component. The source view is borrowed. RGB is read ONLY after
 * the actual imported memory and packed input have been admitted. All native
 * fields are copied under an exact JS admission before native retirement.
 * This CPU CV operator is the native existing backend, not a learned fallback.
 * onOwner registers the retryable carrier before its first allocation/await. */
export async function runSelfDMProposalColourSeeds({view,rect,resize},{budget,signal,onOwner,createModule=factory,wasmAsset,wasmBinary,profile,resourceOperation}={}){
 requireValue(budget?.reserve&&Array.isArray(resize)&&resize.length===2&&resize.every(n=>Number.isSafeInteger(n)&&n>0),'Native Proposal color dimensions and shared budget required');
 const controller=new AbortController();signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const credits=[],nativeCredits=[],pointers=[],leases=[],backings=[];let module,memory,nativeBacking,address,colour=0,seeds=0,closed=false,closing,nativeClosing,finish;
 const completed=new Promise(resolve=>finish=resolve);
 const owner={policy:SELFDM_PROPOSAL_COLOUR_KERNEL,raw:null,budget,profile,resourceOwner:'selfdm-proposal',resourceOperation,
  state:()=>({closed,retiring:!!closing,nativeOwners:Number(!!colour)+Number(!!seeds)+pointers.length,nativeReservations:nativeCredits.length,reservations:credits.length,sourceLeases:leases.length}),
  retireNative(){if(nativeClosing)return nativeClosing;nativeClosing=(async()=>{
   await completed;
   // SEEDS may still own native observations/addressing. Its ACK must precede
   // the color plan and all input pointers on which retirement can depend.
   if(seeds){await nativeCall('_proposal_seeds_support_release',seeds);seeds=0}
   if(colour){await nativeCall('_proposal_colour_release',colour);colour=0}
   while(pointers.length){await nativeCall('_free',pointers.at(-1));pointers.pop()}
   module=null;memory=null;
   if(nativeBacking){const retired=await nativeBacking();nativeBacking=null;if(retired)budget.notifyBackingRelease?.('wasm',retired)}
   while(nativeCredits.length){await nativeCredits.at(-1)();nativeCredits.pop()}
  })().finally(()=>{nativeClosing=null});return nativeClosing;},
  release(){if(closed)return Promise.resolve();controller.abort();if(closing)return closing;closing=(async()=>{
   await completed;await owner.retireNative();
   while(leases.length){await leases.at(-1).release();leases.pop()}
   while(backings.length){await backings.at(-1)();backings.pop()}
   if(address){await address.release();address=null}
   while(credits.length){await credits.at(-1)();credits.pop()}
   owner.raw=null;closed=true;
  })().finally(()=>{closing=null});return closing;}};
 const nativeCall=(name,...args)=>{try{return module[name](...args)}finally{if(memory)nativeBacking?.resize(memory.buffer.byteLength)}};
 const malloc=bytes=>{const p=nativeCall('_malloc',Math.max(1,bytes));if(!p)throw wasmAllocationFailure(module,'Proposal color/SEEDS native scratch allocation failed.',bytes);pointers.push(p);return p};
 const nativeError=(kind,status)=>{
  const at=module[kind==='colour'?'_proposal_colour_error':'_proposal_seeds_support_error']();let end=at;while(end<module.HEAPU8.length&&module.HEAPU8[end])end++;
  throw new EngineError('NATIVE_PROPOSAL_COLOUR','Native Proposal color/SEEDS refused its input.',{details:{kind,status,nativeError:new TextDecoder().decode(module.HEAPU8.subarray(at,end))}});
 };
 try{
  onOwner?.(owner);checkAbort(signal);address=createSelfDMProposalColourAddresses(view,rect,{budget});
  const [ow,oh]=resize,estimate=estimateSelfDMProposalColourSeedsMemory({width:rect.width,height:rect.height,outWidth:ow,outHeight:oh,sourceCount:address.count,rectanglesCount:address.rectanglesCount});owner.admission=estimate;
  if(estimate.empty){owner.raw={status:'empty',width:ow,height:oh,sourceCount:0,labels:null,labelCount:0,metadata:address.metadata};finish();return owner}
  // The imported memory is a real bounded memory, not merely an estimate or
  // a getHeapMax override. No RGB has been requested at this point.
  nativeCredits.push(budget.reserve(estimate.heapBytes));credits.push(budget.reserve(address.count*3+4096));
  const packed=new Uint8Array(address.count*3);
  backings.push(registerArrayViews(budget,{packed,indices:address.indices,rectangles:address.rectangles},{owner:'selfdm-proposal',label:'proposal-native-colour-address-inputs'}));
  memory=allocateWasmMemory({initial:256,maximum:estimate.heapBytes/65536},{label:'selfdm-proposal-colour-native-heap'});
  nativeBacking=budget.registerBacking?.('wasm',memory.buffer.byteLength,{owner:'selfdm-proposal',label:'proposal-native-colour-SEEDS',identity:memory,state:'materialized'});
  nativeCredits.push(budget.reserve(SELFDM_PROPOSAL_COLOUR_WASM.bytes*2));
  if(!wasmBinary){
   const asset={...SELFDM_PROPOSAL_COLOUR_WASM,url:new URL('../vendor/selfdm-proposal/seeds-support.wasm',import.meta.url).href,...wasmAsset};
   requireValue(asset.bytes===SELFDM_PROPOSAL_COLOUR_WASM.bytes&&asset.sha256===SELFDM_PROPOSAL_COLOUR_WASM.sha256,'Pinned additive native Proposal color/SEEDS asset required');
   wasmBinary=await fetchVerifiedAsset(asset,{signal});
  }else requireValue(wasmBinary instanceof Uint8Array&&wasmBinary.byteLength===SELFDM_PROPOSAL_COLOUR_WASM.bytes,'Explicit qualified additive native binary required');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',wasmBinary))].map(v=>v.toString(16).padStart(2,'0')).join('');requireValue(digest===SELFDM_PROPOSAL_COLOUR_WASM.sha256,'Additive native Proposal color/SEEDS bytes differ from the received component');
  checkAbort(signal);try{module=await createModule({wasmBinary,wasmMemory:memory,memoryMaximumBytes:estimate.heapBytes})}finally{nativeBacking?.resize(memory.buffer.byteLength)}checkAbort(signal);
  requireValue(module.HEAPU8?.buffer===memory.buffer,'Native color kernel did not import its admitted memory');
  let filled=0,readWidth=rect.width;
  for(let r=0;r<address.rectanglesCount;r++){
   const [x0,y0,x1,y1]=address.rectangles.subarray(r*4,r*4+4);
   for(let y=y0;y<y1;y++){
    checkAbort(signal);const at=y*rect.width+x0;let lo=0,hi=address.indices.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(address.indices[mid]<at)lo=mid+1;else hi=mid}
    requireValue(address.indices[lo]===at&&address.indices[lo+x1-x0-1]===y*rect.width+x1-1,'Canonical native RGB row addresses changed');
    for(let x=x0;x<x1;){
     checkAbort(signal);const width=Math.min(readWidth,x1-x);let lease;
     try{lease=await view.readWindow({x:rect.x+x,y:rect.y+y,width,height:1},{signal})}
     catch(primary){
      // The verified view refuses this transport size before any RGB. Split
      // only the read, preserving every source observation and native owner.
      if(primary?.code==='SOURCE_REGION_WINDOW_LIMIT'&&width>1){readWidth=Math.max(1,Math.floor(width/2));continue}
      throw primary;
     }
     leases.push(lease);
     try{const p=lease?.pixels;requireValue(p?.format==='rgb8'&&p.width===width&&p.height===1&&p.data instanceof Uint8Array&&p.data.length===width*3,'Native Proposal admitted RGB row geometry');packed.set(p.data,(lo+x-x0)*3);filled+=width}
     catch(primary){await retireCompositeOwners([async()=>{await lease.release();remove(leases,lease)}],{primary});throw primary}
     await lease.release();remove(leases,lease);x+=width;
    }
   }
  }
  requireValue(filled===address.count,'Native Proposal source observations differ from canonical union');checkAbort(signal);
  // One native CPU lane, through the same shared scheduler as existing CV
  // kernels. Heap admission and source preparation precede this CPU grant.
  await scheduledWorkerCall(owner,()=>{
  const source=malloc(packed.byteLength),ids=malloc(address.indices.byteLength),rectangles=malloc(address.rectangles.byteLength);
  module.HEAPU8.set(packed,source);module.HEAPU8.set(new Uint8Array(address.indices.buffer,address.indices.byteOffset,address.indices.byteLength),ids);module.HEAPU8.set(new Uint8Array(address.rectangles.buffer,address.rectangles.byteOffset,address.rectangles.byteLength),rectangles);
  colour=nativeCall('_proposal_colour_plan',ids,address.count,rectangles,address.rectanglesCount,rect.width,rect.height,ow,oh);if(!colour)nativeError('colour',0);
  const count=module._proposal_colour_count(colour);requireValue(Number.isInteger(count)&&count>=0&&count<=ow*oh,'Native Proposal admitted color support count');
  const rgb=malloc(count*3);if(nativeCall('_proposal_colour_render',colour,source,rgb)!==0)nativeError('colour',-1);checkAbort(signal);
  const destinations=module._proposal_colour_trace(colour,0),labels=malloc(ow*oh*4);
  seeds=nativeCall('_proposal_seeds_support_create',ow,oh,destinations,count);if(!seeds)nativeError('seeds',0);
  const labelCount=nativeCall('_proposal_seeds_support_run',seeds,rgb,labels);if(labelCount<0)nativeError('seeds',labelCount);checkAbort(signal);
  const levels=module._proposal_seeds_support_levels(seeds),stride=module._proposal_seeds_support_histogram_stride(seeds),fields=[];
  const add=(name,Type,pointer,length)=>{requireValue(Number.isSafeInteger(length)&&length>=0&&Number.isSafeInteger(pointer)&&pointer>=0&&pointer+length*Type.BYTES_PER_ELEMENT<=module.HEAPU8.byteLength,'Native color/SEEDS trace bounds differ');fields.push({name,Type,pointer,length})};
  add('packedRGB',Uint8Array,rgb,count*3);add('labels',Int32Array,labels,ow*oh);
  const types=[Uint32Array,Uint32Array,Uint32Array,Int16Array,Int32Array,Uint8Array,Uint32Array],names=['destinations','anchors','taps','coefficients','owners','clampFlags','packedTaps'];
  for(let f=0;f<7;f++)add(names[f],types[f],module._proposal_colour_trace(colour,f),count*([2,3,6].includes(f)?4:1));
  if(levels>=0&&count){
   requireValue(Number.isSafeInteger(stride)&&stride>0,'Native SEEDS histogram stride');
   for(let level=0;level<levels;level++){const n=module._proposal_seeds_support_labels(seeds,level);requireValue(Number.isSafeInteger(n)&&n>0,'Native SEEDS level geometry');add('histogram'+level,Float32Array,module._proposal_seeds_support_trace(seeds,0,level),n*stride);add('mass'+level,Float32Array,module._proposal_seeds_support_trace(seeds,1,level),n)}
   add('partitions',Uint32Array,module._proposal_seeds_support_trace(seeds,2,0),module._proposal_seeds_support_labels(seeds,levels-1));add('decisions',BigUint64Array,module._proposal_seeds_support_trace(seeds,3,0),8);
  }
  const outputBytes=fields.reduce((n,f)=>n+f.length*f.Type.BYTES_PER_ELEMENT,0);requireValue(Number.isSafeInteger(outputBytes),'Native Proposal copied trace admission exceeds exact integers');credits.push(budget.reserve(outputBytes+fields.length*256));
  const raw={status:count?'complete':'empty',width:ow,height:oh,sourceCount:address.count,colorCount:count,labelCount,levels,histogramStride:stride,colourMode:module._proposal_colour_mode(colour),sourceIndices:address.indices,canonicalRectangles:address.rectangles,metadata:{...address.metadata,policy:SELFDM_PROPOSAL_COLOUR_KERNEL,sourceRGBReads:filled,importedMemoryMaximumBytes:estimate.heapBytes,copiedNativeBytes:outputBytes,allNativeFieldsCopiedBeforeACK:true}};
  for(const f of fields)raw[f.name]=new f.Type(module.HEAPU8.buffer,f.pointer,f.length).slice();
  backings.push(registerArrayViews(budget,raw,{owner:'selfdm-proposal',label:'proposal-native-colour-SEEDS-complete-raw'}));
  owner.raw=raw;
  },{signal,label:'selfdm-proposal-colour-SEEDS',operation:resourceOperation});finish();return owner;
 }catch(primary){finish();await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
 finally{finish()}
}
