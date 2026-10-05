import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError,resourceAllocationKind} from '../src/errors.js';
import {runWithResourceRecovery,reclaimForResourceRecovery} from '../src/resource-recovery.js';
const MiB=1024**2,gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

test('ArrayBuffer refusal retires the optional backing before idle Wasm credit and waits for ownership ACK',async()=>{
 const budget=new Budget(256*MiB),cache=budget.reserve(64*MiB),wasm=budget.reserve(64*MiB),entered=gate(),ack=gate(),events=[],reports=[];let backing=true,calls=0,wasmReclaims=0;
 const idle=budget.registerReclaimer(()=>{wasmReclaims++;wasm();});
 const optional=budget.registerAsyncReclaimer(async request=>{assert.equal(request.all,true);assert.equal(request.allocationKind,'array-buffer');assert.equal(budget.recovering,true);entered.resolve();await ack.promise;backing=false;cache();return 64*MiB;},{allocationKind:'array-buffer',priority:100,discardOnAllocationFailure:true});
 const work=runWithResourceRecovery(async()=>{calls++;if(backing){const error=new RangeError('Array buffer allocation failed');error.details={requestedBytes:10*MiB};throw error;}assert.equal(budget.recovering,true);return 17;},{budget,onRecovery:event=>events.push(structuredClone(event)),onReclaim:event=>reports.push(structuredClone(event))});
 try{await entered.promise;assert.equal(calls,1);assert.equal(budget.total(),128*MiB,'Owner is charged while another worker still holds the bank');assert.equal(wasmReclaims,0);ack.resolve();assert.equal(await work,17);assert.equal(calls,2);assert.equal(wasmReclaims,0);assert.equal(budget.total(),64*MiB);assert.equal(budget.recovering,false);assert.equal(budget.limit,256*MiB);assert.deepEqual(reports.at(-1).reclamation,{kind:'array-buffer',requestedBytes:10*MiB,targetedReleasedBytes:64*MiB,otherAccountedBytes:0,ownersVisited:1,completed:true,owners:[{owner:null,label:'',kind:'array-buffer',retiredBytes:64*MiB,accountedBytes:64*MiB}]});assert.equal(events.length,1,'One refusal produces one recovery notification');assert.equal(reports.length,1);assert.equal(reports[0].phase,'resource-reclaimed');assert.ok(Object.values(budget.snapshot()).every(value=>typeof value==='number')); }
 finally{ack.resolve();await work.catch(()=>{});optional();idle();cache();wasm();}assert.equal(budget.total(),0);
});

test('cold owners of the same backing domain precede unrelated accounting reclamation',async()=>{
 const budget=new Budget(100),cold=budget.reserve(40),wasm=budget.reserve(40),calls=[];
 const ordinary=budget.registerReclaimer(()=>{calls.push('wasm');wasm();});
 const stored=budget.registerAsyncReclaimer(async()=>{calls.push('stored');cold();return 40;},{allocationKind:'array-buffer'});
 assert.equal(await budget.reclaimAllocation(30,{kind:'array-buffer'}),40);assert.deepEqual(calls,['stored']);assert.equal(budget.total(),40);stored();ordinary();wasm();assert.equal(budget.total(),0);
});

test('logical MEMORY_LIMIT keeps ordinary admission reclamation and preserves optional cache',async()=>{
 const budget=new Budget(100),cache=budget.reserve(40),wasm=budget.reserve(40);let targeted=0;
 const ordinary=budget.registerReclaimer(()=>wasm()),optional=budget.registerAsyncReclaimer(async()=>{targeted++;cache();return 40;},{allocationKind:'array-buffer',priority:100,discardOnAllocationFailure:true});
 const error=new EngineError('MEMORY_LIMIT','Admission refused',{details:{requestedBytes:20}});
 assert.equal(await reclaimForResourceRecovery(budget,error),0,'The available twenty bytes already satisfy this admission');assert.equal(budget.total(),80);
 assert.equal(await reclaimForResourceRecovery(budget,new EngineError('MEMORY_LIMIT','Admission refused',{details:{requestedBytes:30}})),40);assert.equal(targeted,0);assert.equal(budget.lastAllocationReclaim,null);optional();ordinary();cache();assert.equal(budget.total(),0);
});

test('allocation kind is explicit and GPU or Wasm faults are never tagged as ArrayBuffer pressure',async()=>{
 assert.equal(resourceAllocationKind(new RangeError('Array buffer allocation failed')),'array-buffer');
 assert.equal(resourceAllocationKind(new RangeError('WebAssembly.Memory(): could not allocate memory')),'wasm');
 assert.equal(resourceAllocationKind(new EngineError('GPU_OUT_OF_MEMORY','GPU buffer refused',{cause:new RangeError('Array buffer allocation failed')})),'gpu');
 assert.equal(resourceAllocationKind(new EngineError('MEMORY_LIMIT','Array buffer allocation failed')),null);
 assert.equal(resourceAllocationKind(new RangeError('Invalid typed array length: -1')),null);
 const budget=new Budget(100),cache=budget.reserve(40),wasm=budget.reserve(40);let cacheCalled=0;
 const ordinary=budget.registerReclaimer(()=>wasm()),optional=budget.registerAsyncReclaimer(async()=>{cacheCalled++;cache();return 40;},{allocationKind:'array-buffer',priority:100,discardOnAllocationFailure:true});
 await budget.reclaimAllocation(20,{kind:'wasm'});assert.equal(cacheCalled,0);assert.equal(budget.lastAllocationReclaim.kind,'wasm');assert.equal(budget.snapshot().allocationTargetedReleasedBytes,0);assert.equal(budget.snapshot().allocationOtherAccountedBytes,40);optional();ordinary();cache();assert.equal(budget.total(),0);
});

test('cancellation during ownership retirement never publishes premature backing credit or retries useful allocation',async()=>{
 const budget=new Budget(100),cache=budget.reserve(40),entered=gate(),ack=gate(),stop=new AbortController();let calls=0;
 const unregister=budget.registerAsyncReclaimer(async()=>{entered.resolve();await ack.promise;cache();return 40;},{allocationKind:'array-buffer',discardOnAllocationFailure:true});
 const work=runWithResourceRecovery(async()=>{calls++;throw new RangeError('Array buffer allocation failed');},{budget,signal:stop.signal});const rejected=assert.rejects(work,{code:'CANCELLED'});
 await entered.promise;stop.abort();assert.equal(budget.total(),40);assert.equal(budget.recovering,true);ack.resolve();await rejected;assert.equal(calls,1);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);assert.equal(budget.lastAllocationReclaim.completed,false);unregister();
});

test('serialized allocation reclaims report their own domain and ownership result',async()=>{
 const budget=new Budget(100),array=budget.reserve(30),gpu=budget.reserve(20),reports=[];
 const first=budget.registerAsyncReclaimer(async()=>{array();return 30;},{allocationKind:'array-buffer'}),second=budget.registerAsyncReclaimer(async()=>{gpu();return 20;},{allocationKind:'gpu'});
 assert.deepEqual(await Promise.all([budget.reclaimAllocation(12,{kind:'array-buffer',onReclaim:report=>reports.push(structuredClone(report))}),budget.reclaimAllocation(15,{kind:'gpu',onReclaim:report=>reports.push(structuredClone(report))})]),[30,20]);
 assert.deepEqual(reports.map(r=>[r.kind,r.requestedBytes,r.targetedReleasedBytes]),[['array-buffer',12,30],['gpu',15,20]]);assert.equal(budget.total(),0);first();second();
});

test('unrelated idle WASM credits never authorize an ArrayBuffer allocation retry',async()=>{
 const budget=new Budget(100),held=budget.reserve(40),remove=budget.registerReclaimer(()=>held());let report;
 try{assert.equal(await budget.reclaimAllocation(20,{kind:'array-buffer',onReclaim:value=>{report=value;}}),0);assert.equal(report.targetedReleasedBytes,0);assert.equal(report.otherAccountedBytes,40);assert.equal(budget.backingReleased.get('array-buffer')??0,0);}finally{remove();held();}assert.equal(budget.total(),0);
});

test('published typed-array aliases keep one physical backing until the final owner retires',async()=>{
 const {allocateOwnedTypedArray,registerArrayViews}=await import('../src/allocation.js'),budget=new Budget(4096),first=allocateOwnedTypedArray(Float64Array,64,{budget,owner:'ela',label:'producer'}),published=registerArrayViews(budget,{curves:first.data},{owner:'ela',label:'checkpoint'});
 assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,512);first.release();assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,512);assert.equal(budget.backingReleased.get('array-buffer')??0,0);published();assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);assert.equal(budget.backingReleased.get('array-buffer'),512);published();assert.equal(budget.backingReleased.get('array-buffer'),512);assert.equal(budget.total(),0);
});
