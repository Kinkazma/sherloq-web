import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
const admissions=new WeakSet();
const moduleFactory=options=>import('../vendor/ssg-word-nearest/nearest.mjs').then(m=>m.default(options));
// One admitted fixed arena, one unchanged Native tree per original group.
// The parent owns this object before allocation, including failed cleanup ACKs.
export async function createSsgWordNearest(features,groups,{budget,signal,pendingOwners,createModule=moduleFactory}={}){
 requireValue(typeof pendingOwners?.add==='function'&&typeof pendingOwners?.delete==='function','Native SSG word index needs its strong parent owner.');
 const maximumGroup=Math.max(3,...groups.map(ids=>ids.length)),capacity=Math.ceil((32*MiB+maximumGroup*256)/65536)*65536;
 requireValue(capacity<=256*MiB,'Native SSG word index exceeds its qualified arena.');
 if(admissions.has(pendingOwners))throw new EngineError('BUSY','Native SSG word admission is busy.');
 admissions.add(pendingOwners);const previous=[...pendingOwners];
 let finishInit;const initIdle=new Promise(resolve=>finishInit=resolve);
 const cooperate=createCooperator(signal);let fee,memory,module,backing,lease,tree=0,input=0,output=0,closed=false,retiring=false,retirement,building=false,buildIdle=Promise.resolve();
 const owner={
  get retiring(){return retiring;},
  async build(ids){
   if(closed||retiring)throw new EngineError('DISPOSED','Native SSG word tree is retiring.');
   if(building||tree)throw new EngineError('BUSY','Native SSG word tree is busy.');
   requireValue(ids.length>=3,'Native SSG word tree needs two other observations.');
   requireValue(ids.every((id,i)=>Number.isSafeInteger(id)&&id>=0&&id<features.invariants.length/24&&(!i||ids[i-1]<id)),'Native SSG group IDs must preserve ascending original row order.');
   building=true;let finishBuild;buildIdle=new Promise(resolve=>finishBuild=resolve);
   try{
   for(let row=0;row<ids.length;row++){if(!(row%32))await cooperate();for(let d=0;d<24;d++)module.HEAPF64[input/8+row*24+d]=features.invariants[ids[row]*24+d];}
   checkAbort(signal);if(retiring)throw new EngineError('DISPOSED','Native SSG word tree is retiring.');lease=await getExecutionScheduler(budget).acquire({cpu:1,signal,resourceOwner:'ssg',label:'ssg-exact-word-neighbors'});checkAbort(signal);if(retiring)throw new EngineError('DISPOSED','Native SSG word tree is retiring.');tree=module._ssg_word_tree_create(input,ids.length);if(!tree)throw wasmAllocationFailure(module,'SSG word tree allocation failed.');
   let cursor=0,first=-1,last=-1,done=false;
   return{
    query(id,k){requireValue(!done&&!closed&&!retiring&&k===2&&id===ids[cursor],'Native SSG query order changed.');checkAbort(signal);
     if(cursor<first||cursor>=last){first=cursor;last=Math.min(ids.length,first+32);const status=module._ssg_word_tree_query(tree,first,last-first,output);if(status===-2)throw wasmAllocationFailure(module,'SSG word query allocation failed.');requireValue(status===0,'Invalid Native SSG word query.');}
     const at=output/8+(cursor++-first)*4,a=module.HEAPF64[at],b=module.HEAPF64[at+1];requireValue(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<ids.length&&b<ids.length,'Native SSG neighbor index changed.');
     return[{id:ids[a],distance:module.HEAPF64[at+2]},{id:ids[b],distance:module.HEAPF64[at+3]}];
    },
    async release(){if(done)return;if(tree){module._ssg_word_tree_release(tree);tree=0;}await lease?.release();lease=null;done=true;}
   };
   }finally{building=false;finishBuild();}
  },
  dispose(){if(closed)return Promise.resolve();if(retirement)return retirement;retiring=true;
   const task=(async()=>{
    await initIdle;await buildIdle;
    if(tree){module._ssg_word_tree_release(tree);tree=0;}await lease?.release();lease=null;if(input){module._free(input);input=0;}if(output){module._free(output);output=0;}module=null;memory=null;
    const retired=await backing?.();backing=null;if(retired!==0&&retired!==undefined)budget.notifyBackingRelease?.('wasm',retired);
    await fee?.();fee=null;closed=true;pendingOwners?.delete(owner);
   })();retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;
  }
 };
 pendingOwners?.add(owner);
 try{
  for(const older of previous){if(!older.retiring)throw new EngineError('BUSY','A Native SSG word index is still active.');await older.dispose();}
  checkAbort(signal);if(retiring)throw new EngineError('DISPOSED','Native SSG word admission is retiring.');
  fee=budget.reserve(capacity);memory=allocateWasmMemory({initial:capacity/65536,maximum:capacity/65536},{label:'SSG fixed binary64 word index'});
  backing=budget.registerBacking?.('wasm',capacity,{owner:'ssg',label:'Native exact word neighbors',identity:memory});
  module=await createModule({wasmMemory:memory});checkAbort(signal);if(retiring)throw new EngineError('DISPOSED','Native SSG word admission is retiring.');input=module._malloc(maximumGroup*24*8);output=module._malloc(32*4*8);
  if(!input||!output)throw wasmAllocationFailure(module,'SSG word input allocation failed.');return owner;
 }catch(primary){finishInit();await retireCompositeOwners([()=>owner.dispose()],{primary});throw primary;}
 finally{finishInit();admissions.delete(pendingOwners);}
}
