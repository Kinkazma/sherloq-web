import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createSsgStrictEngine} from '../src/ssg-strict-engine.js';

const models={'ssg-edges':{url:'https://unused.invalid/forest',bytes:10,sha256:'f'.repeat(64)}},params={normalizationLongEdge:0};
async function setup(){const budget=new Budget(256*1024**2),width=24,height=24,state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width,height}),domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView({sha256:'a'.repeat(64),descriptor:{format:'rgb8',width,height},async readWindow(rect){const release=budget.reserve(rect.width*rect.height*3);return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3).fill(90)},release};}},domain.descriptor,{budget}),engine=createSsgStrictEngine(view,budget,{maxWorkers:2});return{budget,view,engine,async close(){await engine.dispose();await view.dispose();assert.equal(budget.total(),0);}};}

test('cold complete callback cancellation refuses the result and does not publish a native checkpoint',async()=>{
 const h=await setup(),controller=new AbortController();let after;try{await assert.rejects(h.engine.analyze(params,{models,signal:controller.signal,onProgress:e=>{if(e.phase==='complete')controller.abort();}}),{code:'CANCELLED'});after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,false);}finally{after?.release();await h.close();}
});
test('warm complete callback cancellation refuses the result and preserves the previous native checkpoint',async()=>{
 const h=await setup(),controller=new AbortController();let first,after;try{first=await h.engine.analyze(params,{models});await assert.rejects(h.engine.analyze({...params,maskThreshold:.9},{models,signal:controller.signal,onProgress:e=>{if(e.phase==='complete')controller.abort();}}),{code:'CANCELLED'});after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,true);assert.deepEqual(after.mask,first.mask);assert.notEqual(after.mask,first.mask);}finally{first?.release();after?.release();await h.close();}
});
test('a complete-cancelled replacement retains the old checkpoint instead of committing the new native parameters',async()=>{
 const h=await setup(),controller=new AbortController();let first,after;try{first=await h.engine.analyze(params,{models});await assert.rejects(h.engine.analyze({...params,ratio:.5},{models,signal:controller.signal,onProgress:e=>{if(e.phase==='complete')controller.abort();}}),{code:'CANCELLED'});after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,true);}finally{first?.release();after?.release();await h.close();}
});
test('a frozen complete-callback exception remains primary and no provisional result or checkpoint leaks',async()=>{
 const h=await setup(),primary=Object.freeze(new Error('Frozen publication exception'));let after;try{await assert.rejects(h.engine.analyze(params,{models,onProgress:e=>{if(e.phase==='complete')throw primary;}}),error=>error===primary);after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,false);}finally{after?.release();await h.close();}
});
