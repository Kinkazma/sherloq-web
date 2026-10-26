import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createStrictSparseNativeFeatures} from '../src/sparse-strict-native-features.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function failure(promise){try{await promise;}catch(error){return{failed:true,error};}return{failed:false};}
async function fixture(factory,{readWindow}={}){
 const budget=new Budget(128*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:'d'.repeat(64),width:8,height:8}),domain=await compileOriginalSourceRegions(state.snapshot());
 const source={sha256:domain.sourceSha256,descriptor:{format:'rgb8',width:8,height:8},async readWindow(rect){if(readWindow)return readWindow(rect);const free=budget.reserve(rect.width*rect.height*3);return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3)},release:free};}};
 let creations=0;const owner=createStrictSparseNativeFeatures({budget,profile:{maxWorkers:2},nativeFactory(){creations++;return factory({budget,creations});}});
 const context={source,candidateDomain:domain,contextDomain:domain,origin:[0,0],width:8,height:8};return{budget,owner,context,get creations(){return creations;},run(){return owner.extract(context,{family:'ORB',limit:100});}};
}
function bank(budget,release){const free=budget.reserve(1024);return{points:new Float64Array([4,4,1,0,1,0,0]),descriptors:new Uint8Array(32),members:new Uint8Array([1]),descriptorSize:32,totalFeatures:1,metadata:{provider:'cpu',workers:1},release:release?()=>{const answer=release();if(answer&&typeof answer.then==='function')return answer.then(free);free();return answer;}:free};}
for(const primary of [false,0,'',null,undefined,Object.freeze(new Error('frozen calculation'))])test('native calculation preserves exact primary '+String(primary)+' through failed independent cleanup',async()=>{
 const cleanup=Object.freeze(new Error('dispose failed')),h=await fixture(()=>({async extract(){throw primary;},async dispose(){throw cleanup;}}));
 const answer=await failure(h.run());assert.equal(answer.failed,true);assert.equal(answer.error,primary);await failure(h.owner.dispose());
});
test('failed native result ACK remains owned and retryable through parent disposal',async()=>{
 let releases=0;const ack=Object.freeze(new Error('result ACK refused')),h=await fixture(({budget})=>({async extract(){return bank(budget,()=>{if(++releases===1)throw ack;});},async dispose(){}}));
 const answer=await failure(h.run());assert.equal(answer.failed,true);assert.equal(answer.error,ack);assert.ok(h.budget.total()>0);await h.owner.dispose();assert.equal(releases,2);
 assert.equal(h.budget.total(),0);
});
test('a later request cannot open another native owner before old output ACK settles',async()=>{
 const retry=deferred(),entered=deferred();let releases=0;const ack=new Error('retry output ACK');
 const h=await fixture(({budget,creations})=>({async extract(){if(creations===1){return bank(budget,()=>{releases++;if(releases===1)throw ack;entered.resolve();return retry.promise;});}return bank(budget);},async dispose(){}}));
 assert.equal((await failure(h.run())).error,ack);const next=h.run();await Promise.race([entered.promise,new Promise(resolve=>setTimeout(resolve,50))]);assert.equal(h.creations,1,'new native factory crossed unresolved old ACK');retry.resolve();const result=await next;result.release();await h.owner.dispose();
});
test('concurrent parent disposal coalesces an in-flight native disposal ACK',async()=>{
 const entered=deferred(),ack=deferred();let calls=0;const h=await fixture(({budget})=>({async extract(){return bank(budget);},dispose(){calls++;entered.resolve();return ack.promise;}}));
 const extraction=failure(h.run());await entered.promise;const a=h.owner.dispose(),b=h.owner.dispose();await Promise.resolve();await Promise.resolve();assert.equal(calls,1,'same native disposal was started concurrently');ack.resolve();const answer=await extraction;assert.equal(answer.failed,true);assert.ok(['CANCELLED','DISPOSED'].includes(answer.error?.code));await Promise.all([a,b]);assert.equal(h.budget.total(),0);
});
test('successful native feature fields and result lifetime remain unchanged',async()=>{
 const h=await fixture(({budget})=>({async extract(rows){const read=await rows.readRows(0,8);assert.equal(read.pixels.data.length,192);read.release();return bank(budget);},async dispose(){}}));
 const result=await h.run();assert.deepEqual([...result.points],[4,4,1,0,1,0,0]);assert.equal(result.descriptors.length,32);assert.deepEqual([...result.members],[1]);assert.ok(h.budget.total()>0);result.release();await h.owner.dispose();assert.equal(h.budget.total(),0);
});
test('a failed native destructor remains retained until a later parent retry acknowledges it',async()=>{
 let calls=0;const ack=Object.freeze(new Error('native destructor ACK'));
 const h=await fixture(({budget})=>({async extract(){return bank(budget);},dispose(){if(++calls<=2)throw ack;}}));
 const answer=await failure(h.run());assert.equal(answer.failed,true);assert.equal(answer.error,ack);assert.ok(h.budget.total()>0,'request metadata was freed under a refused native owner');await h.owner.dispose();assert.equal(calls,3);assert.equal(h.budget.total(),0);
});
test('falsy row failure is preserved when the input-window release also refuses its ACK',async()=>{
 let releases=0;const primary=false,ack=Object.freeze(new Error('source release refused'));
 const h=await fixture(()=>({async extract(rows){await rows.readRows(0,8);throw Error('unreachable');},dispose(){}}),{readWindow:async rect=>({pixels:{format:'rgb8',width:rect.width,height:rect.height,get data(){throw primary;}},release(){releases++;if(releases===1)throw ack;}})});
 const answer=await failure(h.run());assert.equal(answer.failed,true);assert.equal(answer.error,primary);await h.owner.dispose();assert.equal(releases,2);assert.equal(h.budget.total(),0);
});
test('a late output cannot publish after disposal while its native source read is still pending',async()=>{
 const entered=deferred(),read=deferred();let sourceReleases=0;
 const h=await fixture(({budget})=>({async extract(rows){const result=await rows.readRows(0,8);result.release();return bank(budget);},dispose(){}}),{readWindow:async rect=>{entered.resolve();await read.promise;return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3)},release(){sourceReleases++;}};}});
 const extraction=failure(h.run());await entered.promise;let disposed=false;const disposal=h.owner.dispose().then(()=>{disposed=true;});await Promise.resolve();assert.equal(disposed,false);read.resolve();const answer=await extraction;assert.equal(answer.failed,true);assert.ok(['CANCELLED','DISPOSED'].includes(answer.error?.code));await disposal;assert.equal(sourceReleases,1);assert.equal(h.budget.total(),0);
});
test('an output ACK retains its source view until the dependent retirement actually succeeds',async()=>{
 let calls=0;const ack=Object.freeze(new Error('dependent output ACK'));
 const h=await fixture(({budget})=>({async extract(rows){return bank(budget,async()=>{const window=await rows.readRows(0,1);assert.equal(window.pixels.data.length,24);window.release();if(++calls===1)throw ack;});},dispose(){}}));
 const answer=await failure(h.run());assert.equal(answer.failed,true);assert.equal(answer.error,ack,'source view was retired ahead of its dependent output');assert.ok(h.budget.total()>0);await h.owner.dispose();assert.equal(calls,2);assert.equal(h.budget.total(),0);
});
