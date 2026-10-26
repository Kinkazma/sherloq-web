import {createIndexedDbSession} from './unified-engine/src/indexeddb-storage.js';
import {Budget} from './unified-engine/src/cache.js';

export const INDEXEDDB_EXPORT_PAGE_BYTES=1024**2;
const PAGE=INDEXEDDB_EXPORT_PAGE_BYTES;
const error=(code,message)=>Object.assign(Error(message),{code});
const cancelled=signal=>signal?.reason instanceof Error?signal.reason:error('CANCELLED','Export cancelled.');
function supplement(primary,cleanup){
 if(primary&&typeof primary==='object')try{primary.cleanupFailures=[...(primary.cleanupFailures??[]),{code:cleanup?.code??cleanup?.name??'CLEANUP_FAILED',message:String(cleanup?.message??cleanup)}];}catch{}
}
async function admission(reserve,bytes){
 if(!bytes)return null;
 const lease=await reserve(bytes),release=typeof lease==='function'?lease:typeof lease?.release==='function'?()=>lease.release():null;
 if(!release)throw error('INVALID_INPUT','Export admission must return its owned release callback.');
 let released=false;return async()=>{if(released)return;released=true;await release();};
}

// IDB is browser-managed storage, not guaranteed disk. The 2 MiB local staging
// budget below is funded by an actual 3 MiB caller admission (one caller input
// window plus two IDB staging pages); it does not admit independent memory.
// Each write ACK follows all of its transactions. Callers retain one <=1 MiB
// input unchanged until that ACK, instead of queuing unbounded input buffers.
export async function createIndexedDbExportWriter({signal,mime='application/octet-stream',reserve}={}){
 if(typeof reserve!=='function')throw error('INVALID_INPUT','An effective asynchronous export admission is required.');
 if(signal?.aborted)throw cancelled(signal);
 let ioRelease,blobRelease,session;
 const staging=new Budget(2*PAGE),pages=new Map();
 try{
  ioRelease=await admission(reserve,3*PAGE);
  if(signal?.aborted)throw cancelled(signal);
  session=await createIndexedDbSession({signal,budget:staging,pageBytes:PAGE,readCache:false});
 }catch(primary){try{await ioRelease?.();}catch(cleanup){supplement(primary,cleanup);}throw primary;}
 let position=0,size=0,active=null,sealing,closing,finalizing,finishing,retiring,finishedBlob;
 let state='open',failure,cleanupFailure;
 const check=()=>{if(signal?.aborted)throw cancelled(signal);if(failure)throw failure;};
 const open=()=>{check();if(state!=='open')throw error('DISPOSED','Export writer is no longer writable.');if(active)throw error('BUSY','Await the previous export window before writing another.');};
 const location=value=>{if(!Number.isSafeInteger(value)||value<0)throw error('INVALID_INPUT','Invalid export byte position.');return value;};
 async function retire(reason){
  if(state!=='finished'&&failure===undefined)failure=reason??error('CANCELLED','Export cancelled.');
  if(retiring){try{return await retiring;}catch(cleanup){if(reason)supplement(reason,cleanup);throw cleanup;}}
  if(state!=='finished')state='aborted';
  const pending=active,finalWork=finalizing,sealWork=sealing;
  retiring=(async()=>{
   await pending?.catch(()=>{});await sealWork?.catch(()=>{});await finalWork?.catch(()=>{});
   let first;
   const clean=async fn=>{try{await fn();}catch(e){if(first===undefined)first=e;else supplement(first,e);if(failure&&failure!==e)supplement(failure,e);}};
   await clean(()=>session?.dispose());pages.clear();
   await clean(()=>blobRelease?.());blobRelease=null;finishedBlob=null;
   await clean(()=>ioRelease?.());ioRelease=null;
   signal?.removeEventListener('abort',onAbort);
   if(first!==undefined){cleanupFailure=first;throw first;}
  })();
  return retiring;
 }
 const onAbort=()=>{void retire(cancelled(signal)).catch(()=>{});};
 signal?.addEventListener('abort',onAbort,{once:true});
 if(signal?.aborted){const primary=cancelled(signal);try{await retire(primary);}catch{}throw primary;}
 function seal(){
  if(sealing)return sealing;
  if(state==='closed'||state==='finished')return Promise.resolve();
  if(state!=='open')return Promise.reject(failure??cleanupFailure??error('DISPOSED','Export writer is closed.'));
  state='closing';const pending=active;
  return sealing=(async()=>{await pending;check();if(state==='aborted')throw failure??error('CANCELLED','Export cancelled.');state='closed';})();
 }
 const owner={
  get storage(){return'indexeddb';},
  get state(){return{status:state,size,position,busy:!!active,stagingBytes:staging.total(),stagingPeakBytes:staging.peak,ioAdmitted:!!ioRelease,blobAdmitted:!!blobRelease,pages:pages.size,sessionId:session.id,backingMedium:'browser-managed; not guaranteed disk'};},
  write(value){
   try{open();}catch(e){return Promise.reject(e);}
   let bytes=value,at=position;
   if(value?.type==='write'){bytes=value.data;try{at=location(value.position);}catch(e){return Promise.reject(e);}}
   if(!(bytes instanceof Uint8Array)||bytes.byteLength>PAGE)return Promise.reject(error('INVALID_INPUT','Export writes require one Uint8Array window of at most 1 MiB.'));
   const end=at+bytes.byteLength;if(!Number.isSafeInteger(end))return Promise.reject(error('INVALID_INPUT','Export byte extent exceeds safe integer coordinates.'));
   const task=(async()=>{
    let done=0;
    while(done<bytes.byteLength){
     check();const absolute=at+done,index=Math.floor(absolute/PAGE),within=absolute%PAGE,length=Math.min(bytes.byteLength-done,PAGE-within);
     let page=pages.get(index);if(!page){page=await session.create(PAGE);pages.set(index,page);}
     await page.write(bytes.subarray(done,done+length),within);done+=length;check();
    }
    position=end;size=Math.max(size,end);
   })();active=task;
   return task.catch(async primary=>{failure??=primary;try{await retire(primary);}catch{}throw primary;}).finally(()=>{if(active===task)active=null;});
  },
  async seek(value){open();position=location(value);},
  close(){
   if(closing)return closing;
   return closing=seal().catch(async primary=>{failure??=primary;try{await retire(primary);}catch{}throw primary;});
  },
  finish(){
   if(finishing)return finishing;
   const task=(async()=>{
     await seal();check();
     blobRelease=await admission(reserve,size);check();
     const parts=[];
     // readInto's own single-page reservation and this target share the funded
     // 2 MiB staging mirror. Immutable Blob parts are charged to the N-byte
     // final-output admission before the first part is constructed.
     const windowBytes=Math.min(PAGE,size),targetRelease=staging.reserve(windowBytes);
     try{const target=new Uint8Array(windowBytes);for(let offset=0;offset<size;offset+=PAGE){
      check();const length=Math.min(PAGE,size-offset),view=target.subarray(0,length),page=pages.get(Math.floor(offset/PAGE));
      if(page)await page.readInto(view);else view.fill(0);
      check();parts.push(new Blob([view]));
     }finishedBlob=new Blob(parts,{type:mime});parts.length=0;}finally{targetRelease();}
     check();await session.dispose();pages.clear();await ioRelease?.();ioRelease=null;check();
     state='finished';signal?.removeEventListener('abort',onAbort);
     return{blob:finishedBlob,storage:'indexeddb',backingMedium:'browser-managed; not guaranteed disk',cleanup:()=>retire()};
   })();finalizing=task;
   return finishing=task.catch(async primary=>{failure??=primary;try{await retire(primary);}catch{}throw primary;}).finally(()=>{if(finalizing===task)finalizing=null;});
  },
  abort:reason=>retire(reason)
 };
 return owner;
}
