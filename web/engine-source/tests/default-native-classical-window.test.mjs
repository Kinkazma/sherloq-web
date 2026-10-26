import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {sparseCopyParams} from '../src/sparse-copy.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
import {createSiftNativeWindowCallback} from '../src/sift-native-windows.js';
test('omitted algorithm preserves the existing native G2NN default inside a declared window',async()=>{
 const budget=new Budget(128*1024**2),sha='a'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:80,height:40}),domain=await compileOriginalSourceRegions(state.snapshot()),task={operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',backend:'cpu',params:{},regions:[{id:'native-default-opaque',bounds:[0,0,40,40]}]},plan=await prepareCloneAnalysisWindows({domain,task},{budget}),loans=[];
 const callback=createSiftNativeWindowCallback({original:{sha256:sha,surface:{descriptor:{format:'rgb8',width:80,height:40},readWindow(){throw Error('A controlled default/dispatch test must not read RGB');}}},budget,profile:{maxWorkers:10},engineFactory:()=>({features:{extract(){throw Error('Controlled default must not execute a detector');},dispose(){}},counts:{},analyze(input){return{params:sparseCopyParams(input),metadata:{},points:new Float64Array(0),pairs:new Float64Array(0),groups:[],models:[],colors:new Uint8Array(0),bases:[],pair_search_regions:new Int32Array(0),release(){}};},dispose(){return this.features.dispose();}}),nativeFactory:()=>({dispose(){}})});let raw;
 try{await callback.retainWindows(plan);raw=await callback({window:plan.windows[0],task,sourceContextIdentity:'controlled-default-native',onOwner:o=>loans.push(o)});assert.equal(raw.params.algorithm,'SIFT + G2NN + RANSAC');assert.deepEqual(task.params,{});assert.deepEqual(raw.provenance.params,{});}
 finally{await raw?.release();for(const owner of loans)await owner.dispose();await callback.dispose();plan.release();assert.equal(budget.total(),0);}
});
