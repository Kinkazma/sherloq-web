import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks');

test('an explicit CPU request prevents paged GPU admission while automatic and GPU requests keep the configured route',
 {skip:!enabled&&'Run with --experimental-test-module-mocks for the actual paged controller policy'},async t=>{
  const bytes={byteLength:16,readInto(out){out.fill(1);}},settings=[],
    jobs=[{crop:{x:0,y:0},width:4,height:4,pass:{method:0,patch:2,targetPatch:2,reflection:false},eligibility:{},options:{},context:{id:0}}];
  t.mock.module('../src/dense-image.js',{namedExports:{denseImageParams:input=>({coherence:true,patch:2,limit:3,...input}),denseImageJobs:()=>({jobs,plan:{},contexts:[{}],policy:{}})}});
  t.mock.module('../src/dense-paged-zernike.js',{namedExports:{preparePagedZernike:async()=>({first:bytes,dispose(){}})}});
  t.mock.module('../src/dense-paged-regions.js',{namedExports:{preparePagedEligibility:async()=>({mask:bytes,width:4,height:4,dimensions:12,dispose(){}})}});
  t.mock.module('../src/dense-paged-field-pool.js',{namedExports:{DensePagedFieldPool:class{
    constructor(){this.jobs=0;this.peakWorkers=1;}
    start(input,options){this.jobs++;settings.push(options.enableDenseGpu);return Promise.resolve({width:4,height:4,targets:bytes,distancesSquared:bytes,allowed:input.mask,ownsAllowed:false,dispose(){}});}
    async drain(){}
  }}});
  t.mock.module('../src/dense-cold-field.js',{namedExports:{storeColdDenseField:async field=>field}});
  t.mock.module('../src/dense-paged-coherence.js',{namedExports:{runPagedDenseCoherence:async()=>({selected:bytes,dispose(){}})}});
  t.mock.module('../src/dense-paged-links.js',{namedExports:{samplePagedDenseLinks:async()=>({count:0,total:0,denseCount:0,rows:bytes,dispose(){}})}});
  const {PagedDenseImageEngine}=await import('../src/dense-paged-image.js?backend-policy');
  for(const [backend,enabledGpu,expected]of [['cpu',true,false],['auto',true,true],['webgpu',true,true],[undefined,true,true],['auto',false,false]]){
    const budget=new Budget(256*1024**2),engine=new PagedDenseImageEngine({surface:{descriptor:{format:'rgb8',width:4,height:4}}},budget,{maxWorkers:1,enableDenseGpu:enabledGpu});let result;
    try{result=await engine.analyze({},backend===undefined?{}:{backend});assert.equal(settings.at(-1),expected);}
    finally{await result?.release();await engine.dispose();}
    assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
  }
});
