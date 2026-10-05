import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getSharedReadCache,createSharedReadCacheClient} from '../src/shared-read-cache.js';
assert.equal(typeof global.gc,'function');globalThis.crossOriginIsolated=true;
const MiB=1024**2,tick=()=>new Promise(resolve=>setImmediate(resolve));
const references=descriptor=>({banks:descriptor.banks.flatMap(bank=>[new WeakRef(bank.data),new WeakRef(bank.metadata)]),statistics:[new WeakRef(descriptor.statistics)]});
async function collected(refs){for(let i=0;i<50;i++){await tick();global.gc();await tick();if(refs.every(ref=>ref.deref()===undefined))return true;}return false;}
const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),ownerRefs=references(connection.descriptor);
// Retain both sides of real structured clone envelopes, as field endpoints and
// suspended onmessage handlers do. Each SAB wrapper must become unreachable.
const envelope={cache:structuredClone(connection.descriptor,{transfer:connection.transfer})},parentRefs=references(envelope.cache),parent=createSharedReadCacheClient(envelope.cache),childConnection=parent.exportConnection();
const childOwnerRefs=references(childConnection.descriptor),childEnvelope={cache:structuredClone(childConnection.descriptor,{transfer:childConnection.transfer})},childRefs=references(childEnvelope.cache),child=createSharedReadCacheClient(childEnvelope.cache);
const pressure=budget.beginRecovery();
try{
 const before=manager.snapshot().bytes;assert.ok(before>4*MiB);
 await manager.reclaim({all:true});assert.equal(manager.snapshot().banks,0);assert.equal(budget.total(),32);
 assert.equal(connection.descriptor.banks.length,0);assert.equal(childConnection.descriptor.banks.length,0);assert.equal(envelope.cache.banks.length,0);assert.equal(childEnvelope.cache.banks.length,0);
 const bankRefs=[ownerRefs,parentRefs,childOwnerRefs,childRefs].flatMap(value=>value.banks);
 assert.equal(await collected(bankRefs),true,'Retired data and metadata SAB wrappers still have a strong owner');
 assert.ok(ownerRefs.statistics[0].deref(),'Live readers still own the statistics bank');
 await child.dispose();childConnection.release();await parent.dispose();connection.release();await tick();assert.equal(budget.total(),0);
 assert.equal(await collected([ownerRefs,parentRefs,childOwnerRefs,childRefs].flatMap(value=>value.statistics)),true,'Disposed statistics still have a strong owner');
 console.log(JSON.stringify({retiredBytes:before-32,bankWeakRefsCleared:bankRefs.length,statisticsWeakRefsCleared:4,retainedEnvelopes:4,budgetBytes:budget.total()}));
}finally{await child.dispose();childConnection.release();await parent.dispose();connection.release();pressure();}
