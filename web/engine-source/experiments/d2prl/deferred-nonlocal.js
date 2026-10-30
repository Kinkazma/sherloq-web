// PRIVATE. Logical nonlocal result; no shared controller or provider is changed.
// A caller must use admitsDeferredNonlocal before enabling the GPU consumer.
import {NativeMpsRandom,MPS_RANDOM_ALGORITHM} from './random-mps.js';
import {nonlocalOffsets,searchBounds} from './candidates.js';
import {checkAbort,requireValue,controlCheckpoint,normalizeResourceError} from '../../src/errors.js';
import {createConvolutionSyncRetirement,preserveConvolutionPrimary} from './convolution-retirement.js';

const frames=new WeakMap();
export const admitsDeferredNonlocal=({side,arithmetic,scientificMask})=>side===448&&arithmetic==='mps'&&scientificMask==null;
export const deferredNonlocalFrame=owner=>frames.get(owner)?.();

export async function prepareDeferredNonlocal({random,pair,side,budget,adoptOwner,signal,operation=(_label,work)=>work(),allocate=count=>new Float32Array(count)}={}){
 requireValue(budget?.reserve&&typeof adoptOwner==='function'&&typeof allocate==='function'&&Number.isSafeInteger(side)&&side>=2&&side<=448,'Owned bounded deferred nonlocal recipe required');
 requireValue(random?.snapshot&&random?.stateBytes&&random?.reserveSourcePair,'Native MPS source-pair API required');
 const n=side*side,life=new AbortController(),selected=signal?AbortSignal.any([signal,life.signal]):life.signal,loans=new Set(),readers=new Set(),borrows=new Set(),materializationDebts=new Set();
 let packed,before,after,stateBefore,counters,key,ticket,published=false,closed=false,retired=false,materialized,materializing,closing;
 function credit(bytes){
  const record={free:null,backing:null,value:null};
  record.retirement=createConvolutionSyncRetirement([()=>record.backing?.(),()=>record.free?.(),()=>{record.value=null;record.free=record.backing=null;loans.delete(record);}]);
  loans.add(record);record.free=budget.reserve(bytes);return record;
 }
 function floats(count,group){
  const record=credit(count*4);group?.push(record);try{record.value=allocate(count);}catch(error){throw normalizeResourceError(error,{allocationKind:'array-buffer',requestedBytes:count*4,allocation:'deferred-nonlocal'});}
  requireValue(record.value instanceof Float32Array&&record.value.length===count,'Deferred nonlocal allocation extent');
  record.backing=budget.registerBacking?.('array-buffer',count*4,{owner:'d2prl',label:'deferred-nonlocal',identity:record.value.buffer});return record.value;
 }
 async function drainReaders(){
  let failed=false,primary;for(const record of [...readers])try{await record.release();readers.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}
  if(failed)throw primary;
 }
 function retireLoans(records){
  let failed=false,primary;for(const record of records)try{record.retirement.release();}catch(error){if(!failed){failed=true;primary=error;}}
  if(failed)throw primary;
 }
 function retireMaterialization(records=[]){
  for(const record of records)materializationDebts.add(record);
  try{retireLoans([...materializationDebts]);}
  finally{for(const record of materializationDebts)if(!loans.has(record))materializationDebts.delete(record);}
 }
 const owner={
  deferredNonlocal:true,
  get published(){return published;},get retired(){return retired;},get residentBytes(){return [...loans].reduce((sum,record)=>sum+(record.value?.byteLength??0),0);},
  get stateBefore(){return before;},get stateAfter(){return after;},
  borrow(retire){
   requireValue(published&&!closed&&borrows.size===0&&typeof retire==='function','One owned consuming plan per deferred nonlocal recipe');
   let live=true;const pin={retire,release(){if(live){live=false;borrows.delete(pin);}}};borrows.add(pin);
   // A failed dependent plan retirement rejects this owner too, preserving the
   // debt for retry instead of awaiting a pin which can no longer be released.
   return{frame:()=>deferredNonlocalFrame(owner),release:pin.release};
  },
  adoptGpuReader(release){requireValue(published&&!closed&&typeof release==='function','Live deferred nonlocal reader required');let done=false,flight;const record={release(){if(done)return Promise.resolve();if(flight)return flight;const task=Promise.resolve().then(release).then(()=>{done=true;});flight=task;task.then(()=>{},()=>{if(flight===task)flight=null;});return task;}};readers.add(record);return async()=>{await record.release();readers.delete(record);};},
  async materialize({signal:extra}={}){
   checkAbort(selected);checkAbort(extra);requireValue(published&&!closed,'Deferred nonlocal recipe is unavailable');
   if(materializing)return materializing;retireMaterialization();if(materialized)return materialized;
   const task=(async()=>{
    const outputs=[],noise=[],replay=new NativeMpsRandom({stateBytes:stateBefore}),partSignal=extra?AbortSignal.any([selected,extra]):selected;let complete=false,failed=false,primary;
    try{
     // values() and both mathematical functions are the same scalar reference.
     // The live generator has already advanced and is never touched here.
     const scalar={async values(count){requireValue(count===n&&noise.length<2,'Two exact native nonlocal noise tensors');const record=credit(count*4);noise.push(record);record.value=await replay.values(count,{signal:partSignal});record.backing=budget.registerBacking?.('array-buffer',count*4,{owner:'d2prl',label:'deferred-nonlocal-replay',identity:record.value.buffer});return record.value;}};
     const hooks={signal:partSignal,allocate:count=>floats(count,outputs)},pair=await nonlocalOffsets({x:packed.subarray(0,n),y:packed.subarray(n)},side,scalar,hooks),bounds=await searchBounds(pair,side,hooks);
     checkAbort(selected);checkAbort(extra);requireValue(JSON.stringify(replay.snapshot())===JSON.stringify(after),'Deferred replay native cursor differs');
     materialized=Object.freeze({pair:Object.freeze(pair),bounds:Object.freeze(bounds)});complete=true;return materialized;
    }catch(error){failed=true;primary=error;throw error;}
    finally{let cleanupFailed=false,cleanup;try{await replay.dispose();}catch(error){cleanupFailed=true;cleanup=error;}try{retireMaterialization([...noise,...(!complete?outputs:[])]);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}if(cleanupFailed){if(failed)preserveConvolutionPrimary(primary,cleanup);else throw cleanup;}}
   })();materializing=task;void task.finally(()=>{if(materializing===task)materializing=null;}).catch(()=>{});return task;
  },
  release(){closed=true;life.abort();void owner.dispose().catch(()=>{});},
  dispose(){
   if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();
   const task=(async()=>{await materializing?.catch(()=>{});const results=await Promise.allSettled([...borrows].map(pin=>pin.retire()));for(const result of results)if(result.status==='rejected')throw result.reason;requireValue(borrows.size===0,'Deferred consuming plan must release its pin after ACK');await drainReaders();retireLoans([...loans]);materializationDebts.clear();packed=materialized=stateBefore=null;retired=true;})();closing=task;task.then(()=>{},()=>{if(closing===task)closing=null;});return task;
  }
 };
 frames.set(owner,()=>({packed,counters,key,side,signal:selected,published,closed}));
 // Registry adoption MUST precede the first reservation, backing or allocation.
 adoptOwner(owner);
 let failed=false,primary;
 try{
  checkAbort(selected);requireValue(pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===n&&pair.y.length===n,'Complete deferred nonlocal offset planes required');
  await operation('deferred-nonlocal:admit',()=>credit(4096));
  packed=await operation('deferred-nonlocal:copy',()=>{const data=floats(2*n);data.set(pair.x);data.set(pair.y,n);return data;});
  const small=2**-100;let valid=true,stamp=performance.now();for(let i=0;i<2*n;i++){const v=packed[i];if(!Number.isFinite(v)||Math.abs(v)>side||(v!==0&&Math.abs(v)<small)){valid=false;break;}if((i&8191)===0){checkAbort(selected);if(performance.now()-stamp>=8){await controlCheckpoint(selected);stamp=performance.now();}}}
  if(!valid){await owner.dispose();return null;}
  checkAbort(selected);before=random.snapshot();Object.freeze(before.state);Object.freeze(before);requireValue(before.algorithm===MPS_RANDOM_ALGORITHM,'Deferred recipe requires native MPS state');stateBefore=random.stateBytes();
  // No await is permitted between pair reservation and logical publication.
  // Other branches can then reserve their own two tensors without a busy ticket.
  ticket=random.reserveSourcePair(n,{signal:selected});counters=Object.freeze(ticket.counters.map(value=>Object.freeze([...value])));key=Object.freeze([...ticket.key]);
  after=random.snapshot();Object.freeze(after.state);Object.freeze(after);checkAbort(selected);ticket.commit();published=true;return owner;
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  if(!published){try{if(ticket?.active)ticket.rollback();}catch(cleanup){if(failed)preserveConvolutionPrimary(primary,cleanup);else{failed=true;primary=cleanup;}}try{await owner.dispose();}catch(cleanup){if(failed)preserveConvolutionPrimary(primary,cleanup);else throw cleanup;}}
 }
}
