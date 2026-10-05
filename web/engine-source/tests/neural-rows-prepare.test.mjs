import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{Budget}from'../src/cache.js';import{createSegmentedBytes}from'../src/segmented-bytes.js';import{createRgbSurface}from'../src/rgb-surface.js';import{rgbRowSource}from'../src/rgb-row-source.js';import{orientRgb}from'../src/image-headers.js';
import{createPreparation}from'../experiments/d2prl/prepare.js';import{createSegmentationPrepare}from'../experiments/segmentation/prepare.js';import factory from'../vendor/d2prl/prepare.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex'),wasmBinary=await readFile(new URL('../vendor/d2prl/prepare.wasm',import.meta.url)),d2=budget=>createPreparation(()=>factory({wasmBinary}),{budget});
async function surface(data,width,height,budget,orientation=1){const store=await createSegmentedBytes(data.length,{budget,chunkBytes:113});await store.write(data);return createRgbSurface(store,{width,height,budget,orientation});}
test('Row preparations preserve all Torch and Pillow native tensor references across arbitrary strips',async()=>{
 let count=0;for(const family of ['d2prl','segmentation']){
  const base=new URL(family==='d2prl'?'../.build/d2prl-prepare/':'../.build/segmentation-preprocess/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',base)));
  for(const r of ref.records){const bytes=new Uint8Array(await readFile(new URL(r.input.file,base))),[height,width]=r.input.shape,budget=new Budget(128*1024**2),s=await surface(bytes,width,height,budget),engine=family==='d2prl'?await d2(budget):createSegmentationPrepare({budget}),rows=rgbRowSource(s);
   try{for(const rowsPerRead of [7,131]){const output=family==='d2prl'?await engine.runRows(rows,{rowsPerRead}):await engine.run({...rows,side:r.side},{rowsPerRead});try{assert.equal(hash(family==='d2prl'?output.data:output.tensor),(r.output??r.tensor).sha256,`${family}/${r.name}/${rowsPerRead}`);if(r.rgb)assert.equal(hash(output.rgb),r.rgb.sha256);assert.ok(output.metrics.sourceReads>0);count++;}finally{output.release();}}}finally{engine.dispose();await s.dispose();}assert.equal(budget.total(),0);
  }
 }assert.ok(count>=80);
});
test('Oriented half-open ROI reads match contiguous preparations and retain source bytes',async()=>{
 const width=31,height=27,data=Uint8Array.from({length:width*height*3},(_,i)=>i*31^(i>>>3)),pixels={data,width,height,format:'rgb8'};
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(128*1024**2),s=await surface(data,width,height,budget,orientation),torch=await d2(budget),pil=createSegmentationPrepare({budget}),oriented=await orientRgb(pixels,orientation),bounds=[3,5,oriented.width-4,oriented.height-2],rows=rgbRowSource(s,bounds),crop=new Uint8Array(rows.width*rows.height*3);
  for(let y=0;y<rows.height;y++)crop.set(oriented.data.subarray(((y+5)*oriented.width+3)*3,((y+5)*oriented.width+3+rows.width)*3),y*rows.width*3);
  try{const actual=await torch.runRows(rows,{rowsPerRead:3}),expected=await torch.run({rgb:crop,width:rows.width,height:rows.height});assert.deepEqual(actual.data,expected.data);actual.release();expected.release();for(const side of [256,512]){const a=await pil.run({...rows,side},{rowsPerRead:3}),b=await pil.run({data:crop,width:rows.width,height:rows.height,side});assert.deepEqual(a.rgb,b.rgb);assert.deepEqual(a.tensor,b.tensor);a.release();b.release();}}finally{torch.dispose();pil.dispose();await s.dispose();}assert.equal(budget.total(),0);
 }
});
test('Rows preparation cancellation, malformed reads and memory refusal release windows and allow retry',async()=>{
 for(const family of ['d2prl','segmentation']){
  const budget=new Budget(128*1024**2),width=101,height=59,data=Uint8Array.from({length:width*height*3},(_,i)=>i%256),s=await surface(data,width,height,budget),original=data.slice(),engine=family==='d2prl'?await d2(budget):createSegmentationPrepare({budget}),rows=rgbRowSource(s),run=(input,hooks)=>family==='d2prl'?engine.runRows(input,hooks):engine.run({...input,side:512},hooks);
  try{
   for(const trigger of ['read','progress']){const abort=new AbortController(),input={...rows,async readRows(...args){const v=await rows.readRows(...args);if(trigger==='read')abort.abort();return v;}};await assert.rejects(run(input,{rowsPerRead:3,signal:abort.signal,onProgress:()=>{if(trigger==='progress')abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.retained,data.length);}
   let released=false;await assert.rejects(run({...rows,readRows:async()=>({pixels:{width,height:3,format:'rgb8',data:new Uint8Array(1)},release(){released=true;}})},{rowsPerRead:3}),{code:'INVALID_INPUT'});assert.equal(released,true);
   const active=budget.active,limit=budget.limit;budget.limit=budget.total()+1;await assert.rejects(run({...rows,readRows(){assert.fail('Read before admission');}}),{code:'MEMORY_LIMIT'});assert.equal(budget.active,active);budget.limit=limit;
   const result=await run(rows);assert.ok(result.metrics.sourceReads>0);result.release();assert.deepEqual(data,original);
  }finally{engine.dispose();await s.dispose();}assert.equal(budget.total(),0);
 }
});
