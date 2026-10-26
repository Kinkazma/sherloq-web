import test from 'node:test';
import assert from 'node:assert/strict';
import {runComprintNativeContexts} from '../../extensions-source/comprint-native-contexts.js';
import {SharedMemo} from '../../extensions-source/shared-memo.js';
import {Budget} from '../src/cache.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const digest=async()=> 'a'.repeat(64);
const context=(x=0)=>({x,y:0,width:100,height:100,originalBounds:[x,0,x+100,100],async readWindow(r){return{pixels:{width:r.width,height:r.height,format:'rgb8',data:new Uint8Array(r.width*r.height*3).fill(90)},async release(){}};}});
test('whole controlled Comprint driver preserves one global population and zero-filled gaps never become RGB observations',async()=>{
 const budget=new Budget(32*1024**2),source={width:240,height:100,comprintNativeContexts:[context(0),context(140)],readWindow(){throw Error('must not read a synthetic envelope');}};let modelCalls=0,statisticsCalls=0,result;
 try{result=await runComprintNativeContexts(source,{budget,digest,infer:async(_,feeds)=>{modelCalls++;return{'Identity:0':{data:Float32Array.from(feeds.luminance_normalized.data,(_,i)=>Math.sin(i))},async release(){}};},analyzeContexts:async(values)=>{statisticsCalls++;assert.equal(values.length,2);assert(values.every(c=>c.fingerprint instanceof Float32Array&&c.luminance instanceof Float32Array));return{outputs:{map:{data:Float64Array.of(11,23)},valid:{data:Uint8Array.of(1,1)}},metadata:{native_context_grids:values.map((c,index)=>({index,width:c.width,height:c.height,start:index,cells:1,rows:1,columns:1}))}};}});assert.equal(modelCalls,2);assert.equal(statisticsCalls,1);assert.equal(result.anomaly.data[0],11);assert.equal(result.anomaly.data[140],23);assert(Number.isNaN(result.anomaly.data[110]));assert.equal(result.nativeContexts.length,2);}finally{result?.release();assert.equal(budget.active,0);}
});
test('cancelled statistics subscriber cannot retire fingerprints still used by the actual shared producer',async()=>{
 const budget=new Budget(32*1024**2),memo=new SharedMemo(budget),abort=new AbortController(),scope=memo.scope('controlled-comprint',{signal:abort.signal}),entered=deferred(),gate=deferred(),producerDone=deferred();let held;
 const work=runComprintNativeContexts({width:100,height:100,comprintNativeContexts:[context()]},{budget,signal:abort.signal,digest,memoStatistics:(key,fn)=>scope.get(key,fn),infer:async(_,feeds)=>({'Identity:0':{data:Float32Array.from(feeds.luminance_normalized.data,(_,i)=>Math.sin(i))}}),analyzeContexts:async(values,{signal})=>{held=values;entered.resolve();try{await gate.promise;assert(held[0].fingerprint instanceof Float32Array);if(signal.aborted)throw signal.reason;}finally{producerDone.resolve();}}});
 try{await entered.promise;abort.abort();await assert.rejects(work,{name:'AbortError'});assert(budget.active>0,'The actual pending statistics producer still owns its fingerprint workspace');assert(held[0].fingerprint instanceof Float32Array);gate.resolve();await producerDone.promise;for(let i=0;i<8;i++)await Promise.resolve();assert.equal(budget.active,0);assert.equal(held[0].fingerprint,null);}finally{gate.resolve();await work.catch(()=>{});scope.release();memo.dispose();}
});
