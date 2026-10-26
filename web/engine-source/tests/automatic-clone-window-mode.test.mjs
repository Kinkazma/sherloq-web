import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';
import {automaticD2prlRequest} from '../src/automatic-ai-regions.js';
import {automaticPreparedD2prlRequest} from '../src/automatic-prepared-d2prl-request.js';
import {prepareAutomaticStrictContext} from '../src/automatic-strict-context.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
const poly=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]],selection={width:384,height:224,regions:[poly(24,24,184,184),poly(200,24,360,184)],envelope:null};
test('Automatic clone mode is explicit and preserves all native detector methods and scientific parameters',()=>{
 const defaults=automaticAnalysisPlan(selection),global=automaticAnalysisPlan({...selection,cloneWindowMode:'global'});assert.equal(defaults.cloneWindowMode,'independent');assert.equal(global.cloneWindowMode,'global');const {cloneWindowMode,...rest}=global,{cloneWindowMode:old,...baseline}=defaults;assert.deepEqual(rest,baseline);assert.equal(defaults.jobs.find(j=>j.id==='sift').params.reflections,true);assert.equal(defaults.jobs.find(j=>j.id==='patchmatch').params.iterations,8);
});
test('A global choice cannot reactivate disabled zones or change an exclusion',()=>{const p=automaticAnalysisPlan({...selection,cloneWindowMode:'global',disabled:[0,1]});assert.equal(p.active.length,0);assert.ok(p.jobs.every(j=>j.enabled===false));assert.deepEqual(p.excluded,selection.regions);});
test('Unknown clone mode is rejected before automatic planning',()=>assert.throws(()=>automaticAnalysisPlan({...selection,cloneWindowMode:'other'})));
test('Automatic D2PRL request carries the exact plan mode and leaves native regions and parameters intact',()=>{
 const a=automaticD2prlRequest(automaticAnalysisPlan(selection),{id:'a',imageId:'source'}),b=automaticD2prlRequest(automaticAnalysisPlan({...selection,cloneWindowMode:'global'}),{id:'a',imageId:'source'});assert.equal(a.cloneWindowMode,'independent');assert.equal(b.cloneWindowMode,'global');const {cloneWindowMode,...rest}=b,{cloneWindowMode:old,...baseline}=a;assert.deepEqual(rest,baseline);assert.equal(a.backend,'auto');
});
async function prepared(mode,{envelope=false}={}){
 const budget=new Budget(32*1024**2),sourceSha256='e'.repeat(64),size={sourceSha256,width:384,height:224},state=await createOriginalSourceRegionsState(size);await state.add('acquisition',{bounds:[24,24,184,184]});await state.add('acquisition',{bounds:[200,24,360,184]});const domain=await compileOriginalSourceRegions(state.snapshot()),regions=[{id:'A',x0:24,y0:24,x1:184,y1:184},{id:'B',x0:200,y0:24,x1:360,y1:184}],scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',...size,fingerprint:'scope-mode',status:'ready',text:{status:'complete'},regions,searchRegions:[...regions,...(envelope?[{id:'E',kind:'envelope',x0:24,y0:24,x1:360,y1:184}]:[])],excluded:[]},task={id:'source',imageId:'source',operation:'analysis.clones',cloneWindowMode:mode,params:{scientificScope:scope,selection:{regions:selection.regions,envelope:null,disabled:[]}}};const deny=()=>{throw Error('Mode propagation must not read RGB');},original={sha256:sourceSha256,surface:{descriptor:{...size,format:'rgb8'},readWindow:deny}},image={sha256:sourceSha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:domain.origin,surface:{descriptor:{width:domain.width,height:domain.height,format:'rgb8'},readWindow:deny},originalSource:original};const value=await prepareAutomaticStrictContext(image,task,{budget});return{value,budget};
}
test('Prepared aggregate preserves independent/global intent without inventing an envelope',async()=>{
 for(const mode of ['independent','global']){const f=await prepared(mode);let request;try{request=await automaticPreparedD2prlRequest(f.value,{id:'d2',imageId:'source'},{budget:f.budget});assert.equal(request.task.cloneWindowMode,mode);assert.equal(request.metadata.acquisitions,2);assert.equal(request.metadata.envelopes,0);assert.equal(request.task.backend,'auto');assert.equal(request.task.params.minimum,500);}finally{request?.release();f.value.release();}assert.equal(f.budget.total(),0);}
});
test('An explicitly prepared envelope remains a separate native job',async()=>{const f=await prepared('independent',{envelope:true});let request;try{request=await automaticPreparedD2prlRequest(f.value,{id:'d2',imageId:'source',cpu:true},{budget:f.budget});assert.equal(request.metadata.acquisitions,2);assert.equal(request.metadata.envelopes,1);assert.equal(request.task.regions[2].kind,'envelope');assert.equal(request.task.backend,'cpu');}finally{request?.release();f.value.release();}assert.equal(f.budget.total(),0);});
