import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine} from '../sherloq-browser/assets/unified-engine/src/index.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/unified-engine/src/source-region-geometry.js';
import {createIndividualScientificScope,scopeIndividualTask} from '../sherloq-browser/assets/individual-scientific-scope.js';
import {localizeSourceRegionTask} from '../sherloq-browser/assets/unified-engine/src/source-region-localize.js';
import {prepareNeuralStrictSourceContext} from '../sherloq-browser/assets/unified-engine/src/neural-strict-source-context.js';
import {Budget} from '../sherloq-browser/assets/unified-engine/src/cache.js';

import {prepareParameterScientificTask} from '../sherloq-browser/assets/parameter-scientific-task.js';
import {parseHTML} from 'linkedom';
import {createIndividualRegionController} from '../sherloq-browser/assets/individual-region-controller.js';
const width=64,height=48,parameters={algorithm:'SSG',normalizationLongEdge:0,regions:[],excluded:[],maskThreshold:.4};
async function setup(){
 const data=new Uint8Array(width*height*3).fill(128),engine=createEngine({memoryBudgetBytes:1024**3,computeProfile:'maximum',cpuKernel:'reference'}),loaded=await engine.load({id:'source',bytes:data.slice(),pixels:{format:'rgb8',width,height,data}}),sha=loaded.sha256;
 const state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha});await state.add('acquisition',{x0:4,y0:4,x1:28,y1:44});await state.add('acquisition',{x0:36,y0:6,x1:60,y1:42});await state.add('exclusion',{x0:10,y0:10,x1:12,y1:12});
 const domain=await compileOriginalSourceRegions(state.snapshot()),rectangles=state.snapshot().zones.map(zone=>({...zone,manual:true})),scope=await createIndividualScientificScope({width,height,sourceSha256:sha,sourceRegionCeiling:state.snapshot()},{rectangles,excludeTexts:false}),task={id:'initial',imageId:'source',operation:'tampering.copyMove.sparse',backend:'cpu',params:parameters,sourceRegionDomain:domain.descriptor};
 assert.equal(scope.status,'ready');return{engine,domain,scope,task,async close(){await engine.unload('source');await engine.dispose();const m=engine.capabilities().memory;assert.equal(m.activeReservationBytes+m.cacheBytes+m.retainedBytes,0);}};
}
test('active individual scope produces a different real strict context when a retained task omits it',async()=>{
 const h=await setup(),budget=new Budget(128*1024**2);let a,b;
 try{const initial=await localizeSourceRegionTask(scopeIndividualTask(h.task,h.scope),h.domain,{strictSparseFragments:true}),missing=await localizeSourceRegionTask({...h.task,params:{...parameters,maskThreshold:.5}},h.domain,{strictSparseFragments:true});
 a=await prepareNeuralStrictSourceContext({domain:h.domain,task:initial},{budget});b=await prepareNeuralStrictSourceContext({domain:h.domain,task:missing},{budget});assert.notEqual(a.fingerprint,b.fingerprint);console.log(JSON.stringify({initial:a.fingerprint,missing:b.fingerprint,initialScientificScope:initial.scientificScope.fingerprint,missingScientificScope:missing.scientificScope??null,candidateCounts:[a.candidateDomain.countIncluded,b.candidateDomain.countIncluded],contextCounts:[a.contextDomain.countIncluded,b.contextDomain.countIncluded]}));
 }finally{a?.release();b?.release();assert.equal(budget.total(),0);await h.close();}
});
test('real Core native empty-feature checkpoint survives the same scientific task and declines a missing-scope retained task',async()=>{
 const h=await setup();let initial,corrected;
 try{
  // The constant tiny source has zero native VLFeat word matches. The real
  // forest therefore is not requested by the native algorithm; no factory,
  // cache, model, localizer, matcher or source module is substituted.
  await h.engine.loadM3Models({models:{'ssg-edges':{url:'https://unused.invalid/no-forest-requested.json',bytes:218140772,sha256:'f'.repeat(64)}}});
  const scoped=scopeIndividualTask(h.task,h.scope);initial=await h.engine.run(scoped);assert.equal(initial.data.metadata.counts.features,0);assert(initial.data.metadata.nativeContexts.contexts.every(c=>c.forestStatus==='not-requested'));
  const changed={...h.task,id:'threshold',params:{...parameters,maskThreshold:.5}},missing=await h.engine.localizeRetainedParameters(changed);assert.equal(missing,null,'Current app-style request should reproduce checkpoint miss');
  const controller={scope:h.scope,active:()=>true,scientificActive:()=>true,task:value=>scopeIndividualTask(value,h.scope)},prepared=await prepareParameterScientificTask(changed,{getController:()=>controller,bindTask:async value=>value});corrected=await h.engine.localizeRetainedParameters(process.env.SSG_RETAINED_SCOPE_BASELINE==='1'?changed:prepared.task);assert(corrected,'Same scientific scope should reach retained checkpoint');assert.equal(corrected.metrics.cache.stages.newForest,0);assert.equal(corrected.metrics.cache.stages.newMatching,0);assert.equal(corrected.metrics.cache.stages.newVlfeat,0);assert.equal(corrected.data.params.maskThreshold,.5);assert.equal(corrected.sourceRegionDomain.fingerprint,initial.sourceRegionDomain.fingerprint);
 }finally{await h.close();}
});

for(const change of ['scope-reference','scope-fingerprint','controller','active-mode','scientific-mode','source'])test('scientific parameter preparation cancels an in-flight '+change+' change',async()=>{
 let scope={fingerprint:'a'.repeat(64)},active=true,scientific=true,current=true,controller={get scope(){return scope;},active:()=>active,scientificActive:()=>scientific,task:task=>({...task,scientificScope:scope})},resume,entered;const gate=new Promise(r=>resume=r),started=new Promise(r=>entered=r),pending=prepareParameterScientificTask({operation:'tampering.copyMove.sparse'},{getController:()=>controller,isSourceCurrent:()=>current,bindTask:async task=>{entered();await gate;return task;}});await started;
 if(change==='scope-reference')scope={...scope};else if(change==='scope-fingerprint')scope.fingerprint='b'.repeat(64);else if(change==='controller')controller={...controller};else if(change==='active-mode')active=false;else if(change==='scientific-mode')scientific=false;else current=false;resume();await assert.rejects(pending,{code:'CANCELLED'});
});
test('a later scientific scope replacement invalidates the ready request before a retained answer is accepted',async()=>{
 let scope={fingerprint:'a'.repeat(64)};const controller={get scope(){return scope;},active:()=>true,scientificActive:()=>true,task:task=>({...task,scientificScope:structuredClone(scope)})},ready=await prepareParameterScientificTask({params:{maskThreshold:.5}},{getController:()=>controller,bindTask:async value=>value});assert(ready.isCurrent());scope={fingerprint:'b'.repeat(64)};assert.equal(ready.isCurrent(),false);assert.equal(ready.task.scientificScope.fingerprint,'a'.repeat(64));
});
test('tools without an active scientific controller keep their exact task and primary preparation errors',async()=>{
 const task={operation:'noise.noisesniffer',params:{blockSize:8}},ready=await prepareParameterScientificTask(task,{getController:()=>null,bindTask:async value=>value});assert.equal(ready.task,task);assert(ready.isCurrent());const failure=Object.freeze(new Error('Original preparation failed'));await assert.rejects(prepareParameterScientificTask(task,{getController:()=>null,bindTask:async()=>{throw failure;}}),error=>error===failure);
});

for(const operation of ['noise.noisesniffer','jpeg.zero','various.stereogram','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'])test('real controller keeps '+operation+' on its existing domain-only retained transport',async()=>{
 const {document}=parseHTML('<html><body><aside></aside></body></html>'),image={blob:new Blob(['source']),width:64,height:48,sourceSha256:'a'.repeat(64)},scope=await createIndividualScientificScope(image,{manualFullSource:true,excludeTexts:false}),controller=createIndividualRegionController({document,parent:document.querySelector('aside'),panelMode:'editor-only',canEditScope:()=>true,source:()=>image,operation:()=>operation,getClient:async()=>{throw Error('No model or reader should be requested');}});
 try{controller.sourceChanged();await controller.restore({schema:'sherloq.individual-regions/1',sourceSha256:image.sourceSha256,scope,excludeTexts:false});assert(controller.active());assert.equal(controller.scientificActive(),false);const task={operation,params:{view:'regions'},sourceRegionDomain:{fingerprint:'b'.repeat(64)}},prepared=await prepareParameterScientificTask(task,{getController:()=>controller,bindTask:async value=>value});assert.equal(prepared.task,task);assert.equal(prepared.task.scientificScope,undefined);assert.equal(prepared.task.params.regions,undefined);assert.equal(prepared.task.sourceRegionDomain,task.sourceRegionDomain);assert(prepared.isCurrent());}finally{await controller.dispose();}
});
