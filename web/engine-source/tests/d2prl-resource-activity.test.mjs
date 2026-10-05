import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {withD2prlActivity} from '../experiments/d2prl/resource-activity.js';
import {createD2prlModel} from '../experiments/d2prl/model.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';

const MiB=1024**2;
function gate(){let enter,finish;return{entered:new Promise(resolve=>enter=resolve),pending:new Promise(resolve=>finish=resolve),enter:()=>enter(),finish:()=>finish()};}
function live(budget,id,state){const status=budget.resourceProgressSnapshot('peer','policy');assert.ok(status.independentProducers>0);assert.ok(status.operations.some(value=>value.id===id&&value.owner==='d2prl'&&value.state===state),JSON.stringify(status));}
function empty(budget){assert.equal(budget.resources.operations.size,0);assert.equal(budget.recovering,false);assert.equal(budget.total(),0);}
function fixture(){const data=Uint8Array.from({length:64},(_,i)=>i*3),sha256=createHash('sha256').update(data).digest('hex');return{data,spec:{file:'assets/'+sha256+'.bin',sha256,bytes:data.length,dtype:'float32',shape:[16]}};}

test('unscoped recovery null parent creates a root activity without accepting expired tickets',async()=>{
 const budget=new Budget(MiB),hold=gate();
 const pending=withD2prlActivity(budget,'role:hash-init','compute',async()=>{hold.enter();await hold.pending;return 7;},{parent:null});
 await hold.entered;live(budget,'role:hash-init','compute');assert.equal([...budget.resources.operations.values()][0].parent,null);
 hold.finish();assert.equal(await pending,7);empty(budget);
 const parent=budget.beginOperation({owner:'d2prl'});parent.release();
 await assert.rejects(withD2prlActivity(budget,'expired','io',()=>assert.fail('Expired parent dispatched'),{parent}),{code:'INVALID_INPUT'});empty(budget);
});

for(const rejected of [false,true])test(`autonomous initialization retains its ticket until ${rejected?'rejection':'owned success'} settles`,async()=>{
 const budget=new Budget(4*MiB),controller=new AbortController(),hold=gate(),failure=new Error('initialization rejected'),owned={release(){this.released=true;}};
 const pending=withD2prlActivity(budget,'test:module-init','io',async()=>{hold.enter();await hold.pending;if(rejected)throw failure;return owned;});
 await hold.entered;live(budget,'test:module-init','io');controller.abort();await Promise.resolve();live(budget,'test:module-init','io');
 const assertion=rejected?assert.rejects(pending,error=>error===failure):pending.then(value=>assert.equal(value,owned));hold.finish();await assertion;
 assert.equal(owned.released,undefined);empty(budget);
});

test('real D2 model factory is visible during deferred native initialization and releases after failure',async()=>{
 const budget=new Budget(64*MiB),hold=gate(),failure=new Error('native init failed');
 const model={schema:1,side:448,iterations:40,seed:22,referenceThreads:8,checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',features:[],batchnorm:[]};
 const pending=createD2prlModel({budget,model,assetBaseUrl:'https://model/',backend:'cpu',maxWorkers:1,runtime:{convolutionCpuUrl:'https://model/convolution.js',preparationFactory:async()=>{hold.enter();await hold.pending;throw failure;}}});
 const assertion=assert.rejects(pending,error=>error===failure);await hold.entered;live(budget,'d2prl:model-initialization','io');hold.finish();await assertion;empty(budget);
});

for(const cancelled of [false,true])test(`deferred SHA initialization is a productive child until ${cancelled?'cancellation settles':'publication'}`,async()=>{
 const {data,spec}=fixture(),budget=new Budget(64*MiB),controller=new AbortController(),hold=gate();
 const store=createParameterStore({budget,assetBaseUrl:'https://model/',operation:createD2prlRecovery({budget,signal:controller.signal}),hasherFactory:async()=>{hold.enter();await hold.pending;return createSHA256();},fetchAsset:async()=>new Response(data)});
 const pending=store.acquire(spec,{signal:controller.signal});let value;
 try{await hold.entered;live(budget,'parameter:hash-initialization','compute');const child=[...budget.resources.operations.values()].find(record=>record.id==='parameter:hash-initialization');assert.equal(budget.resources.operations.get(child.parent).id,'parameter:hash-create');
  if(cancelled){const assertion=assert.rejects(pending,{code:'CANCELLED'});controller.abort();await Promise.resolve();live(budget,'parameter:hash-initialization','compute');hold.finish();await assertion;assert.equal(store.snapshot().entries,0);}
  else{hold.finish();value=await pending;assert.deepEqual(new Uint8Array(value.data.buffer,value.byteOffset,value.byteLength),data);}
 }finally{hold.finish();await pending.catch(()=>{});value?.release();store.dispose();}empty(budget);
});

for(const stage of ['fetch','read'])for(const cancelled of [false,true])test(`parameter ${stage} remains visible until ${cancelled?'cancelled IO settles':'bytes arrive'}`,async()=>{
 const {data,spec}=fixture(),budget=new Budget(64*MiB),controller=new AbortController(),hold=gate();let reads=0,cancels=0,unlocks=0;
 const reader={async read(){if(reads++>0)return{done:true};if(stage==='read'){hold.enter();await hold.pending;}return{done:false,value:data};},async cancel(){cancels++;},releaseLock(){unlocks++;}};
 const response={status:200,ok:true,body:{getReader:()=>reader}};
 const store=createParameterStore({budget,assetBaseUrl:'https://model/',operation:createD2prlRecovery({budget,signal:controller.signal}),fetchAsset:async()=>{if(stage==='fetch'){hold.enter();await hold.pending;}return response;}});
 const pending=store.acquire(spec,{signal:controller.signal});let value;
 try{await hold.entered;live(budget,'parameter:stream:'+spec.file,'io');
  if(cancelled){const assertion=assert.rejects(pending,{code:'CANCELLED'});controller.abort();await Promise.resolve();live(budget,'parameter:stream:'+spec.file,'io');assert.equal(cancels,0);hold.finish();await assertion;assert.equal(store.snapshot().entries,0);}
  else{hold.finish();value=await pending;assert.deepEqual(new Uint8Array(value.data.buffer,value.byteOffset,value.byteLength),data);}
  assert.equal(cancels,1);assert.equal(unlocks,1);
 }finally{hold.finish();await pending.catch(()=>{});value?.release();store.dispose();}empty(budget);
});
