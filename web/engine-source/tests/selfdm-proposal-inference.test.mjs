import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelfDMProposalPrepare,createSelfDMProposalInference} from '../src/selfdm-proposal-inference.js';
import {EngineError} from '../src/errors.js';

const source = {width:512,height:512,format:'rgb8',data:new Uint8Array(512*512*3)};
const model = {id:'qualified-complete-proposal',family:'selfdm-proposal',side:512,kind:'sigmoid',bytes:100,sha256:'a'.repeat(64)};
function fixture({failFirst=false}={}) {
  const calls=[], engines=[]; let loads=0;
  const inference=createSelfDMProposalInference({budget:{},profile:{maxWorkers:10},model,modelUrl:'http://localhost/bundle.json',
    bundleLoader:async()=>{loads++;return {models:{identity:'pinned'},cv:{identity:'pinned'}};},
    engineFactory:image=>{const index=engines.length;let count=0;const engine={image,pool:{slots:[{bytes:100,threadLeases:[()=>{}]}]},cvPools:new Map([['projection',{workers:new Map([['slot',{bytes:50}]])}]]),
      async analyze(_params,hooks){calls.push(['run',index,hooks.models]);if(failFirst&&++count===1)throw new EngineError('ASSET_HTTP','Exact graph download refused',{details:{status:503}});return {raw:new Float32Array(512*512),metrics:{stages:[]},release(){}};},
      async dispose(){await Promise.resolve();calls.push(['disposed',index]);},releaseIdle(){calls.push(['idle',index]);}};engines.push(engine);calls.push(['created',index]);return engine;}
  });return {inference,calls,engines,get loads(){return loads;}};
}
test('complete-pipeline preparation passes the owned source without a duplicate tensor or silent resize',async()=>{
  const prepare=createSelfDMProposalPrepare(),input={...source,side:512};const result=await prepare.run(input);
  assert.equal(result.inferenceInput.data,source.data);assert.equal(result.tensor,undefined);result.release();
  const rectangle={width:640,height:416,side:512,format:'rgb8',data:new Uint8Array(640*416*3)};const prepared=await prepare.run(rectangle);assert.equal(prepared.inferenceInput.data,rectangle.data);assert.equal(prepared.inferenceInput.width,640);prepared.release();
  await assert.rejects(prepare.run({...rectangle,data:new Uint8Array(1)}),error=>error.code==='INVALID_INPUT');
  prepare.dispose();await assert.rejects(prepare.run(input),error=>error.code==='INVALID_INPUT');
});
test('the same immutable source reuses its bundle and checkpoint owner',async()=>{
  const f=fixture();for(let i=0;i<2;i++)(await f.inference.run(source,{sourceKey:'sha/source/roi'})).release();
  assert.equal(f.loads,1);assert.equal(f.engines.length,1);assert.equal(f.inference.residentBytes,100+2*1024**2+50);
  await f.inference.dispose();assert.equal(f.inference.residentBytes,0);
});
test('a new image or ROI disposes the old checkpoint owner before creating the next one',async()=>{
  const f=fixture();(await f.inference.run(source,{sourceKey:'sha/a'})).release();
  (await f.inference.run({...source,data:source.data.slice()},{sourceKey:'sha/b'})).release();
  assert.deepEqual(f.calls.map(v=>v.slice(0,2)),[['created',0],['run',0],['disposed',0],['created',1],['run',1]]);
  assert.equal(f.loads,1);await f.inference.dispose();
});
test('a failed component download preserves the same pipeline owner for explicit resume',async()=>{
  const f=fixture({failFirst:true});await assert.rejects(f.inference.run(source,{sourceKey:'sha/a'}),error=>error.code==='ASSET_HTTP'&&error.details.status===503);
  (await f.inference.run(source,{sourceKey:'sha/a'})).release();assert.equal(f.engines.length,1);assert.equal(f.loads,1);
  await f.inference.dispose();
});
test('identical pixels can resume from a fresh provider without retaining an invalid source window',async()=>{
  let firstAvailable=true,creates=0;const reads=[];
  const inference=createSelfDMProposalInference({budget:{},profile:{maxWorkers:10},model,modelUrl:'http://localhost/bundle.json',bundleLoader:async()=>({models:{},cv:{}}),
    engineFactory:image=>{creates++;return {image,async analyze(){reads.push(await this.image.readRows());return {raw:new Float32Array(512*512),release(){}};},async dispose(){}};}});
  const first={width:512,height:512,format:'rgb8',readRows:async()=>{assert.equal(firstAvailable,true);return 'first';}},second={...first,readRows:async()=> 'second'};
  (await inference.run(first,{sourceKey:'same-sha-and-roi'})).release();firstAvailable=false;
  (await inference.run(second,{sourceKey:'same-sha-and-roi'})).release();assert.deepEqual(reads,['first','second']);assert.equal(creates,1);
  await inference.dispose();
});
