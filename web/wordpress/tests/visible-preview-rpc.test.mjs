import test from 'node:test';
import assert from 'node:assert/strict';
import {visiblePreviewRPC} from '../sherloq-browser/assets/visible-preview-rpc.js';

function fixture(){
 const sent=[],otherSent=[],worker={postMessage:value=>sent.push(value)},other={postMessage:value=>otherSent.push(value)},pending=new Map();let current=worker,id=0;
 return{sent,otherSent,worker,other,pending,replace(){current=other;},context:{worker,currentWorker:()=>current,pending,nextId:()=>++id,options:()=>({memoryBudgetBytes:64*1024**2})}};
}
const drain=async()=>{for(let n=0;n<5;n++)await Promise.resolve();};

test('optional RPC abort waits for the same worker terminal ACK',async()=>{
 const h=fixture(),stop=new AbortController();let settled=false;const promise=visiblePreviewRPC(h.context,'prepare-visible-preview',{sourceSha256:'source'},{signal:stop.signal});const rejection=assert.rejects(promise,{code:'CANCELLED'}).finally(()=>settled=true);
 assert.equal(h.pending.size,1);const [{id}]=h.sent;assert.equal(h.pending.get(id).provisionalPreview,true);stop.abort();stop.abort();await drain();assert.equal(settled,false);assert.equal(h.pending.size,1);assert.deepEqual(h.sent.map(value=>value.action),['prepare-visible-preview','cancel-preview']);assert.equal(h.sent[1].id,id);
 const entry=h.pending.get(id);h.pending.delete(id);entry.reject(Object.assign(Error('Worker retirement acknowledged'),{code:'CANCELLED'}));await rejection;assert.equal(h.pending.size,0);assert.equal(h.otherSent.length,0);assert.equal(h.sent.length,2);
});
test('a replaced captured worker sends neither preparation nor park to its replacement',async()=>{
 const h=fixture();h.replace();for(const action of ['prepare-visible-preview','park-visible-preview'])assert.deepEqual(await visiblePreviewRPC(h.context,action,{sourceKey:'old-source'}),{prepared:false,parked:true,reason:'worker-retired'});
 assert.equal(h.sent.length,0);assert.equal(h.otherSent.length,0);assert.equal(h.pending.size,0);
});
test('synchronous command posting failure removes pending and its abort listener',async()=>{
 const h=fixture(),stop=new AbortController(),failure=Error('Posting failed');h.worker.postMessage=()=>{throw failure;};await assert.rejects(visiblePreviewRPC(h.context,'prepare-visible-preview',{}, {signal:stop.signal}),error=>error===failure);assert.equal(h.pending.size,0);
 h.worker.postMessage=value=>h.sent.push(value);stop.abort();await drain();assert.equal(h.sent.length,0);assert.equal(h.otherSent.length,0);
});
