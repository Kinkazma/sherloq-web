import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createCatnetStrictAnalyzer} from '../src/catnet-strict-analyzer.js';
import {createCatnetContextTensors} from '../src/catnet-context-tensors.js';
import {planCatnetStrictContexts} from '../src/catnet-strict-contexts.js';
const sha='a'.repeat(64),geometry={sourceWidth:8,sourceHeight:8,orientation:1};
const codes={channels:1,width:8,height:8,readInto:async out=>out.fill(0)},table={data:new Float32Array(64).fill(1),dims:[1,1,8,8]};
async function domain(){return compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:sha,width:8,height:8})).snapshot());}
test('frozen network primary survives failed prepared-owner retirement and all native credits retire',async()=>{
 const budget=new Budget(4*1024**2),d=await domain(),primary=Object.freeze(Object.assign(Error('native cancelled'),{code:'CANCELLED'}));let cleaned=0;
 const analyzer=createCatnetStrictAnalyzer({budget,segments:{checkpointSha256:'b'.repeat(64)},pool:{clear(){},dispose(){}},prepareOriginal:async()=>({codes,table,metadata:{jpeg_source:'original',jpeg_sha256:sha},release(){cleaned++;throw Error('prepared retirement failed');}}),runNetwork:async()=>{throw primary;}});
 const image={segmented:true,sha256:sha,source:{},store:{},surface:{descriptor:{id:'source',revision:1,width:8,height:8,...geometry},readWindow(){throw Error('No RGB read belongs to this failure fixture');}}};
 try{await assert.rejects(analyzer.analyze(image,{}, {sourceRegionDomain:d.descriptor}),e=>e===primary);assert.equal(cleaned,1);}finally{await analyzer.dispose();assert.equal(budget.total(),0);}
});
test('frozen source primary survives borrowed-window failure and its tensor workspace is released',async()=>{
 const budget=new Budget(4*1024**2),d=await domain(),plan=await planCatnetStrictContexts(d,geometry,{budget}),primary=Object.freeze(Object.assign(Error('source read failed'),{code:'STORAGE_IO'}));let released=0;
 const view={domain:d,maxReadPixels:64,async readWindow(){return{get pixels(){throw primary;},release(){released++;throw Error('source-window retirement failed');}};}},t=createCatnetContextTensors({view,context:plan.contexts[0],geometry,codes,table,originalSourceSha256:sha},{budget});
 try{await assert.rejects(t.rgb.readRows(0,8),e=>e===primary);assert.equal(released,1);}finally{await t.release();plan.release();assert.equal(budget.total(),0);}
});
