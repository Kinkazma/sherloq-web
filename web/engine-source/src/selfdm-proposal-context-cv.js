import {requireValue,checkAbort,EngineError} from './errors.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {registerArrayViews} from './allocation.js';
import {validateRgbRows} from './rgb-row-source.js';
import {SELFDM_PROPOSAL_CV} from './selfdm-proposal-assets.js';

const MiB=1024**2,roundMiB=n=>Math.ceil(n/MiB)*MiB;
export const SELFDM_PROPOSAL_CONTEXT_CV='selfdm-proposal-literal-context-native-CV/1';

/** Existing native CV worker/CPU admission, with literal source ownership and
 * no second copy of transferred outputs. No native operator is replaced.
 * Pools survive compatible stages; the record parent owns this client until
 * its outputs/exports and the final worker/source retirement have acknowledged. */
export function createSelfDMProposalContextCv({budget,profile,lifetimeSignal,resourceOperation,cv,workerFactory,poolFactory=(...a)=>new WaveletStripPool(...a)}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0,'Shared Proposal CV budget and native profile required');
 requireValue(!cv||cv.bytes===SELFDM_PROPOSAL_CV.bytes&&cv.sha256===SELFDM_PROPOSAL_CV.sha256,'Unchanged native Proposal CV identity required');
 const lifetime=new AbortController(),pools=new Map(),busyPools=new Set(),loans=new Set(),active=new Set();let closing,closed=false,requested=false;
 const cvURL=cv?.url??new URL('../vendor/selfdm-proposal/seeds.wasm',import.meta.url).href;
 const client={policy:SELFDM_PROPOSAL_CONTEXT_CV,
  metrics:()=>({closed,retiring:requested,active:active.size,outputs:loans.size,pools:Object.fromEntries([...pools].map(([key,pool])=>[key,pool.metrics()]))}),
  dispose(){requested=true;lifetime.abort();if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{
   await Promise.allSettled([...active]);
   for(const loan of [...loans])await loan.release();
   for(const[key,pool]of pools){await pool.clear();pools.delete(key)}
   closed=true;
  })().finally(()=>{closing=null});return closing;},
  pyramid(context,scale,window,{signal,onOwner}={}){
   requireValue(context?.nativeContext?.readRows&&Array.isArray(context.bounds)&&scale?.index>=0&&window?.sourcePatch,'Prepared literal Proposal pyramid owner required');
   const width=context.bounds[2]-context.bounds[0],height=context.bounds[3]-context.bounds[1],patch=window.sourcePatch;
   return call({key:'pyramid/'+scale.index,heap:window.nativeHeapBytes,io:window.nativeSourceBytes+window.nativeInputBytes,outputBytes:window.nativeInputBytes,
    async prepare(loan,joined){
     const free=budget.reserve(patch.width*patch.height*3);loan.credits.push(free);const source=new Uint8Array(patch.width*patch.height*3);loan.backings.push(registerArrayViews(budget,{source},{owner:'selfdm-proposal',label:'literal-proposal-pyramid-source'}));
     for(let y=0;y<patch.height;y++){
      checkAbort(joined);const row=await context.nativeContext.readRows(patch.y+y,1,{signal:joined});loan.sourceLeases.push(row);
      try{const pixels=validateRgbRows(row,width,1);source.set(pixels.subarray(patch.x*3,(patch.x+patch.width)*3),y*patch.width*3)}
      catch(primary){await retireCompositeOwners([()=>loan.retireRow(row)],{primary});throw primary}
      await loan.retireRow(row);
     }
     return{command:'pyramid',source,width,height,scale:scale.scale,window,patch,heapBytes:window.nativeHeapBytes,cvURL};
    },validate(raw){requireValue(raw?.data instanceof Float32Array&&raw.data.length===window.nativeInputBytes/4&&JSON.stringify(raw.shape)===JSON.stringify([1,3,window.height,window.width])&&raw.data.every(Number.isFinite),'Native literal Proposal pyramid output differs')}},{signal,onOwner});
  },
  maskBox(candidate,{signal,onOwner}={}){
   requireValue(candidate?.data instanceof Float32Array&&candidate.data.length===112**2&&Array.isArray(candidate.contextBounds)&&Number.isInteger(candidate.scale)&&Number.isInteger(candidate.slot)&&Number.isInteger(candidate.cols),'Native common-bank Proposal candidate required');
   const width=candidate.contextBounds[2]-candidate.contextBounds[0],height=candidate.contextBounds[3]-candidate.contextBounds[1];
   return call({key:'mask-box',heap:48*MiB,io:112**2*4+16,outputBytes:16,
    prepare(loan){const free=budget.reserve(candidate.data.byteLength);loan.credits.push(free);const mask=candidate.data.slice();loan.backings.push(registerArrayViews(budget,{mask},{owner:'selfdm-proposal',label:'native-proposal-mask-box-input'}));return{command:'mask-box',mask,width,height,scale:2**(-2.5+candidate.scale*.5),row:Math.floor(candidate.slot/candidate.cols),col:candidate.slot%candidate.cols,heapBytes:48*MiB,cvURL}},
    validate(raw){requireValue(Number.isInteger(raw?.found)&&raw.box instanceof Int32Array&&raw.box.length===(raw.found?4:0),'Native Proposal mask-box output differs')}},{signal,onOwner});
  },
  gray(owner,resize,{signal,onOwner}={}){
   requireValue(owner?.readRows&&Array.isArray(owner.bounds)&&resize?.length===2&&resize.every(v=>Number.isSafeInteger(v)&&v>0),'Canonical native gray ROI owner required');
   const width=owner.bounds[2]-owner.bounds[0],height=owner.bounds[3]-owner.bounds[1],sourceBytes=width*height*3,area=resize[0]*resize[1],heap=roundMiB(16*MiB+sourceBytes*4+area*32);
   if(!Number.isSafeInteger(heap)||heap>2*1024**3)throw new EngineError('MEMORY_LIMIT','The unchanged native gray crop/resize exceeds its imported WASM maximum; no geometry or backend was reduced.');
   return call({key:'gray',workerURL:new URL('./selfdm-proposal-gray-worker.js',import.meta.url),heap,io:sourceBytes+area*7,outputBytes:area*4,
    async prepare(loan,joined){
     loan.credits.push(budget.reserve(sourceBytes));const source=new Uint8Array(sourceBytes);loan.backings.push(registerArrayViews(budget,{source},{owner:'selfdm-proposal',label:'literal-proposal-gray-source'}));
     for(let y=0;y<height;y++){checkAbort(joined);const row=await owner.readRows(y,1,{signal:joined});loan.sourceLeases.push(row);try{source.set(validateRgbRows(row,width,1),y*width*3)}catch(primary){await retireCompositeOwners([()=>loan.retireRow(row)],{primary});throw primary}await loan.retireRow(row)}
     return{command:'gray',source,width,height,resize,heapBytes:heap,cvURL};
    },validate(raw){requireValue(raw?.gray instanceof Float32Array&&raw.gray.length===area&&JSON.stringify(raw.shape)===JSON.stringify([1,1,resize[1],resize[0]])&&raw.gray.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Native gray preparation output differs')}},{signal,onOwner});
  },
  resizeMap(map,size,target,{signal,onOwner}={}){
   requireValue(map instanceof Float32Array&&[...size,...target].every(v=>Number.isSafeInteger(v)&&v>0)&&map.length===size[0]*size[1]&&Number.isSafeInteger(target[0]*target[1]*4),'Native Proposal Float32 resize geometry');
   const heap=roundMiB(16*MiB+map.byteLength+target[0]*target[1]*4);
   return call({key:'map-resize',heap,io:map.byteLength+target[0]*target[1]*4,outputBytes:target[0]*target[1]*4,
    prepare(loan){loan.credits.push(budget.reserve(map.byteLength));const data=map.slice();loan.backings.push(registerArrayViews(budget,{data},{owner:'selfdm-proposal',label:'native-proposal-map-resize-input'}));return{command:'resize',width:size[0],height:size[1],map:data,resize:size,target,heapBytes:heap,cvURL}},
    validate(raw){requireValue(raw?.data instanceof Float32Array&&raw.data.length===target[0]*target[1]&&raw.data.every(Number.isFinite),'Native Proposal resized score output differs')}},{signal,onOwner});
  }};
 async function call(spec,{signal,onOwner}){
  requireValue(!requested&&!closed,'Proposal CV client is retiring or disposed');
  const controller=new AbortController(),joined=AbortSignal.any([lifetime.signal,controller.signal,...(lifetimeSignal?[lifetimeSignal]:[]),...(signal?[signal]:[])]);checkAbort(joined);
  const baseKey=spec.key+'/'+spec.heap+'/'+spec.io;let key=baseKey,index=0,pool=pools.get(key);
  // WaveletStripPool.run is deliberately single-use-at-a-time. The native
  // Proposal gives concurrent ROIs distinct kernels. Borrow an idle compatible
  // lane here, retaining its native workers/admission for subsequent calls.
  // Equal rounded WASM heaps can carry different transport bytes. Their IO
  // admission must also agree before a worker is reused.
  while(pool&&busyPools.has(pool)){key=baseKey+'/lane/'+(++index);pool=pools.get(key)}
  if(!pool){pool=poolFactory(budget,{resourceOwner:'selfdm-proposal',resourceOperation,maxWorkers:profile.maxWorkers,workerHeapBytes:spec.heap,workerPixelBytes:spec.io,workerURL:spec.workerURL??new URL('./selfdm-proposal-worker.js',import.meta.url),...(workerFactory?{workerFactory}:{})});pools.set(key,pool)}
  busyPools.add(pool);
  let finished,retiring,released=false;const done=new Promise(resolve=>finished=resolve);
  const loan={raw:null,credits:[],backings:[],sourceLeases:[],
   async retireRow(row){await row.release();const index=loan.sourceLeases.indexOf(row);if(index>=0)loan.sourceLeases.splice(index,1)},
   release(){controller.abort();if(released)return Promise.resolve();if(retiring)return retiring;retiring=(async()=>{
    await done;while(loan.sourceLeases.length)await loan.retireRow(loan.sourceLeases.at(-1));
    while(loan.backings.length){await loan.backings.at(-1)();loan.backings.pop()}
    while(loan.credits.length){await loan.credits.at(-1)();loan.credits.pop()}
    loan.raw=null;released=true;loans.delete(loan);
   })().finally(()=>{retiring=null});return retiring;},
   state:()=>({released,retiring:!!retiring,sourceLeases:loan.sourceLeases.length,credits:loan.credits.length})};
  loans.add(loan);active.add(done);
  try{
   onOwner?.(loan);loan.credits.push(budget.reserve(spec.outputBytes+4096));
   await pool.run({count:1,pixels:1,key:spec.key,signal:joined,prepare:()=>spec.prepare(loan,joined),
    consume:value=>{spec.validate(value);requireValue(!loan.raw,'Native Proposal CV output was already adopted');loan.raw=value;loan.backings.push(registerArrayViews(budget,value,{owner:'selfdm-proposal',label:'native-proposal-CV-output'}))},
    local(){throw new EngineError('MEMORY_LIMIT','Shared admissions cannot admit the unchanged native Proposal CV worker; no geometry or backend was reduced.')}});
   checkAbort(joined);finished();return loan;
  }catch(primary){finished();await retireCompositeOwners([()=>loan.release()],{primary});throw primary}
  finally{finished();active.delete(done);busyPools.delete(pool)}
 }
 return client;
}
