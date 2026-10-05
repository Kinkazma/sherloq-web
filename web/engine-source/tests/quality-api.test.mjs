import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';import {normalizeQualityCurve} from '../src/quality-arithmetic.js';
const fixture=async name=>new Uint8Array(await readFile(new URL('../fixtures/'+name,import.meta.url)));
const leaf=value=>({tree_param:{num_nodes:'1',num_feature:'100',num_deleted:'0',size_leaf_vector:'0'},left_children:[-1],right_children:[-1],split_indices:[0],split_conditions:[value],default_left:[0],split_type:[0],categories:[],categories_nodes:[],categories_segments:[],categories_sizes:[]});
// Hand-authored arithmetic fixture, never a product model or automatic fallback.
const toy=value=>new Blob([JSON.stringify({version:[2,0,3],learner:{learner_model_param:{base_score:'5E-1',boost_from_average:'0',num_class:'0',num_feature:'100',num_target:'1'},objective:{name:'reg:squarederror'},gradient_booster:{name:'gbtree',model:{gbtree_model_param:{num_trees:'1',num_parallel_tree:'1'},trees:[leaf(value)],tree_info:[0]}}}})]);
const pixels={width:2,height:1,format:'rgb8',data:Uint8Array.of(1,2,3,4,5,6)},task={id:'q',imageId:'image',operation:'jpeg.quality'};
test('Quality model is explicit, curve cache survives model changes, outputs and dependencies are owned',async()=>{
 let calls=0;const codec={memoryBytes:()=>0,recompressGray:async image=>{calls++;return {...image,data:image.data.slice()};}},engine=createEngine({codec,memoryBudgetBytes:128*1024**2});
 try{
  await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});const absent=await engine.run(task);assert.equal(calls,100);assert.equal(absent.data.prediction,null);assert.match(absent.data.modelError,/local/);
  await assert.rejects(engine.run({...task,params:{modelId:'missing'}}),{code:'NOT_FOUND'});await assert.rejects(engine.run({...task,params:{modelId:'image'}}),{code:'INVALID_INPUT'});
  const blob=toy(42),loaded=await engine.loadQualityModel({id:'model',blob});assert.equal(loaded.kind,'jpeg-quality-model');assert.equal(loaded.features,100);assert.equal(loaded.weightsBundled,false);
  const first=await engine.run({...task,params:{modelId:'model'}});assert.equal(first.data.prediction,42.5);assert.equal(calls,100);assert.equal(first.metrics.cache.stages['loss-curve'],true);assert.equal(first.metrics.kernel,'jpeg-quality-cached-curve');
  first.data.curve.fill(9);const cached=await engine.run({...task,params:{modelId:'model'}});assert.ok(cached.data.curve.every(x=>x===0));assert.equal(cached.metrics.cache.result,true);
  const output=JSON.parse(new TextDecoder().decode(engine.exportResult(cached).bytes));assert.equal(output.provenance.references[0].originalSha256,loaded.sha256);assert.equal(output.data.prediction,42.5);
  const original=engine.original('model');original.fill(0);assert.deepEqual(engine.original('model'),new Uint8Array(await blob.arrayBuffer()));
  engine.unload('model');await assert.rejects(engine.run({...task,params:{modelId:'model'}}),{code:'NOT_FOUND'});await engine.loadQualityModel({id:'model',blob:toy(70)});
  const changed=await engine.run({...task,params:{modelId:'model'}});assert.equal(changed.data.prediction,70.5);assert.equal(calls,100);assert.equal(changed.metrics.cache.stages['loss-curve'],true);
  engine.unload('image');await engine.load({id:'image',bytes:Uint8Array.of(2),pixels});await engine.run({...task,params:{modelId:'model'}});assert.equal(calls,200);
  engine.unload('image');engine.unload('model');const state=engine.capabilities().memory;assert.equal(state.cacheBytes,0);assert.equal(state.retainedBytes,0);assert.equal(state.activeReservationBytes,0);
 }finally{engine.dispose();}
});
test('JPEG table evidence has priority; corrupt tables suppress learned fallback',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});try{
  await engine.loadQualityModel({id:'model',blob:toy(150)});const bytes=await fixture('synthetic.jpg');
  for(const [id,input] of [['jpeg',bytes],['truncated',Uint8Array.of(255,216,255)],['zero-table',(()=>{const copy=bytes.slice();for(let i=2;i<copy.length-5;i++)if(copy[i]===255&&copy[i+1]===219){copy[i+5]=0;break;}return copy;})()]]){
   await engine.load({id,bytes:input,pixels});const result=await engine.run({...task,imageId:id,params:{modelId:'model'}});assert.equal(result.data.prediction,null);
   if(id==='jpeg'){assert.ok(result.data.estimate);assert.equal(result.data.metadataError,null);}else{assert.ok(result.data.metadataError);assert.equal(result.data.quantization,null);}engine.unload(id);
  }
 }finally{engine.dispose();}
});
test('Quality cancellation and malformed models release admission, then recover',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2});try{
  await assert.rejects(engine.loadQualityModel({id:'bad',blob:new Blob(['{}'])}),{code:'UNSUPPORTED_MODEL'});
  const cancel=new AbortController();await assert.rejects(engine.loadQualityModel({id:'cancel',blob:toy(3)},{signal:cancel.signal,onProgress:()=>cancel.abort()}),{code:'CANCELLED'});
  assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});await engine.loadQualityModel({id:'model',blob:toy(3)});
  const run=new AbortController();await assert.rejects(engine.run({...task,params:{modelId:'model'}},{signal:run.signal,onProgress:()=>run.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  const result=await engine.run({...task,params:{modelId:'model'}});assert.equal(result.data.prediction,3.5);
 }finally{engine.dispose();}
});
test('Quality normalization preserves all native non-JPEG curves and rejects nonfinite values',async()=>{
 const reference=JSON.parse(new TextDecoder().decode(await fixture('quality-model/reference.json')));
 for(const item of reference.cases)assert.deepEqual(Array.from(await normalizeQualityCurve(Float64Array.from(item.raw))),item.curve,item.file);
 for(const value of [0,1,255])assert.ok((await normalizeQualityCurve(new Float64Array(100).fill(value))).every(x=>x===0));
 await assert.rejects(normalizeQualityCurve(new Float64Array(100).fill(NaN)),{code:'NUMERIC_RANGE'});const cancel=new AbortController();cancel.abort();await assert.rejects(normalizeQualityCurve(new Float64Array(100),{signal:cancel.signal}),{code:'CANCELLED'});
});
