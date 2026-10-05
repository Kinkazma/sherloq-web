import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {runPagedDenseField} from '../src/dense-paged.js';
const MiB=1024**2,assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
self.onmessage=async()=>{
 // This fixture qualifies the explicit graceful migration protocol. Automatic
 // allocation reclaim instead negotiates an already safe boundary (covered by
 // dense-input-migration.test.mjs), so it cannot wait inside another reclaim.
 const reports=[];
 try{
  for(const mode of ['gpu-success','success','io-failure','cancel-migration','completion','tight-idb','pressure-self']){
   const success=!['io-failure','cancel-migration'].includes(mode),tight=mode==='tight-idb';
   const budget=new Budget((tight?80:384)*MiB),session=await createTemporarySession({budget,backend:tight?'indexeddb':'auto'}),width=149,height=127,n=width*height,owned=[],stop=new AbortController();let pendingRecovery,recoveryStarted=false,recoveryCode=null,results=[],reference;
   const migrationSession={backend:session.backend,async create(...args){const candidate=await session.create(...args),flush=candidate.flush?.bind(candidate);candidate.flush=async()=>{await flush?.();if(mode==='io-failure')throw Object.assign(Error('Injected descriptor migration I/O failure'),{code:'STORAGE_IO'});if(mode==='cancel-migration')stop.abort();};return candidate;}};
   try{
    const first=await createSegmentedBytes(n*48,{budget,storage:'memory',shared:true,temporarySession:migrationSession,owner:'patchmatch',label:'test-descriptors'}),mask=await createSegmentedBytes(n,{budget,storage:'memory',shared:true});owned.push(first,mask);
    const floats=Float32Array.from({length:n*12},(_,i)=>Math.fround(((i*17+(i/71|0)*31)%251-125)/125));await first.write(new Uint8Array(floats.buffer));await mask.write(Uint8Array.from({length:n},(_,i)=>i%19?1:0));
    let second=first;if(mode==='gpu-success'){second=await createSegmentedBytes(n*48,{budget,storage:'memory',shared:true});owned.push(second);await second.write(new Uint8Array(Float32Array.from(floats,x=>Math.fround(x+.125)).buffer));}
    const input={first,second,mask,width,height,dimensions:12},options={budget,enableDenseGpu:mode==='gpu-success',iterations:8,minimum:2,radius:41,seed:729,storage:'memory',temporarySession:session};
    reference=await runPagedDenseField(input,options);
    const pool=new DensePagedFieldPool(budget,{maxWorkers:tight?2:4}),seen=[false,false],progress=[new Map(),new Map()],after=[0,0];let migrated=false;
    const observe=index=>p=>{
     const key=[p.stage,p.iteration??''].join(':');if(Number.isFinite(p.completed)){assert(p.completed>=(progress[index].get(key)??0),'Native progress restarted');progress[index].set(key,p.completed);}
     if(migrated)after[index]++;
     if(p.stage==='initialization'&&p.completed>0)seen[index]=true;
     if(!recoveryStarted&&(mode==='completion'?p.stage==='reverse'&&p.iteration===7&&p.completed===p.total:seen.some(Boolean))){
      recoveryStarted=true;const pressure=budget.beginRecovery({kind:'array-buffer',owner:'d2prl',requestedBytes:1});
      pendingRecovery=(async()=>{let cpu;try{let changed;if(mode==='pressure-self'){cpu=await getExecutionScheduler(budget).acquire({cpu:4,minCpu:4,resourceOwner:'test-boundary'});changed=(await budget.reclaimAllocation(1,{kind:'array-buffer',owner:'patchmatch',signal:stop.signal}))>=first.byteLength;}else changed=await first.spillReadOnly({signal:stop.signal});assert(success&&changed,'Expected preserved descriptor backing retirement');migrated=true;}catch(error){recoveryCode=error.code;if(success)throw error;assert(error.code===(mode==='io-failure'?'STORAGE_IO':'CANCELLED'),'Unexpected migration failure');migrated=true;}finally{cpu?.release();pressure();}})();pendingRecovery.catch(()=>{});
     }
    };
    const jobs=[0,1].map(index=>pool.start(input,{...options,onProgress:observe(index)}));assert(jobs.every(Boolean),'Two live fields were not admitted');results=await Promise.all(jobs);await pendingRecovery;assert(recoveryStarted&&(mode==='completion'||after.every(n=>n>0)),'Migration did not happen during both native fields '+JSON.stringify({mode,recoveryStarted,after,seen}));
    for(const result of results){assert(result.comparisons===reference.comparisons,'RNG/comparison history changed');assert(result.metrics.parallel.peakActiveKernels>=(tight?1:2),'Parallel kernel width was lost');for(const key of ['targets','distancesSquared']){const expected=new Uint8Array(reference[key].byteLength),actual=new Uint8Array(expected.length);await reference[key].readInto(expected);await result[key].readInto(actual);assert(equal(expected,actual),key+' changed during '+mode);}}
    assert(first.storage===(success?'temporary':'memory'),'Wrong authoritative backing after migration');
    reports.push({mode,backend:session.backend,compares:String(reference.comparisons),fields:results.length,recoveryCode,afterMigrationProgress:after,peakKernels:results.map(r=>r.metrics.parallel.peakActiveKernels),transports:results.map(r=>r.metrics.inputTransports)});
   }finally{await pendingRecovery?.catch(()=>{});for(const result of results)await result.dispose();await reference?.dispose();for(const store of owned)await store.dispose();await session.dispose();assert(budget.total()===0,'Migration leaked '+budget.total()+' policy bytes');assert(budget.resourceSnapshot().domains['array-buffer'].materializedBytes===0,'Migration leaked registered backing');}
  }
  self.postMessage({result:{isolated:crossOriginIsolated,reports}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
};
