import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
const rect=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],size={sourceSha256:'a'.repeat(64),width:12,height:4};
const zone=(id,b,kind='acquisition')=>({id,kind,enabled:true,polygon:rect(b),x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
const window=(id,b,kind='region')=>({id,kind,bounds:b,polygon:rect(b)});
async function domain(zones,options={}){const state=await createOriginalSourceRegionsState(size);await state.replaceZones(zones,{enabled:true,positiveMode:'selected'});return compileOriginalSourceRegions(state.snapshot(),options);}
const task=(mode,regions)=>({operation:'ai.clones.segmentation',cloneWindowMode:mode,params:{variant:'selfdm-map'},regions});
for(const mode of ['independent','global']){
 test(mode+': a tool-local envelope cannot reopen the unselected Original gap',async()=>{
  const source=await domain([zone('original-left',[0,0,4,4]),zone('original-right',[8,0,12,4])]),budget=new Budget(2**24),plan=await prepareCloneAnalysisWindows({domain:source,task:task(mode,[window('tool-envelope',[0,0,12,4],'envelope')])},{budget});
  try{const actual=mode==='global'?plan.global:plan.windows[0];assert.equal(source.countIncluded,32);assert.equal(actual.contextDomain.countIncluded,32);assert.equal(actual.candidateDomain.countIncluded,32);assert.equal(actual.contextDomain.containsOriginal(6,2),false);assert.equal(actual.contextDomain.containsOriginal(1,2),true);assert.equal(actual.contextDomain.containsOriginal(10,2),true);}finally{plan.release();}assert.equal(budget.total(),0);
 });
 test(mode+': the same envelope explicitly admitted in Original retains all its RGB',async()=>{
  const source=await domain([zone('original-left',[0,0,4,4]),zone('original-right',[8,0,12,4]),zone('original-envelope',[0,0,12,4])]),budget=new Budget(2**24),plan=await prepareCloneAnalysisWindows({domain:source,task:task(mode,[window('tool-envelope',[0,0,12,4],'envelope')])},{budget});
  try{const actual=mode==='global'?plan.global:plan.windows[0];assert.equal(actual.contextDomain.countIncluded,48);assert.equal(actual.candidateDomain.countIncluded,48);assert.equal(actual.contextDomain.containsOriginal(6,2),true);}finally{plan.release();}assert.equal(budget.total(),0);
 });
}
test('independent windows keep distinct analyses, including coincident declarations and an explicit envelope',async()=>{
 const source=await domain([zone('original-left',[0,0,4,4]),zone('original-right',[8,0,12,4])]),budget=new Budget(2**24),regions=[window('left-one',[0,0,4,4]),window('same-left-again',[0,0,4,4]),window('outer-explicit',[0,0,12,4],'envelope')],plan=await prepareCloneAnalysisWindows({domain:source,task:task('independent',regions)},{budget});
 try{assert.deepEqual(plan.windows.map(w=>w.id),regions.map(w=>w.id));assert.deepEqual(plan.windows.map(w=>w.contextDomain.countIncluded),[16,16,32]);assert.equal(plan.global,null);assert.notEqual(plan.windows[0].fingerprint,plan.windows[1].fingerprint);}finally{plan.release();}assert.equal(budget.total(),0);
});
test('global overlap is a unique union bounded by Original and every true negative',async()=>{
 const source=await domain([zone('original-wide',[0,0,10,4]),zone('original-true-negative',[5,0,6,4],'exclusion')]),budget=new Budget(2**24),regions=[window('first-local',[0,0,8,4]),window('second-overlap',[4,0,12,4])],plan=await prepareCloneAnalysisWindows({domain:source,task:task('global',regions)},{budget});
 try{assert.equal(plan.global.contextDomain.countIncluded,36);assert.equal(plan.global.candidateDomain.countIncluded,36);assert.equal(plan.global.contextDomain.containsOriginal(5,2),false);assert.equal(plan.global.contextDomain.containsOriginal(11,2),false);assert.equal(plan.global.contextDomain.containsOriginal(4,2),true);}finally{plan.release();}assert.equal(budget.total(),0);
});
test('nested Original ceilings remain absolute after a later local envelope',async()=>{
 const first=await domain([zone('old-source-bound',[0,0,8,4])]),second=await domain([zone('new-source-wide',[0,0,12,4])],{ceiling:first}),budget=new Budget(2**24),plan=await prepareCloneAnalysisWindows({domain:second,task:task('global',[window('local-wide',[0,0,12,4],'envelope')])},{budget});
 try{assert.equal(plan.global.contextDomain.countIncluded,32);assert.equal(plan.global.candidateDomain.countIncluded,32);assert.equal(plan.global.contextDomain.containsOriginal(10,2),false);}finally{plan.release();}assert.equal(budget.total(),0);
});
