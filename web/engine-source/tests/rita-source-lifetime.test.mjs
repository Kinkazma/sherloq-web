import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ritaSourceTensors} from '../src/rita-source-tensors.js';
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:()=>resolve()};};

test('native RITA normalized rows wait for the asynchronous Original-window acknowledgement',async()=>{
 const budget=new Budget(1024**2),gate=deferred(),entered=deferred();let published=false;const input={surface:{descriptor:{width:2,height:2},async readWindow(rect){return{pixels:{data:new Uint8Array(rect.width*rect.height*3)},release(){entered.resolve();return gate.promise;}};}}},source=ritaSourceTensors(input,{budget}),reading=source.rgb.readRows(0,1).then(x=>{published=true;return x;});await entered.promise;await Promise.resolve();const before=published;gate.resolve();const part=await reading;part.release();assert.equal(before,false,'Normalized output was published before its source-window acknowledgement');assert.equal(budget.total(),0);
});
test('failed source acknowledgement is surfaced without orphaning normalized-row credits',async()=>{
 const budget=new Budget(1024**2),failure=Object.assign(Error('source ACK failed'),{code:'STORAGE_IO'}),ack=Promise.reject(failure);ack.catch(()=>{});const source=ritaSourceTensors({surface:{descriptor:{width:2,height:2},async readWindow(rect){return{pixels:{data:new Uint8Array(rect.width*rect.height*3)},release:()=>ack};}}},{budget});let part;try{await assert.rejects(source.rgb.readRows(0,1).then(v=>part=v),e=>e===failure);}finally{part?.release();}assert.equal(budget.total(),0);
});
test('primary cancellation is preserved when the source acknowledgement also fails',async()=>{
 const budget=new Budget(1024**2),controller=new AbortController(),failure=Object.assign(Error('source ACK failed'),{code:'STORAGE_IO'}),ack=Promise.reject(failure);ack.catch(()=>{});const source=ritaSourceTensors({surface:{descriptor:{width:2,height:2},async readWindow(rect){controller.abort();return{pixels:{data:new Uint8Array(rect.width*rect.height*3)},release:()=>ack};}}},{budget});await assert.rejects(source.rgb.readRows(0,1,{signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(budget.total(),0);
});
