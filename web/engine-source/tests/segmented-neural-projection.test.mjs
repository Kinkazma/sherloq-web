import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{Budget}from'../src/cache.js';import{createNeuralSpatialRows}from'../src/neural-spatial-rows.js';import{segmentedNeuralProjection}from'../src/segmented-neural-projection.js';import factory from'../vendor/segmentation/spatial-bands.js';import postFactory from'../vendor/d2prl/postprocess.js';
const hash=a=>createHash('sha256').update(a).digest('hex'),postModule=await postFactory();
const floats=async(base,spec)=>{const b=await readFile(new URL(spec.file,base));assert.equal(hash(b),spec.sha256);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const postprocess=budget=>({async run({raw,minimum}){const work=budget.reserve(512*1024**2+raw.byteLength*2+448**2*16);let ip,op;try{ip=postModule._malloc(raw.byteLength);op=postModule._malloc(448**2*16);assert.ok(ip&&op);postModule.HEAPF32.set(raw,ip/4);assert.equal(postModule._d2prl_postprocess(ip,448,448,minimum,op,op+448**2*12),1);const release=budget.reserve(448**2*16);return{masks:postModule.HEAPF32.slice(op/4,op/4+3*448**2),release};}finally{if(ip)postModule._free(ip);if(op)postModule._free(op);work();}}});
async function compare(result,outputs){for(const[key,spec]of Object.entries(outputs)){const bytes=new Uint8Array(result.stores[key].byteLength);await result.stores[key].readInto(bytes);assert.equal(hash(bytes),spec.sha256,key);}const bytes=new Uint8Array(result.stores.candidates.byteLength);await result.stores.candidates.readInto(bytes);assert.ok(bytes.every(v=>v===0));}
test('Segmented D2PRL composition preserves every native raw-grid refilter, mask, overlap and exclusion',async()=>{
 const budget=new Budget(1024**3),spatial=await createNeuralSpatialRows(factory,{budget}),base=new URL('../.build/d2prl-zones/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',base)));let count=0;
 try{for(const r of ref.records){const zones=await Promise.all(r.zones.map(async z=>({...z,raw:await floats(base,z.raw)}))),result=await segmentedNeuralProjection({...r,zones,family:'d2prl',side:448},{budget,spatial,postprocess:postprocess(budget)});try{await compare(result,r.outputs);assert.equal(result.metadata.status,r.status);assert.deepEqual(result.metadata.zones.map(z=>z.status),r.zoneStatuses);assert.equal(result.metadata.min_component,r.minimum);assert.equal(budget.active,64*1024**2);count++;}finally{await result.dispose();}assert.equal(budget.total(),64*1024**2);}}finally{spatial.dispose();}assert.equal(budget.total(),0);assert.ok(count>=20);
});
test('Segmented CMSeg and all qualified MGCF variants preserve native maximum/OR composition and envelope removal',async()=>{
 const budget=new Budget(256*1024**2),spatial=await createNeuralSpatialRows(factory,{budget});let count=0;
 try{for(const suffix of ['','-mgcfdn-16','-mgcfdn','-mgcfdn-effnet','-mgcfdn-st','-cmseg-generalization','-cmseg-addnoise']){const base=new URL('../.build/segmentation-zones'+suffix+'/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',base))),[height,width]=ref.source.shape,zones=await Promise.all(ref.zones.map(async z=>({...z,raw:await floats(base,z.raw)})));
  for(const envelope of [true,false]){const result=await segmentedNeuralProjection({family:'segmentation',width,height,zones:envelope?zones:zones.filter(z=>z.kind!=='envelope'),side:ref.side??256,kind:ref.kind??'sigmoid'},{budget,spatial});try{await compare(result,envelope?ref.result:ref.withoutEnvelope);assert.equal(budget.active,64*1024**2);count++;}finally{await result.dispose();}assert.equal(budget.total(),64*1024**2);}
 }}finally{spatial.dispose();}assert.equal(budget.total(),0);assert.equal(count,14);
});
test('Partial neural composition cancels, rejects invalid modes and protects completed owned stores',async()=>{
 const budget=new Budget(100*1024**2),spatial=await createNeuralSpatialRows(factory,{budget}),raw=new Float32Array(256**2).fill(.7),args={family:'segmentation',width:113,height:93,side:256,kind:'sigmoid',zones:[{id:'a',bounds:[0,0,111,91],raw},{id:'b',bounds:[9,11,113,93],raw}]},first=await segmentedNeuralProjection(args,{budget,spatial}),before=budget.total();
 try{const abort=new AbortController();await assert.rejects(segmentedNeuralProjection(args,{budget,spatial,signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),before);
  for(const invalid of [{exclusions:[[0,0,8,8]]},{compare:true},{zones:[]},{zones:[{id:'a',bounds:[0,0,7,7],raw}]}]){await assert.rejects(segmentedNeuralProjection({...args,...invalid},{budget,spatial}),{code:'INVALID_INPUT'});assert.equal(budget.total(),before);}
  await assert.rejects(segmentedNeuralProjection(args,{budget,spatial:{run(){throw Error('spatial failure');}}}),/spatial failure/);assert.equal(budget.total(),before);
  const limit=budget.limit;budget.limit=before+1;await assert.rejects(segmentedNeuralProjection(args,{budget,spatial}),{code:'MEMORY_LIMIT'});budget.limit=limit;assert.equal(budget.total(),before);
  const retry=await segmentedNeuralProjection(args,{budget,spatial});await retry.dispose();const mask=new Uint8Array(first.stores.mask.byteLength);await first.stores.mask.readInto(mask);assert.ok(mask.some(Boolean));
 }finally{await first.dispose();await first.dispose();spatial.dispose();}assert.equal(budget.total(),0);
});

test('native projection resumes successive failed writes at committed bands without reprocessing the grid',async()=>{
 const {EngineError}=await import('../src/errors.js'),budget=new Budget(1024**3),spatial=await createNeuralSpatialRows(factory,{budget}),raw=new Float32Array(448**2*3);raw.fill(.8,0,448**2);raw.fill(.6,448**2,448**2*2);
 const args={family:'d2prl',width:1024,height:2200,mode:'whole-image',side:448,minimum:0,zones:[{id:'whole',bounds:[0,0,1024,2200],raw}]};
 let checkpoint,postCalls=0,failures=0,writeCalls=0,patched=false;const starts=[],realPost=postprocess(budget),post={run(input,hooks){postCalls++;return realPost.run(input,hooks);}},rows={run(input,hooks){starts.push([hooks.startRow,input.nearest]);return spatial.run(input,hooks);}};
 const options={budget,spatial:rows,postprocess:post,onCheckpoint(state){checkpoint=state;if(state.stores.map&&!patched){patched=true;const write=state.stores.map.write.bind(state.stores.map);state.stores.map.write=(bytes,offset)=>{writeCalls++;if(offset>0&&failures<2){failures++;throw new EngineError('MEMORY_ALLOCATION','Injected refused bank',{cause:new RangeError('Array buffer allocation failed'),details:{allocationKind:'array-buffer',requestedBytes:4*1024**2}});}return write(bytes,offset);};}}};
 let resumed,baseline;
 try{
  for(let i=0;i<2;i++){await assert.rejects(segmentedNeuralProjection(args,{...options,checkpoint}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.requestedBytes===4*1024**2&&error.cause instanceof RangeError);assert.equal(checkpoint.row,1024);assert.equal(checkpoint.zone,0);assert.equal(postCalls,1);}
  resumed=await segmentedNeuralProjection(args,{...options,checkpoint});assert.equal(postCalls,1);assert.deepEqual(starts.slice(0,3),[[0,false],[1024,false],[1024,false]]);assert.equal(writeCalls,5);
  baseline=await segmentedNeuralProjection(args,{budget,spatial,postprocess:realPost});for(const name of Object.keys(baseline.stores)){const a=new Uint8Array(baseline.stores[name].byteLength),b=new Uint8Array(a.length);await baseline.stores[name].readInto(a);await resumed.stores[name].readInto(b);assert.equal(hash(a),hash(b),name);}assert.deepEqual(resumed.metadata,baseline.metadata);
 }finally{await resumed?.dispose();await baseline?.dispose();await checkpoint?.dispose();spatial.dispose();}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});

test('retained segmentation masks stay charged until resume, cancellation releases every checkpoint owner',async()=>{
 const {EngineError}=await import('../src/errors.js'),budget=new Budget(128*1024**2),spatial=await createNeuralSpatialRows(factory,{budget}),raw=new Float32Array(256**2).fill(.7),args={family:'segmentation',width:113,height:93,side:256,kind:'sigmoid',zones:[{id:'a',bounds:[0,0,113,93],raw}]};let checkpoint;
 try{
  await assert.rejects(segmentedNeuralProjection(args,{budget,spatial:{run(){throw new EngineError('MEMORY_ALLOCATION','Injected consumer allocation',{details:{allocationKind:'array-buffer',requestedBytes:4096}});}},onCheckpoint:state=>{checkpoint=state;}}),{code:'MEMORY_ALLOCATION'});
  assert.equal(checkpoint.maskOwner.data.byteLength,256**2*4);assert.ok(budget.resourceSnapshot().domains['array-buffer'].materializedBytes>=256**2*4);const before=budget.total();
  await assert.rejects(segmentedNeuralProjection({...args,zones:[{...args.zones[0],raw:raw.slice()}]},{budget,spatial,checkpoint,onCheckpoint:state=>{checkpoint=state;}}),{code:'INVALID_INPUT'});assert.equal(budget.total(),before);
  const controller=new AbortController();await assert.rejects(segmentedNeuralProjection(args,{budget,spatial,checkpoint,onCheckpoint:state=>{checkpoint=state;},signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(checkpoint.disposed,true);assert.equal(budget.total(),64*1024**2);
 }finally{await checkpoint?.dispose();spatial.dispose();}assert.equal(budget.total(),0);
});
