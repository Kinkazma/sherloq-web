import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{Budget}from'../src/cache.js';import{createNeuralSpatialRows,NEURAL_SPATIAL_HEAP_BYTES}from'../src/neural-spatial-rows.js';import factory from'../.build/neural-spatial-bands/spatial-bands.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('Bounded projection rows preserve native full-output float bits for D2PRL and CMSeg domains',async()=>{
 const budget=new Budget(128*1024**2),engine=await createNeuralSpatialRows(factory,{budget});let cases=0;
 try{for(const family of ['d2prl','cmseg']){const base=new URL('../.build/'+family+'-spatial/',import.meta.url),r=JSON.parse(await readFile(new URL('reference.json',base)));
  for(const e of r.records){const data=await readFile(new URL(e.input.file,base)),input=new Float32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),[height,width]=e.input.shape,[outHeight,outWidth]=e.output.shape;
   for(const rowsPerBlock of [7,131]){const out=new Float32Array(outWidth*outHeight),metrics=await engine.run({input,width,height,outWidth,outHeight,nearest:!!e.nearest},{rowsPerBlock,onRows(values,{y}){out.set(values,y*outWidth);}});assert.equal(hash(out),e.output.sha256,family+'/'+e.name+'/'+rowsPerBlock);assert.equal(metrics.blocks,Math.ceil(outHeight/Math.min(outHeight,rowsPerBlock)));assert.equal(budget.total(),NEURAL_SPATIAL_HEAP_BYTES);cases++;}
  }
 }}finally{engine.dispose();}assert.equal(budget.total(),0);assert.ok(cases>=100);
});
test('Projection cancellation, consumer failure, nonfinite data and admission errors preserve input and release staging',async()=>{
 const budget=new Budget(68*1024**2),engine=await createNeuralSpatialRows(factory,{budget}),input=Float32Array.from({length:13*17},(_,i)=>Math.fround(i/223)),original=input.slice(),args={input,width:13,height:17,outWidth:123,outHeight:201,nearest:false};
 try{const abort=new AbortController();await assert.rejects(engine.run(args,{rowsPerBlock:3,signal:abort.signal,onRows(){abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),NEURAL_SPATIAL_HEAP_BYTES);
  await assert.rejects(engine.run(args,{onRows(){throw Error('consumer');}}),/consumer/);assert.equal(budget.total(),NEURAL_SPATIAL_HEAP_BYTES);
  input[1]=NaN;await assert.rejects(engine.run(args,{onRows(){assert.fail('Nonfinite result');}}),{code:'INVALID_INPUT'});input.set(original);
  budget.limit=NEURAL_SPATIAL_HEAP_BYTES+1;await assert.rejects(engine.run(args,{onRows(){assert.fail('Unadmitted output');}}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),NEURAL_SPATIAL_HEAP_BYTES);budget.limit=68*1024**2;
  const retry=await engine.run(args,{onRows(){}});assert.ok(retry.blocks);assert.deepEqual(input,original);
 }finally{engine.dispose();}assert.equal(budget.total(),0);
});
