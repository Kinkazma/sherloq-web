import test from 'node:test';
import assert from 'node:assert/strict';
import {elaBase,elaRender} from '../src/ela.js';
import {toneTable,fusedCpu} from '../src/ela-lut.js';
test('cancelling from the last native base progress callback never publishes a result',async()=>{
 const c=new AbortController();
 await assert.rejects(elaBase(Uint8Array.of(1,2,3),Uint8Array.of(3,2,1),true,{signal:c.signal,onProgress:()=>c.abort()}),{code:'CANCELLED'});
});
test('cancelling from the last native rendering progress callback never publishes a result',async()=>{
 const c=new AbortController();
 await assert.rejects(elaRender(Uint8Array.of(1,2,3),{linear:true},{signal:c.signal,onProgress:()=>c.abort()}),{code:'CANCELLED'});
});
test('a superseded CPU lookup rejects after the asynchronous cooperation boundary',async()=>{
 const c=new AbortController(),params={linear:false,scale:37,contrast:59,grayscale:true},table=await toneTable(params),pending=fusedCpu(Uint8Array.of(1,2,3),Uint8Array.of(3,2,1),params,table,{signal:c.signal});
 c.abort();await assert.rejects(pending,{code:'CANCELLED'});
});
