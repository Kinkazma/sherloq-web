import {createTemporarySession,temporaryStorageCapabilities} from '../src/temporary-storage.js';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';
const pattern=(offset,target)=>{for(let i=0;i<target.length;i++)target[i]=Math.imul((offset+i)>>>0,73)^((offset+i)>>>13);};
async function impreciseUsageAdmission(backend,budget){
 const storage=navigator.storage,prior=Object.getOwnPropertyDescriptor(storage,'estimate');let owned,array;const release=budget.reserve(1024**2);
 try{
  Object.defineProperty(storage,'estimate',{configurable:true,value:async()=>({quota:96*1024**2,usage:96*1024**2})});
  owned=await createTemporarySession({maximumBytes:2*1024**2,budget,backend});array=await owned.create(1024**2);await array.write(new Uint8Array(1024**2).fill(77),0);const read=new Uint8Array(17);await array.readInto(read,1024**2-17);if(read.some(v=>v!==77))throw Error('Imprecise-usage admission changed bytes');
 }finally{try{await array?.dispose();await owned?.dispose();}finally{release();if(prior)Object.defineProperty(storage,'estimate',prior);else delete storage.estimate;}}
}
onmessage=async({data})=>{
 let session,store,phase='capabilities';const budget=new Budget(8*1024**2);
 try{
  const capability=await temporaryStorageCapabilities();if(!capability.available)throw Object.assign(Error('OPFS unavailable'),{code:'STORAGE_UNAVAILABLE'});
  phase='session-create';session=await createTemporarySession({maximumBytes:96*1024**2,budget,backend:data.backend??'auto'});postMessage({sessionId:session.id,backend:session.backend,phase:'created'});
  phase='array-create';const total=64*1024**2+113,chunk=1024**2+17;store=await createSegmentedBytes(total,{budget,chunkBytes:chunk,temporarySession:session});if(store.storage!=='temporary')throw Error('Expected temporary plan');
  const release=budget.reserve(chunk);let written=0;const start=performance.now();
  phase='write';try{const buffer=new Uint8Array(chunk);while(written<total){const part=buffer.subarray(0,Math.min(chunk,total-written));pattern(written,part);await store.write(part,written);written+=part.length;if(data.terminate&&written>=chunk*2){postMessage({phase:'terminate-now',sessionId:session.id,backend:session.backend});return;}}}finally{release();}
  phase='flush';await store.flush();const writeMs=performance.now()-start;let readMs=performance.now();phase='read';
  await store.visit((part,offset)=>{for(let i=0;i<part.length;i++)if(part[i]!==((Math.imul((offset+i)>>>0,73)^((offset+i)>>>13))&255))throw Error('Temporary array bytes differ');});readMs=performance.now()-readMs;
  const probes=[[chunk-19,73],[2*chunk-3,111],[total-200,200],[0,17]];for(const [at,n] of probes){const actual=new Uint8Array(n),expected=new Uint8Array(n);pattern(at,expected);await store.readInto(actual,at);if(actual.some((v,i)=>v!==expected[i]))throw Error('Random segment seam');}
  let cacheChecks=null;
  if(session.backend==='indexeddb'){
   phase='cache-reuse';const target=new Uint8Array(17),expected=new Uint8Array(17);pattern(0,expected);await store.readInto(target,0);const before=session.snapshot().reads;await store.readInto(target,1);const after=session.snapshot().reads;if(after.transactions!==before.transactions||after.cacheHits!==before.cacheHits+1)throw Error('Repeated page read did not reuse cache');
   phase='cache-write';await store.write(new Uint8Array([7,9,11]),0);await store.readInto(target,0);const changed=expected.slice();changed.set([7,9,11]);if(target.some((x,i)=>x!==changed[i]))throw Error('Cached bytes survived overlapping write');await store.write(expected,0);await store.readInto(target,0);
   phase='cache-failed-write';const pressure=budget.reserve(budget.limit-1024**2);let failure;try{await store.write(new Uint8Array([99]),0);}catch(e){failure=e.code;}finally{pressure();}if(failure!=='MEMORY_LIMIT')throw Error('Expected real staging admission failure');await store.readInto(target,0);if(target.some((x,i)=>x!==expected[i]))throw Error('Failed write changed source or retained stale cache');
   phase='cache-eviction';const evict=budget.reserve(budget.limit);if(budget.cacheBytes)throw Error('Cache blocked active work');evict();const reads=session.snapshot().reads.transactions;await store.readInto(target,0);if(session.snapshot().reads.transactions!==reads+1||target.some((x,i)=>x!==expected[i]))throw Error('Eviction changed pixels or prevented reload');
   cacheChecks={reuse:true,overlappingWriteInvalidation:true,failedWriteInvalidation:true,sharedBudgetEviction:true};
  }
  phase='quota';let quota;try{await session.create(40*1024**2);}catch(e){quota=e.code;}if(quota!=='STORAGE_QUOTA')throw Error('Logical quota admission');
  let cancelled;try{await store.visit(()=>{}, {signal:AbortSignal.abort()});}catch(e){cancelled=e.code;}if(cancelled!=='CANCELLED'||budget.active)throw Error('Cancelled staging reservation');
  phase='array-dispose';const snapshot=session.snapshot();await store.dispose();store=null;if(session.snapshot().reservedBytes||session.snapshot().openFiles||budget.cacheBytes)throw Error('Temporary file/cache release');
  phase='concurrent-admission';
  const competing=await Promise.allSettled([session.create(60*1024**2),session.create(60*1024**2)]);
  if(competing.filter(x=>x.status==='fulfilled').length!==1||competing.find(x=>x.status==='rejected')?.reason.code!=='STORAGE_QUOTA')throw Error('Concurrent reservation oversubscription');
  const owned=competing.find(x=>x.status==='fulfilled').value;await Promise.all([owned.dispose(),owned.dispose()]);if(session.snapshot().reservedBytes)throw Error('Concurrent release leak');
  phase='overlapping-writes';const overlap=await session.create(257),overlapBytes=new Uint8Array(257);await overlap.readInto(overlapBytes,0);if(overlapBytes.some(x=>x!==0))throw Error('Implicit zero page');await Promise.all([overlap.write(new Uint8Array(73).fill(17),0),overlap.write(new Uint8Array(59).fill(29),73)]);await overlap.readInto(overlapBytes,0);if(overlapBytes.some((x,i)=>x!==(i<73?17:i<132?29:0)))throw Error('Concurrent page read-modify-write lost data');await overlap.dispose();
  phase='dispose-during-create';const creating=session.create(1024**2),closing=session.dispose(),outcomes=await Promise.allSettled([creating,closing]);if(outcomes[1].status!=='fulfilled'||outcomes[0].status==='rejected'&&outcomes[0].reason.code!=='DISPOSED')throw Error('Dispose during creation');if(outcomes[0].status==='fulfilled')await outcomes[0].value.dispose();
  phase='session-dispose';const id=session.id,backend=session.backend,fallback=session.fallback??null;await Promise.all([session.dispose(),session.dispose()]);session=null;phase='imprecise-usage-estimate';await impreciseUsageAdmission(backend,budget);if(budget.total())throw Error('RAM allowance leak');postMessage({done:true,result:{status:'passed',backend,fallback,capability,bytes:total,chunkBytes:chunk,writeMs,readMs,peakRamAccountedBytes:budget.peak,storage:snapshot,sessionId:id,quotaAdmission:true,impreciseUsageAdmission:true,concurrentAdmission:true,overlappingPageWrites:true,idempotentCleanup:true,disposeDuringCreate:true,randomSeams:probes.length,cancellation:true,cacheChecks}});
 }catch(error){postMessage({done:true,error:{code:error.code??'TEST_FAILED',message:phase+': '+error.message}});}
 finally{if(!data.terminate){try{await store?.dispose();}catch{}try{await session?.dispose();}catch{}}}
};
