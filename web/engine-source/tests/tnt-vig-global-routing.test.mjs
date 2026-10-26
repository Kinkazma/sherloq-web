import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {families,fixture,controlledNative,gate,W} from './tnt-vig-global-fixtures.mjs';
import {createSegmentationWindowSource} from '../src/segmentation-window-source.js';
import {createSegmentationNativeWindows} from '../src/segmentation-native-windows.js';
import {createSegmentationNativeWindowPool} from '../src/segmentation-native-window-pool.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {zone} from './tnt-vig-global-fixtures.mjs';

async function originalModule(family,kind){
 const path=W+'/source-freezes/'+family[kind==='run'?'baselineRun':'baselineProduct']+'/web/engine-source/src/mgcfdn-'+family.name+'-window-fragment-'+kind+'.js';
 const url=pathToFileURL(path),source=(await readFile(path,'utf8')).replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,quote,specifier)=>'from '+quote+new URL(specifier,url).href+quote);
 const encoded=btoa([...new TextEncoder().encode(source)].map(v=>String.fromCharCode(v)).join(''));
 return import('data:text/javascript;base64,'+encoded);
}
for(const family of families){
 test(family.name+': explicitly selected envelope enters both common RGB and candidate populations under root100; no generated candidate-only gap',async()=>{
  const h=await fixture(family,{explicitEnvelope:true}),c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}});
  try{assert.equal(h.plan.global.candidateDomain.containsOriginal(24,4),true);assert.equal(h.plan.global.contextDomain.containsOriginal(24,4),true);assert.equal(h.plan.global.candidateDomain.containsOriginal(24,12),false);const value=await runner.run();assert.equal(value.receipt.contextCells,1024);assert.equal(value.receipt.candidateCells,1024);assert.equal(value.observations.rgbObservedPixels,1088);assert.equal(h.counts[4*48+24],1);assert.equal(h.counts[12*48+24],0);assert.equal(c.backbones,1);}
  finally{await runner.release();await h.close();}
 });
 for(const backend of ['cpu','webgpu'])test(family.name+': true central-hole canonical union observes every admitted RGB pixel exactly once, retains common bank/provider/Maximum (controlled NN)',async()=>{
  const h=await fixture(family,{backend}),c=controlledNative(h),owners=[];
  const runner=family.run({original:h.original,window:h.window,backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner:o=>owners.push(o)});
  assert.equal(owners.length,1,'Carrier parent must publish before the first await');
  try{
   const answer=await runner.run();assert.equal(answer.cloneWindowMode,'global');assert.equal(answer.provenance.cloneWindowMode,'global');
   assert.equal(answer.provenance.backend,backend==='cpu'?'cpu-wasm':family.gpu);assert.equal(answer.provenance.sourcePolicy,'canonical-declared-context-union-single-observation/1');
   assert.equal(c.backbones,1);assert.equal(answer.contexts.length,4);assert.equal(answer.receipt.contextCells,1024);assert.equal(answer.receipt.candidateCells,1024);
   assert.equal(answer.observations.rgbObservedPixels,1088);assert.equal(answer.observations.rgbForbiddenPixels,0);assert.equal(h.forbidden,0);
   for(let y=0;y<24;y++)for(let x=0;x<48;x++)assert.equal(h.counts[y*48+x],h.domain.containsOriginal(x,y)?1:0,'Independent dense RGB counter '+x+','+y);
   assert.equal(answer.execution.requestedMaximumCores,10);assert.deepEqual(answer.execution.headProviders,['wasm']);assert.equal(answer.execution.numThreadsPerNativeSession,1);
   assert.equal(c.events.filter(v=>v.phase==='backbone').length,1);assert.equal(c.events.filter(v=>v.phase==='global-consistency').length,1);assert.equal(c.events.filter(v=>v.phase==='window-pools').length,1);assert.equal(c.events.filter(v=>v.phase==='candidate-attention').length,1);
   assert.ok(answer.contexts.every(v=>v.probability instanceof Float32Array&&v.probability.length===65536&&v.logits.length===65536));
  }finally{await runner.release();await h.close();}
 });
 test(family.name+': default independent keeps the frozen native identity and feeds byte unchanged; identical global domain changes identity only (controlled NN)',async()=>{
  const baseline=await originalModule(family,'run'),oldRun=baseline[family.name==='tnt'?'createTntWindowFragmentRun':'createVigWindowFragmentRun'];
  const observed=[];
  for(const [create,mode] of [[oldRun,undefined],[family.run,undefined],[family.run,'global']]){
   const h=await fixture(family,{mode:'independent'}),c=controlledNative(h);
   const input={original:h.original,window:h.window,backend:'webgpu',model:c.config,modelUrl:c.config.url,...(mode?{cloneWindowMode:mode}:{})};
   const runner=create(input,{...c.dependencies,onOwner(){}});
   try{const result=await runner.run();observed.push({mode:result.cloneWindowMode,identity:result.provenance.nativeWindowIdentity,hashes:c.preparedHashes,fields:result.contexts.map(v=>({bounds:v.context.bounds,probability:[...v.probability.subarray(0,4)]}))});}
   finally{await runner.release();await h.close();}
  }
  assert.deepEqual(observed[0],observed[1]);assert.notEqual(observed[1].identity,observed[2].identity);assert.deepEqual(observed[1].hashes,observed[2].hashes);assert.deepEqual(observed[1].fields,observed[2].fields);assert.equal(observed[2].mode,'global');
 });
 test(family.name+': real pool dispatches a single global union; full raw cache/surfaces survive independent ownership and retirement (controlled NN)',async()=>{
  const h=await fixture(family),c=controlledNative(h),adapterFactory=()=>({async load(){},async dispose(){},async clearImage(){},async clearImages(){}});
  const factoryKey=family.name+'FragmentProductFactory';
  const pool=createSegmentationNativeWindowPool({...c.productOptions,windowFactory:opts=>createSegmentationNativeWindows({...opts,adapterFactory,[factoryKey]:opts=>family.product({...opts,...c.productOptions})}),selectBackend:async({requested})=>({backend:requested,reason:'controlled-original-selection'})});
  let carrier,result;
  try{
   await pool.load(c.config);carrier=pool.begin({domain:h.domain,task:h.task,original:h.original});result=await carrier.execute();
   assert.equal(result.cloneWindowMode,'global');assert.equal(result.windowResults.length,0);assert.equal(result.metrics.nativeWindowExecution.observed,1);assert.equal(c.backbones,1);
   const value=result.globalResult;assert.equal(value.cloneWindowMode,'global');assert.equal(value.provenance.cloneWindowMode,'global');
   const raw=pool.readRaw({imageId:h.task.imageId,resultId:value.data.metadata.resultId});assert.equal(raw.cloneWindowMode,'global');assert.equal(raw.provenance.cloneWindowMode,'global');assert.equal(raw.data.rawGrids.length,4);assert.equal(raw.metrics.inferences,0);assert.equal(c.backbones,1);
   for(const grid of raw.data.rawGrids){assert.equal(grid.raw.length,65536);assert.ok(grid.raw.every(v=>v===.75));}
   await carrier.transferOutputs();await carrier.dispose();carrier=undefined;await pool.dispose();
   const read=await c.outputs.get(value.surface.id).surface.readWindow({x:0,y:0,width:48,height:24});
   for(let y=0;y<24;y++)for(let x=0;x<48;x++)assert.equal(read.pixels.data[y*48+x],h.domain.containsOriginal(x,y)?.75:0,'Projected canonical support');
   await read.release();
  }finally{await carrier?.dispose();await pool.dispose();await c.releaseAll();await h.close();}
 });
 test(family.name+': same window/task modes separate raw caches while frozen independent result IDs remain byte exact (controlled NN)',async()=>{
  const baseline=await originalModule(family,'product'),oldProduct=baseline[family.name==='tnt'?'createTntWindowFragmentProduct':'createVigWindowFragmentProduct'];
  const ids=[];
  for(const create of [oldProduct,family.product]){
   const h=await fixture(family,{mode:'independent'}),c=controlledNative(h),product=create(c.productOptions),source=createSegmentationWindowSource({original:h.original,window:h.window},{budget:h.budget});
   try{
    const input={task:h.task,original:h.original,window:h.window,backend:'webgpu',config:c.config,plan:await source.ready};
    const independent=await product.run(input);independent.transferOutputs();ids.push(independent.data.metadata.resultId);
    assert.equal(independent.data.metadata.resultId,h.task.id+':window-fragments:webgpu:'+h.window.fingerprint);
    if(create===family.product){
     const global=await product.run({...input,task:{...h.task,cloneWindowMode:'global'}});global.transferOutputs();
     assert.notEqual(global.data.metadata.resultId,independent.data.metadata.resultId);assert.equal(c.resourcesMade,1,'Model resources must be reused across modes');
     for(const [value,mode] of [[independent,'independent'],[global,'global']]){
      const raw=product.readRaw({imageId:h.task.imageId,resultId:value.data.metadata.resultId});assert.equal(raw.cloneWindowMode,mode);assert.equal(raw.provenance.cloneWindowMode,mode);assert.equal(raw.data.rawGrids.length,4);
      raw.data.rawGrids[0].raw.fill(0);assert.equal(product.readRaw({imageId:h.task.imageId,resultId:value.data.metadata.resultId}).data.rawGrids[0].raw[0],.75,'Returned copy cannot corrupt either cache');
     }
    }
   }finally{await product.dispose();await c.releaseAll();await source.dispose();await h.close();}
  }
  assert.equal(ids[0],ids[1]);
 });
 for(const value of [false,Object.freeze({code:'SOURCE_ACK'})])test(family.name+': global source ACK refusal remains owned through retry: '+String(value),async()=>{
  let refusal=true;const h=await fixture(family,{refuse:()=>({refuse:refusal,value})}),c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}});
  try{await assert.rejects(runner.run(),v=>v===value);assert.equal(c.backbones,0);await assert.rejects(runner.release(),v=>v===value);assert.ok(h.active.size>0);assert.ok(h.budget.total()>0);refusal=false;await runner.release();}finally{refusal=false;await runner.release();await h.close();}
 });
 test(family.name+': cancellation during global late source ACK coalesces retirement and suppresses the completed result',async()=>{
  const entered=gate(),wait=gate(),h=await fixture(family,{onAck:entered.resolve,waitAck:wait.promise}),c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}}),work=runner.run();
  await entered.promise;const held=h.budget.total(),one=runner.release(),two=runner.release();assert.equal(one,two);assert.ok(h.active.size>0);assert.equal(h.budget.total(),held);wait.resolve();await assert.rejects(work,{code:'CANCELLED'});await one;assert.equal(c.backbones,0);await h.close();
 });
 test(family.name+': one-pixel candidate-only exclusion changes N before relations while visual context stays admitted (controlled NN)',async()=>{
  const h=await fixture(family,{candidateOnly:true}),c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}});
  try{const value=await runner.run();assert.equal(value.receipt.contextCells,256);assert.ok(value.receipt.candidateCells<256&&value.receipt.candidateCells>=40);assert.equal(value.observations.rgbObservedPixels,1152);assert.ok(c.events.filter(v=>v.phase!=='backbone').every(v=>v.N===value.receipt.candidateCells&&v.M===256));}
  finally{await runner.release();await h.close();}
 });
 test(family.name+': all-excluded global union produces no RGB, no backbone, no head and no whole fallback',async()=>{
  const h=await fixture(family,{allExcluded:true}),c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}});
  try{const value=await runner.run();assert.equal(value.status,'empty');assert.equal(value.cloneWindowMode,'global');assert.equal(value.provenance.cloneWindowMode,'global');assert.equal(h.reads,0);assert.equal(c.backbones,0);assert.equal(c.events.length,0);}
  finally{await runner.release();await h.close();}
 });
 test(family.name+': N below native TopK40 stays a separate carrier empty/zero-CNN boundary, without changing TopK',async()=>{
  const h=await fixture(family,{candidateOnly:true}),state=await createOriginalSourceRegionsState({sourceSha256:h.original.sha256,width:48,height:24});
  await state.replaceZones([zone('only-four-native-cells',[0,0,6,3])],{enabled:true,positiveMode:'selected'});h.window.candidateDomain=await compileOriginalSourceRegions(state.snapshot());
  const c=controlledNative(h),runner=family.run({original:h.original,window:h.window,backend:h.task.backend,model:c.config,modelUrl:c.config.url,cloneWindowMode:'global'},{...c.dependencies,onOwner(){}});
  try{const value=await runner.run();assert.equal(value.status,'empty');assert.equal(value.receipt.topk,40);assert.ok(value.receipt.candidateCells>0&&value.receipt.candidateCells<40);assert.equal(value.receipt.contextCells,256);assert.equal(h.reads,0);assert.equal(c.backbones,0);assert.equal(c.events.length,0);}
  finally{await runner.release();await h.close();}
 });
 test(family.name+': global product preserves frozen primary and failed producer ACK; subsequent work waits for retry before any new RGB/cache',async()=>{
  let refusal=true;const primary=Object.freeze({code:'CONTROLLED_NATIVE_PRIMARY'}),h=await fixture(family),c=controlledNative(h,{primary,refuseProducer:()=>({refuse:refusal,value:false})}),product=family.product(c.productOptions),source=createSegmentationWindowSource({original:h.original,window:h.window},{budget:h.budget});
  const input={task:h.task,original:h.original,window:h.window,backend:h.task.backend,config:c.config,plan:await source.ready};
  try{await assert.rejects(product.run(input),v=>v===primary);const reads=h.reads;assert.equal(c.backbones,1);assert.equal(c.outputs.size,0);await assert.rejects(product.run(input),v=>v===false);assert.equal(h.reads,reads);assert.equal(c.backbones,1);assert.ok(h.budget.total()>0);refusal=false;await product.dispose();}
  finally{refusal=false;await product.dispose();await source.dispose();await c.releaseAll();await h.close();}
 });
 test(family.name+': unadopted global publication remains parent-owned and is retired on disposal',async()=>{
  const h=await fixture(family),c=controlledNative(h),product=family.product(c.productOptions),source=createSegmentationWindowSource({original:h.original,window:h.window},{budget:h.budget});
  try{await product.run({task:h.task,original:h.original,window:h.window,backend:h.task.backend,config:c.config,plan:await source.ready});assert.ok(c.outputs.size>0);await product.dispose();assert.equal(c.outputs.size,0);}
  finally{await product.dispose();await source.dispose();await c.releaseAll();await h.close();}
 });
 test(family.name+': requested global flag cannot relabel an independent producer or an explicitly conflicting executed mode',async()=>{
  const h=await fixture(family),c=controlledNative(h),source=createSegmentationWindowSource({original:h.original,window:h.window},{budget:h.budget});
  const product=family.product({...c.productOptions,runFactory(input,hooks){const runner=c.runFactory(input,hooks);return {...runner,async run(){return {...await runner.run(),cloneWindowMode:'independent'};}};}}),input={task:h.task,original:h.original,window:h.window,backend:h.task.backend,config:c.config,plan:await source.ready};
  try{await assert.rejects(product.run({...input,mode:'independent'}),{code:'INVALID_INPUT'});assert.equal(c.resourcesMade,0);assert.equal(h.reads,0);await assert.rejects(product.run(input),{code:'INVALID_INPUT'});assert.equal(c.outputs.size,0);assert.equal(c.backbones,1);}
  finally{await product.dispose();await source.dispose();await c.releaseAll();await h.close();}
 });
}
