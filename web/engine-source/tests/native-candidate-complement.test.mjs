import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {localizeSourceRegionTask} from '../src/source-region-localize.js';
import {prepareNeuralStrictSourceContext} from '../src/neural-strict-source-context.js';
const rect=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],sha='a'.repeat(64);
async function setup(operation,excluded,origin=[20,10],hole=false){
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width:96,height:64}),[ox,oy]=origin;
 const boxes=[[ox,oy,ox+24,oy+32],[ox+32,oy,ox+56,oy+32]],zones=boxes.map((b,i)=>({id:'selection-'+i,kind:'acquisition',enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3],polygon:rect(b)}));
 if(hole)zones.push({id:'true-hole',kind:'exclusion',enabled:true,x0:ox+8,y0:oy+8,x1:ox+12,y1:oy+12,polygon:rect([ox+8,oy+8,ox+12,oy+12])});
 await state.replaceZones(zones,{enabled:true,positiveMode:'selected'});const domain=await compileOriginalSourceRegions(state.snapshot()),task={operation,backend:'webgpu',params:{algorithm:operation.endsWith('sparse')?'XFeat':'PatchMatch Zernike',regions:[],guides:[],compare:false,...(excluded===undefined?{}:{excluded})}},budget=new Budget(2**24),flags={strictSparseFragments:true,strictDenseFragments:true},local=await localizeSourceRegionTask(task,domain,flags);return{task,domain,local,budget,flags,ox,oy};
}
for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense'])for(const variant of ['omitted','empty','explicit'])test(operation+' '+variant+': restore only requested negative polygons while the verified source retains its exact half-open candidate boundary',async()=>{
 const explicit=[rect([22,12,25,15])],f=await setup(operation,variant==='omitted'?undefined:variant==='empty'?[]:explicit),before=structuredClone(f.local);
 assert.ok(f.local.params.excluded.length>0,'Native localization must still certify and restrict the complement');
 const p=await prepareNeuralStrictSourceContext({domain:f.domain,task:f.local},{budget:f.budget});
 try{assert.deepEqual(f.local,before);assert.equal(p.candidateDomain.containsOriginal(50,14),false,'The gap remains outside candidates');assert.equal(p.candidateDomain.containsOriginal(52,14),true,'The first right-window pixel remains admitted');assert.equal(p.contextDomain.containsOriginal(50,14),true,'A generated complement is not a true negative');assert.equal(p.strictExclusions.some(x=>x.origin==='native-parameter-polygon'&&x.polygon.some(v=>v[0]===52)),false);assert.deepEqual(p.originalTask.params.excluded,variant==='explicit'?explicit:[],'Generated polygons cannot reach inclusive native polygon filtering');assert.equal(p.originalTask.backend,'webgpu');if(variant==='explicit'){assert.equal(p.candidateDomain.containsOriginal(23,13),false);assert.equal(p.contextDomain.containsOriginal(23,13),false);}}
 finally{p.release();}assert.equal(f.budget.total(),0);
});
for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense'])test(operation+': a true Original exclusion and an explicit requested negative survive restoration without new RGB context',async()=>{
 const explicit=[rect([22,12,25,15])],f=await setup(operation,explicit,[20,10],true),p=await prepareNeuralStrictSourceContext({domain:f.domain,task:f.local},{budget:f.budget});try{assert.equal(p.candidateDomain.containsOriginal(29,19),false);assert.equal(p.contextDomain.containsOriginal(29,19),false);assert.equal(p.candidateDomain.containsOriginal(23,13),false);assert.equal(p.contextDomain.containsOriginal(23,13),false);assert.equal(p.candidateDomain.containsOriginal(52,14),true);assert.deepEqual(p.originalTask.params.excluded,explicit);}finally{p.release();}assert.equal(f.budget.total(),0);
});
for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense'])for(const tamper of ['original','generated','effective'])test(operation+': reject changed '+tamper+' exclusion certificate before native input reads',async()=>{
 const f=await setup(operation,[],[20,10]),m=f.local.sourceRegionLocalization.nativeParameterExclusions;assert.ok(m,'Native sparse and dense exclusions require a provenance certificate');if(tamper==='original')m.original.push(rect([1,1,2,2]));else if(tamper==='generated')m.generated[0][0][0]++;else f.local.params.excluded[0][0][0]++;await assert.rejects(prepareNeuralStrictSourceContext({domain:f.domain,task:f.local},{budget:f.budget}),{code:'SOURCE_REGIONS_INVALID'});assert.equal(f.budget.total(),0);
});
