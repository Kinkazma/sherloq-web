import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ritaSourceTensors} from '../src/rita-source-tensors.js';
const gate=()=>{let resolve,reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b;}),resolve,reject};};

test('RITA cancellation during the Original-window ACK prevents normalized-row publication',async()=>{
 const budget=new Budget(1024**2),ack=gate(),entered=gate(),controller=new AbortController();let published;
 const source=ritaSourceTensors({width:1,height:1,async readWindow(){return{pixels:{data:Uint8Array.of(1,2,3)},release(){entered.resolve();return ack.promise;}};}},{budget});
 const pending=source.rgb.readRows(0,1,{signal:controller.signal}).then(value=>{published=value;return value;});
 await entered.promise;controller.abort();ack.resolve();
 try{await assert.rejects(pending,error=>error.code==='CANCELLED');}finally{published?.release();}
 assert.equal(published,undefined);assert.equal(budget.total(),0);
});

test('RITA preserves a frozen normalization error when cancellation and source ACK failure coincide',async()=>{
 const budget=new Budget(1024**2),ack=gate(),entered=gate(),controller=new AbortController();
 const primary=Object.freeze(Object.assign(Error('controlled normalization failure'),{code:'CONTROLLED_PRIMARY'})),secondary=Object.freeze(Error('controlled source retirement failure'));
 const data=new Proxy(Uint8Array.of(1,2,3),{get(target,key){if(key==='length')return 3;if(key==='0')throw primary;return Reflect.get(target,key,target);}});
 const source=ritaSourceTensors({width:1,height:1,async readWindow(){return{pixels:{data},release(){entered.resolve();return ack.promise;}};}},{budget});
 const pending=source.rgb.readRows(0,1,{signal:controller.signal});
 await entered.promise;controller.abort();ack.reject(secondary);
 await assert.rejects(pending,error=>error===primary&&Object.isFrozen(error));assert.equal(budget.total(),0);
});
