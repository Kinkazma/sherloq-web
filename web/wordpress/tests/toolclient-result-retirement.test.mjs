import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
// These are actual public-client contracts with controlled cleanup ACKs. No
// graph, model, native map or inference result is claimed by the fixture.
async function fixture(){
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({assetBase:'./',m3:{focal:{controlled:true}}})});
 const attempts=[],owners=new Set(),failures=new Map();let number=0,gate,entered,unloads=0;
 const surface=id=>({id,revision:1,width:4,height:4,format:'rgb8'}),table=id=>({id,revision:1,columns:['value'],rowCount:4,format:'float64-table'});
 const engine={async loadBlob(){return{id:'original',sha256:'a'.repeat(64),surface:surface('source')};},async loadM3Models(){},
  async run(task){const id='result-'+(++number),view=surface(id),mask=surface(id+'-mask'),values=table(id+'-table');for(const d of[view,mask,values])owners.add(d.id);return{id:task.id,operation:task.operation,surface:view,sourceRegionSourceSurface:surface('source'),data:{map:new Float32Array(4).fill(.5),metadata:{method:'focal',native_shape:[2,2]}},maskSurfaces:{scope:mask},tables:{values}};},
  async releaseSurface(id){attempts.push(id);if(gate&&id==='result-1'){entered.resolve();await gate.promise;}if(failures.has(id)){const e=failures.get(id);failures.delete(id);throw e;}assert(owners.delete(id),'A successful handle must not be retired twice: '+id);},
  async releaseTable(id){attempts.push(id);if(failures.has(id)){const e=failures.get(id);failures.delete(id);throw e;}assert(owners.delete(id),'A successful table must not be retired twice');},async unload(){unloads++;owners.clear();},async dispose(){owners.clear();}};
 const client=await createToolClient({engineFactory:()=>engine});await client.load({id:'original',blob:new Blob([Uint8Array.of(1)])});const task={id:'focal',operation:'ai.localization.focal',params:{},backend:'cpu'};
 return{client,task,attempts,owners,fail(id,e){failures.set(id,e);},pause(){gate=deferred();entered=deferred();return{entered:entered.promise,resume(){gate.resolve();}};},get runs(){return number;},get unloads(){return unloads;},async close(){try{await client.dispose();}finally{globalThis.fetch=oldFetch;}}};
}
test('public non-M2 result retirement retries only failed handles and keeps a frozen cause',async()=>{
 const h=await fixture();try{await h.client.run(h.task);const error=Object.freeze(Object.assign(new Error('ACK failed'),{code:'STORAGE_IO'}));h.fail('result-1',error);await assert.rejects(h.client.release(),e=>e===error);
  assert.deepEqual(h.attempts,['result-1','result-1-mask','result-1-table']);assert.deepEqual([...h.owners],['result-1']);await h.client.release();assert.deepEqual(h.attempts,['result-1','result-1-mask','result-1-table','result-1']);assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
test('concurrent public release calls share one cleanup attempt and one rejection',async()=>{
 const h=await fixture();try{await h.client.run(h.task);const error=Object.freeze(new Error('one ACK attempt')),pause=h.pause();h.fail('result-1',error);const a=h.client.release(),b=h.client.release();const same=a===b;const answers=Promise.allSettled([a,b]);await pause.entered;pause.resume();const results=await answers;assert.equal(same,true);assert(results.every(v=>v.status==='rejected'&&v.reason===error));assert.equal(h.attempts.filter(x=>x==='result-1').length,1);await h.client.release();assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
test('failed table and surface ACKs are all attempted without replacing the first error',async()=>{
 const h=await fixture();try{await h.client.run(h.task);const first=Object.freeze(new Error('surface failure')),second=new Error('table failure');h.fail('result-1-mask',first);h.fail('result-1-table',second);await assert.rejects(h.client.release(),e=>e===first);assert.deepEqual([...h.owners],['result-1-mask','result-1-table']);await h.client.release();assert.equal(h.owners.size,0);assert.equal(h.attempts.filter(x=>x==='result-1').length,1);
 }finally{await h.close();}
});
test('a new calculation cannot replace the old result until every retirement ACK succeeds',async()=>{
 const h=await fixture();try{await h.client.run(h.task);h.fail('result-1-mask',new Error('mask ACK'));await assert.rejects(h.client.run({...h.task,id:'replacement'}),/mask ACK/);assert.equal(h.runs,1);await h.client.run({...h.task,id:'replacement'});assert.equal(h.runs,2);assert.deepEqual([...h.owners],['result-2','result-2-mask','result-2-table']);await h.client.release();assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
test('a source replacement retries previous cleanup before unloading Original',async()=>{
 const h=await fixture();try{await h.client.run(h.task);h.fail('result-1',new Error('source ACK'));await assert.rejects(h.client.load({blob:new Blob([Uint8Array.of(2)])}),/source ACK/);assert.equal(h.unloads,0);await h.client.load({blob:new Blob([Uint8Array.of(2)])});assert.equal(h.unloads,1);assert.equal(h.attempts.filter(id=>id==='result-1').length,2);assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
test('successful repeated release has no duplicate handle retirement',async()=>{
 const h=await fixture();try{await h.client.run(h.task);await h.client.release();await h.client.release();assert.equal(h.attempts.length,3);assert.equal(h.owners.size,0);}finally{await h.close();}
});

test('a replacement queued behind cleanup keeps its new result after the old ACK',async()=>{
 const h=await fixture();try{await h.client.run(h.task);const pause=h.pause(),old=h.client.release();await pause.entered;const next=h.client.run({...h.task,id:'next'});pause.resume();await old;const output=await next;assert.equal(output.surface.id,'result-2');assert.equal(h.runs,2);await h.client.release();assert.equal(h.owners.size,0);assert.equal(h.attempts.filter(x=>x==='result-2').length,1);
 }finally{await h.close();}
});
test('retained presentation cannot borrow partially retired handles after an ACK error',async()=>{
 const h=await fixture();try{await h.client.run(h.task);h.fail('result-1',new Error('retry pending'));await assert.rejects(h.client.release(),/retry pending/);const view=await h.client.updateRetainedParameters({operation:'ai.localization.focal',params:{},view:{mode:'map'}});assert.equal(view,null);await h.client.release();assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
test('extensible first cleanup cause may record subsequent ACK failures without being replaced',async()=>{
 const h=await fixture();try{await h.client.run(h.task);const primary=new Error('primary'),secondary=new Error('secondary');h.fail('result-1',primary);h.fail('result-1-table',secondary);await assert.rejects(h.client.release(),e=>e===primary);assert.deepEqual(primary.cleanupErrors,[secondary]);await h.client.release();assert.equal(h.owners.size,0);
 }finally{await h.close();}
});
