import {test} from 'node:test';
import assert from 'node:assert/strict';
import {truforQueryPlan} from '../src/trufor-query-plan.js';
const block={query:'original',heads:1,querySplitValue:{name:'split',chunkKeys:1024,minKeys:65536}},bytes=256*1024**2;
test('split-value admission bounds padded scores and banks at 96MP geometry',()=>{
 for(const [heads,channels]of [[1,64],[2,128],[5,320],[8,512]]){
  const p=truforQueryPlan({...block,heads},93750,channels,bytes,{gpuAvailable:true});
  assert.equal(p.name,'split');assert.equal(p.paddedKeys,94208);
  assert.ok(p.queries>0);assert.ok(p.workspaceBytes(p.queries)<=93750*channels*16+bytes);
  assert.ok(p.queries*p.paddedKeys*heads*4<128*1024**2);
 }
});
test('original assets, CPU fallback and small key banks retain original query graph',()=>{
 for(const options of [{backend:'cpu',gpuAvailable:true},{gpuAvailable:false},{gpuAvailable:true,cpuOnly:true}])assert.equal(truforQueryPlan(block,93750,64,bytes,options).name,'original');
 assert.equal(truforQueryPlan(block,65535,64,bytes,{gpuAvailable:true}).name,'original');
 assert.equal(truforQueryPlan({query:'original',heads:1},93750,64,bytes,{gpuAvailable:true}).queries,178);
 assert.equal(truforQueryPlan(block,93750,64,1,{gpuAvailable:true}).queries,1);
});
