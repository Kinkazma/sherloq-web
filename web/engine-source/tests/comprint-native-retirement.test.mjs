import test from 'node:test';
import assert from 'node:assert/strict';
import {runComprintFingerprintSource} from '../../extensions-source/comprint-inference.js';
import {Budget} from '../src/cache.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
for(const target of['source-window','network-output'])test('Comprint waits for '+target+' retirement ACK before returning or reusing owners',async()=>{
 const gate=deferred(),entered=deferred(),budget=new Budget(8*1024**2),caller=budget.reserve(8*8*8);let finished=false,retired=false,result;
 const source={width:8,height:8,async readWindow(){return{pixels:{width:8,height:8,format:'rgb8',data:new Uint8Array(8*8*3)},async release(){if(target==='source-window'){entered.resolve();await gate.promise;retired=true;}}};}};
 const infer=async()=>({'Identity:0':{data:new Float32Array(64)},async release(){if(target==='network-output'){entered.resolve();await gate.promise;retired=true;}}});
 const work=runComprintFingerprintSource(source,{infer,concurrency:1,budget}).then(value=>{result=value;return value;}).finally(()=>finished=true);
 try{await entered.promise;await new Promise(r=>setTimeout(r,0));assert.equal(finished,false);assert.equal(retired,false);gate.resolve();await work;assert.equal(retired,true);assert.equal(finished,true);assert.equal(result.data.length,64);}finally{gate.resolve();await work.catch(()=>{});result?.release();caller();assert.equal(budget.active,0);}
});
