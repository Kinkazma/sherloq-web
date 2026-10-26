import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
const box=([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]],sha='b'.repeat(64),A=[4,4,28,36],B=[44,4,68,36],E=[4,4,68,36];
async function prepare({ceiling=false,envelope=false,hole=false,mode='global'}={}){
 const budget=new Budget(64*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:80,height:48});
 if(ceiling){await state.add('acquisition',{bounds:A});await state.add('acquisition',{bounds:B});}
 if(hole)await state.add('exclusion',{bounds:[12,12,16,16]});
 const domain=await compileOriginalSourceRegions(state.snapshot()),task={operation:'tampering.copyMove.sparse',cloneWindowMode:mode,backend:'webgpu',params:{algorithm:'XFeat',limit:6000},regions:[{id:'A',bounds:A},{id:'B',bounds:B},...(envelope?[{id:'E',kind:'envelope',bounds:E}]:[])]};
 const plan=await prepareCloneAnalysisWindows({domain,task},{budget});return{budget,plan};
}
test('shared-bank RGB omits undeclared gaps even when Original is the whole image',async()=>{
 const f=await prepare();try{assert.equal(f.plan.global.contextDomain.containsOriginal(35,20),false);assert.equal(f.plan.global.candidateDomain.containsOriginal(35,20),false);assert.equal(f.plan.global.contextDomain.countIncluded,2*24*32);assert.equal(f.plan.global.contextPolicy,'declared-window-context-union');assert.deepEqual(f.plan.global.windowIds,['A','B']);assert.equal(f.plan.originalTask.backend,'webgpu');assert.equal(f.plan.originalTask.params.limit,6000);}finally{await f.plan.release();assert.equal(f.budget.total(),0);}
});
test('Original acquisition ceilings restrict common candidates without reintroducing gap RGB',async()=>{
 const f=await prepare({ceiling:true});try{assert.equal(f.plan.global.contextDomain.containsOriginal(35,20),false);assert.equal(f.plan.global.candidateDomain.containsOriginal(35,20),false);assert.equal(f.plan.global.contextDomain.countIncluded,f.plan.global.candidateDomain.countIncluded);}finally{await f.plan.release();assert.equal(f.budget.total(),0);}
});
test('only an explicitly declared E can add its RGB context; Original candidate ceilings still hold',async()=>{
 const f=await prepare({ceiling:true,envelope:true,hole:true});try{assert.equal(f.plan.global.contextDomain.containsOriginal(35,20),true);assert.equal(f.plan.global.candidateDomain.containsOriginal(35,20),false);assert.equal(f.plan.global.contextDomain.containsOriginal(13,13),false);assert.equal(f.plan.global.candidateDomain.containsOriginal(13,13),false);assert.deepEqual(f.plan.global.windowIds,['A','B','E']);}finally{await f.plan.release();assert.equal(f.budget.total(),0);}
});
test('independent windows remain separate and do not receive a common plan',async()=>{
 const f=await prepare({mode:'independent',envelope:true});try{assert.equal(f.plan.global,null);assert.equal(f.plan.windows[0].contextDomain.containsOriginal(50,20),false);assert.equal(f.plan.windows[1].contextDomain.containsOriginal(10,20),false);assert.equal(f.plan.windows[2].contextDomain.containsOriginal(35,20),true);}finally{await f.plan.release();assert.equal(f.budget.total(),0);}
});
