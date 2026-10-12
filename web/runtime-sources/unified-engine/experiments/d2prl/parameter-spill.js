import {createTemporarySession} from '../../src/temporary-storage.js';
import {createSegmentedBytes} from '../../src/segmented-bytes.js';
import {acquireMigrationWorkspace} from '../../src/migration-workspace.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {byteRange,byteSubrange,byteView} from '../../src/memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,serializeEngineError} from '../../src/errors.js';
import {withD2prlActivity} from './resource-activity.js';

// Only inactive verified parameter bytes enter this owned session. No disk
// pointer replaces a native tensor; a complete checked tensor is republished.
export function createParameterSpill({budget,windowBytes=256*1024,temporarySessionFactory=createTemporarySession}={}){
 requireValue(budget&&Number.isSafeInteger(windowBytes)&&windowBytes>0&&windowBytes<=1024**2,'Bounded parameter migration window required');
 const controller=new AbortController(),saved=new Set(),pending=new Set();
 let credit,workspace,workspaceContribution=0,session,opening,disposed=false,disposing;
 const stats={sessionsCreated:0,spillBytes:0,spillWrittenBytes:0,spillReadbackBytes:0,rehydratedBytes:0,rehydrationReadBytes:0,spillMs:0,rehydrationMs:0,spillFailures:0,rehydrationFailures:0,lastFailure:null};
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Parameter spill owner disposed');};
 const ownedSignal=signal=>signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const track=task=>{pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 const failed=(phase,error)=>{stats[phase==='spill'?'spillFailures':'rehydrationFailures']++;stats.lastFailure={phase,error:serializeEngineError(error)};};
 const ioWorkspace=()=>{
  if(workspace)return workspace;
  requireValue(credit,'Parameter migration window was not admitted before pressure');
  workspace=acquireMigrationWorkspace(budget,3*windowBytes,{reserve:bytes=>{const part=credit.split(bytes);workspaceContribution+=bytes;return part;}});
  credit();credit=null;return workspace;
 };
 const open=async signal=>{
  alive();checkAbort(signal);
  if(!session){opening??=Promise.resolve().then(()=>temporarySessionFactory({budget,signal,pageBytes:windowBytes,readCache:false})).then(value=>{session=value;stats.sessionsCreated++;return value;}).finally(()=>{opening=null;});await opening;}
  alive();checkAbort(signal);return session;
 };
 const discard=async value=>{if(!value||!saved.has(value))return;await value.store.dispose();saved.delete(value);};
 return{
  // Policy escrow precedes the useful RAM allocation; it materializes no I/O
  // buffer/session. On pressure it funds the common serialized Budget window.
  prepare(){alive();if(!credit&&!workspace)credit=budget.reserve(3*windowBytes);},
  save(tensor,spec,{signal,resourceOperation}={}){
   signal=ownedSignal(signal);const started=performance.now();
   return track((async()=>{
    let candidate,committed=false;
    try{
     alive();checkAbort(signal);const owner=ioWorkspace();
     candidate=await withD2prlActivity(budget,'parameter:spill-storage-initialization','io',async()=>createSegmentedBytes(spec.bytes,{budget,storage:'temporary',chunkBytes:windowBytes,temporarySession:await open(signal),signal,owner:'d2prl',label:'verified-parameter-spill'}),{parent:resourceOperation});
     const data=tensor.data;requireValue(ArrayBuffer.isView(data)&&data.byteLength===spec.bytes,'Parameter spill source lease extent differs');
     const source=byteRange(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
     await withD2prlActivity(budget,'parameter:spill-io','io',activity=>owner.run(async reserve=>{
      const window=allocateOwnedTypedArray(Uint8Array,Math.min(windowBytes,spec.bytes),{budget,reserve,owner:'d2prl',label:'parameter-spill-verification'});
      try{
       for(let at=0;at<spec.bytes;at+=windowBytes){await controlCheckpoint(signal);alive();const size=Math.min(windowBytes,spec.bytes-at);await candidate.write(byteSubrange(source,at,size),at,{reserve});stats.spillWrittenBytes+=size;}
       await candidate.flush();checkAbort(signal);
       for(let at=0;at<spec.bytes;at+=windowBytes){await controlCheckpoint(signal);alive();activity?.setState('io');const size=Math.min(windowBytes,spec.bytes-at),target=window.data.subarray(0,size);await candidate.readInto(target,at,{reserve});stats.spillReadbackBytes+=size;checkAbort(signal);activity?.setState('compute');const expected=byteView(source,at,size);for(let i=0;i<size;i++)if(target[i]!==expected[i])throw new EngineError('STORAGE_INTEGRITY','Parameter spill bytes differ after flush',{details:{asset:spec.file,offset:at+i}});}
      }finally{window.release();}
     },{signal}),{parent:resourceOperation});
     alive();checkAbort(signal);const value={store:candidate,bytes:spec.bytes,sha256:spec.sha256};saved.add(value);candidate=null;committed=true;stats.spillBytes+=spec.bytes;return value;
    }catch(error){failed('spill',error);throw error;}
    finally{try{if(!committed)await candidate?.dispose();}finally{stats.spillMs+=performance.now()-started;}}
   })());
  },
  restore(value,spec,{allocate,hasher,signal}={}){
   signal=ownedSignal(signal);const started=performance.now();
   return track((async()=>{
    let candidate,complete=false;
    try{
     alive();checkAbort(signal);requireValue(saved.has(value)&&value.bytes===spec.bytes&&value.sha256===spec.sha256,'Owned parameter spill identity differs');
     candidate=await allocate();const data=candidate.data;requireValue(ArrayBuffer.isView(data)&&data.byteLength===spec.bytes,'Parameter spill destination lease extent differs');const target=byteRange(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));hasher.init();
     await withD2prlActivity(budget,'parameter:rehydrate-io','io',activity=>ioWorkspace().run(async reserve=>{
      for(let at=0;at<spec.bytes;at+=windowBytes){await controlCheckpoint(signal);alive();activity?.setState('io');const size=Math.min(windowBytes,spec.bytes-at),part=byteSubrange(target,at,size);await value.store.readInto(part,at,{reserve});stats.rehydrationReadBytes+=size;checkAbort(signal);activity?.setState('compute');hasher.update(byteView(part));}
     },{signal}));
     const digest=hasher.digest('hex');alive();checkAbort(signal);if(digest!==spec.sha256)throw new EngineError('STORAGE_INTEGRITY','Rehydrated parameter digest differs',{details:{asset:spec.file}});
     complete=true;stats.rehydratedBytes+=spec.bytes;return candidate;
    }catch(error){failed('rehydration',error);throw error;}
    finally{try{if(!complete)candidate?.release();}finally{stats.rehydrationMs+=performance.now()-started;}}
   })());
  },
  discard(value){return track(discard(value));},
  snapshot(){return{...stats,windowBytes,ownedWorkspacePolicyBytes:credit?.bytes??workspaceContribution,sharedWindowCapacityBytes:workspace?.capacityBytes??0,storedParameters:saved.size,storedBytes:[...saved].reduce((sum,value)=>sum+value.bytes,0),session:session?.snapshot?.()??null};},
  dispose(){
   if(disposed)return disposing;disposed=true;controller.abort();credit?.();credit=null;
   if(!session&&!opening&&!pending.size&&!workspace)return;
   disposing=(async()=>{await Promise.allSettled([...pending]);let error;try{for(const value of [...saved])try{await discard(value);}catch(cause){error??=cause;}await session?.dispose();saved.clear();}catch(cause){error??=cause;}finally{await workspace?.release();workspace=null;workspaceContribution=0;session=null;}if(error)throw error;})();return disposing;
  }
 };
}
