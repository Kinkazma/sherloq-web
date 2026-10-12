import {Budget} from '../src/cache.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {EngineError} from '../src/errors.js';

const MiB=1024**2,WINDOW_BYTES=64*1024;
const requireTest=(value,message)=>{if(!value)throw new Error(message);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
async function inventory(backend){
 if(backend==='indexeddb'){requireTest(typeof indexedDB.databases==='function','Database inventory unavailable');return (await indexedDB.databases()).map(value=>value.name).filter(name=>name?.startsWith('sherloq-temporary-v1-')).sort();}
 const root=await navigator.storage.getDirectory();let directory;
 try{directory=await root.getDirectoryHandle('sherloq-temporary-v1');}catch(error){if(error.name==='NotFoundError')return [];throw error;}
 const names=[];for await(const [name]of directory.entries())names.push(name);return names.sort();
}
async function exact(lease,spec){
 const values=lease.data;requireTest(values instanceof Float32Array&&values.length===spec.bytes/4,'Float32 extent differs');
 for(let i=0;i<values.length;i++)requireTest(values[i]===((i%251)-125)/128,'Synthetic parameter value differs at '+i);
 const actual=await digest(new Uint8Array(values.buffer,values.byteOffset,values.byteLength));requireTest(actual===spec.sha256,'Pinned parameter SHA differs');return actual;
}
async function runCase(backend,mode,spec){
 const before=await inventory(backend),budget=new Budget(32*MiB),controller=new AbortController(),sessions=[],sessionIds=[];
 const injections={explicitLogicalQuota:mode==='quota',writeIoAfterRealWrite:mode==='io',cancelAfterRealWrite:mode==='cancel'};
 let requests=0,lease,store,injected=false,phase='initialization',outcome,error;
 const realStorageIo={writeCalls:0,writeBytes:0,readCalls:0,readBytes:0,scope:'Successful calls at the real storage array API; backend page/transaction bytes may differ.'};
 const started=performance.now();
 try{
  store=createParameterStore({budget,spill:true,spillWindowBytes:WINDOW_BYTES,assetBaseUrl:location.origin+'/',fetchAsset:async(...args)=>{requests++;return fetch(...args);},temporarySessionFactory:async options=>{
   const session=await createTemporarySession({...options,backend,maximumBytes:mode==='quota'?spec.bytes-1:2*spec.bytes});sessions.push(session);sessionIds.push(session.id);postMessage({phase:'owned-session',backend,mode,sessionId:session.id});
   return{...session,async create(...args){const file=await session.create(...args);return{...file,async write(...values){await file.write(...values);realStorageIo.writeCalls++;realStorageIo.writeBytes+=values[0].byteLength;if(!injected&&mode==='io'){injected=true;throw new EngineError('STORAGE_IO','Explicit test injection after a real '+backend+' write');}if(!injected&&mode==='cancel'){injected=true;controller.abort();}},async readInto(...values){const result=await file.readInto(...values);realStorageIo.readCalls++;realStorageIo.readBytes+=values[0].byteLength;return result;}};}};
  }});
  phase='initial-verified-load';lease=await store.acquire(spec,{retain:true});const initialSha=await exact(lease,spec),initialView=lease.data;lease.release();lease=null;
  requireTest(!sessions.length,'Storage session opened without pressure');budget.setLimit(budget.total()+256*1024);
  phase='useful-admission-refusal';let refused=false;try{const unexpected=budget.reserve(4*MiB);unexpected();}catch(failure){refused=failure.code==='MEMORY_LIMIT';}requireTest(refused,'Useful policy admission did not fail');requireTest(!sessions.length,'Session opened before demonstrated recovery');
  const recovery=budget.beginRecovery({owner:'parameter-spill-browser-test',kind:'wasm',requestedBytes:4*MiB}),priorRetirements=budget.backingReleased.get('wasm')??0;let reclaimedBytes=0,cancelled=false;
  phase='real-storage-spill';try{reclaimedBytes=await budget.reclaim(4*MiB,{owner:'parameter-spill-browser-test',signal:mode==='cancel'?controller.signal:undefined});}catch(failure){if(mode!=='cancel'||failure.code!=='CANCELLED')throw failure;cancelled=true;}finally{recovery();}
  const backingRetirementsDuringRecovery=(budget.backingReleased.get('wasm')??0)-priorRetirements,afterPressure=store.snapshot();requireTest(sessions.length===1,'Expected one lazily owned real storage session');
  if(mode==='normal')requireTest(afterPressure.spilledEntries===1&&afterPressure.residentBytes===0&&reclaimedBytes>=16*MiB,'Complete verified spill did not retire its idle Wasm bank');
  if(mode==='quota'||mode==='io')requireTest(afterPressure.entries===0&&afterPressure.storageFallbacks===1&&afterPressure.lastStorageFallback.code===(mode==='quota'?'STORAGE_QUOTA':'STORAGE_IO'),'Explicit failure did not produce the expected idle-cache fallback');
  if(mode==='cancel')requireTest(cancelled&&afterPressure.verifiedTensorBytes===spec.bytes&&afterPressure.spill.storedBytes===0,'Cancellation discarded authoritative RAM or published partial storage');
  phase='verified-reacquisition';lease=await store.acquire(spec,{retain:true});const finalSha=await exact(lease,spec);
  requireTest(requests===(mode==='quota'||mode==='io'?2:1),'Unexpected verified refetch count');
  if(mode==='cancel')requireTest(lease.data===initialView,'Cancelled spill changed the authoritative tensor owner');
  const computed=store.snapshot(),storage=sessions.map(session=>({id:session.id,backend:session.backend,capability:session.capability,snapshot:session.snapshot()}));
  if(mode==='normal')requireTest(computed.spill.rehydratedBytes===spec.bytes&&computed.spill.spillReadbackBytes===spec.bytes,'Exact real-storage roundtrip was not fully checked');
  lease.release();lease=null;phase='owned-disposal';const closing=store.dispose();requireTest(store.dispose()===closing,'Owned disposal is not idempotent');await closing;
  const after=await inventory(backend),resource=budget.resourceSnapshot();
  requireTest(JSON.stringify(before)===JSON.stringify(after),'Owned storage inventory differs after disposal');
  requireTest(sessionIds.every(id=>!after.includes(backend==='indexeddb'?'sherloq-temporary-v1-'+id:id)),'Owned session remains after disposal');
  requireTest(sessions.every(session=>session.snapshot().reservedBytes===0),'Owned temporary payload remains after disposal');
  requireTest(budget.total()===0&&budget.resources.operations.size===0&&!budget.recovering,'Budget or resource operation remains after disposal');
  requireTest(Object.values(resource.domains).every(domain=>domain.backings===0),'Owned backing registry is not empty');
  outcome={status:'passed',backend,mode,assetBytes:spec.bytes,windowBytes:WINDOW_BYTES,initialSha256:initialSha,finalSha256:finalSha,exactBytes:true,fetches:requests,recovery:{reclaimedPolicyBytes:reclaimedBytes,wasmBackingReferenceRetirementBytes:backingRetirementsDuringRecovery,retirementIsNotRssOrPhysicalRamMeasurement:true},injections,realStorageIo,afterPressure,computed,storage,cleanup:{sessionIds,inventoryBefore:before,inventoryAfter:after,ownedSessionsAbsent:true,ownedPayloadBytes:0,policyBytes:budget.total(),resource},memory:{initialPolicyLimitBytes:32*MiB,constrainedPolicyLimitBytes:budget.limit,peakPolicyBytes:budget.peak,limitIsSimulation:true,physicalMemoryRefusalInjected:false,comparatorOutsideEngineBudget:true},elapsedFunctionalMs:performance.now()-started};
 }catch(failure){error={code:failure.code??'TEST_FAILED',message:phase+': '+failure.message,stack:failure.stack};}
 finally{lease?.release();try{await store?.dispose();}catch(failure){error??={code:failure.code??'STORAGE_IO',message:'Owned store cleanup: '+failure.message};}for(const session of sessions)try{await session.dispose();}catch(failure){error??={code:failure.code??'STORAGE_IO',message:'Owned session cleanup: '+failure.message};}}
 if(error)throw Object.assign(new Error(error.message),error);return outcome;
}

self.onmessage=async({data})=>{
 try{
  requireTest(data.spec.bytes>0&&data.spec.bytes<=MiB,'Synthetic asset must be bounded to one MiB');const cases=[];
  for(const mode of ['normal','quota','io','cancel']){postMessage({phase:'case',backend:data.backend,mode});const result=await runCase(data.backend,mode,data.spec);cases.push(result);postMessage({phase:'case-complete',backend:data.backend,mode,status:result.status});}
  postMessage({done:true,result:{backend:data.backend,cases,workerContext:{dedicatedWorker:true,crossOriginIsolated,secureContext:isSecureContext,userAgent:navigator.userAgent},scope:'Real desktop Chromium storage APIs; synthetic fixed parameters. Explicit constrained Budget, logical quota, I/O and cancellation injections; no model inference, phone qualification or isolated speed benchmark.'}});
 }catch(error){postMessage({done:true,error:{code:error.code??'TEST_FAILED',message:error.message,stack:error.stack}});}
};
