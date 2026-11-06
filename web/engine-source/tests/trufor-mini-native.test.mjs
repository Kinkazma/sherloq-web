import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {truforMiniTopMean,truforMiniDecode} from '../src/trufor-mini-decoder.js';
import {renderTruforMini} from '../src/trufor-mini-render.js';
import {createTruforMiniAnalyzer} from '../src/trufor-mini-analyzer.js';

const arrayField=data=>({length:data.length,async readInto(out,at=0){out.set(data.subarray(at,at+out.length));return out;}});

test('Mini top-one-percent score preserves exact rank membership, ties and small populations',async()=>{
 const budget=new Budget(4*1024**2);
 for(const n of [1,9,99,100,101,256,1029]){
  const values=Float32Array.from({length:n},(_,i)=>((i*117+31)%47)/46),count=Math.max(1,Math.ceil(n*.01));
  const ranked=Array.from(values).sort((a,b)=>b-a).slice(0,count),expected=ranked.reduce((a,b)=>a+b,0)/count;
  assert(Math.abs(await truforMiniTopMean(arrayField(values),{budget,chunkBytes:68})-expected)<1e-12);
  assert.equal(budget.total(),0);
 }
});

test('Mini score cancellation and invalid responses return every scratch reservation',async()=>{
 const budget=new Budget(1024**2),controller=new AbortController();controller.abort();
 await assert.rejects(truforMiniTopMean(arrayField(Float32Array.of(.2,.4)),{budget,signal:controller.signal}),{code:'CANCELLED'});
 await assert.rejects(truforMiniTopMean(arrayField(Float32Array.of(.2,NaN)),{budget}),/Nonfinite/);
 assert.equal(budget.total(),0);
});

// Controlled graph outputs exercise row ownership and projection independently
// of neural operator parity, which is measured separately against PyTorch.
function controlledPool(budget){
 const calls=[];let live=0;
 return {calls,get live(){return live;},async run(name,feeds,options){
  calls.push(name);let result;
  if(name==='mini-decode'){
   const [, ,h,w]=feeds.c1.dims;result=feeds.c1.data.slice(0,h*w);
  }else{
   assert.equal(name,'mini-final');const source=feeds.logit.data,[,,h,w]=feeds.logit.dims,[,oh,ow]=feeds.grid.dims;result=new Float32Array(oh*ow);
   for(let i=0;i<result.length;i++){
    const px=Math.min(w-1,Math.max(0,(feeds.grid.data[i*2]+1)*w/2-.5)),py=Math.min(h-1,Math.max(0,(feeds.grid.data[i*2+1]+1)*h/2-.5)),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),dx=px-x0,dy=py-y0;
    const logit=(source[y0*w+x0]*(1-dx)+source[y0*w+x1]*dx)*(1-dy)+(source[y1*w+x0]*(1-dx)+source[y1*w+x1]*dx)*dy;
    result[i]=1/(1+Math.exp(-logit));
   }
  }
  const release=budget.reserve(result.byteLength);live++;
  return {result:{result:{data:result}},metrics:{provider:'wasm',milliseconds:0,memoryMaximumBytes:options.workspaceBytes},release(){release();live--;}};
 }};
}

async function features(budget){
 const out=[];for(let stage=0;stage<4;stage++){const tensor=await createNeuralTensor(8,2,2,{budget,cooperation:'bounded'}),data=new Float32Array(32);if(stage===0)data.set([-2,2,4,8]);await tensor.writeRows(0,2,data);out.push(tensor);}return out;
}

test('Mini decoder interpolates logits before sigmoid and keeps caller-owned features alive',async()=>{
 const budget=new Budget(4*1024**2),input=await features(budget),retained=budget.total(),pool=controlledPool(budget);let decoded;
 try{
  decoded=await truforMiniDecode(input,3,3,{manifest:{decoder:'mini-decode',final:'mini-final'},pool,budget,storage:'memory',windowBytes:128});
  const actual=await decoded.map.readInto(new Float32Array(9)),logits=[-2,0,2,1,3,5,4,6,8];
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-1/(1+Math.exp(-logits[i])))<2e-6);
  assert(Math.abs(decoded.score-actual[8])<1e-12);assert.equal(pool.live,0);
  assert.deepEqual(pool.calls,['mini-decode','mini-decode','mini-final','mini-final','mini-final']);
  await decoded.release();assert.equal(budget.total(),retained);
  assert.equal((await input[0].readInto(new Float32Array(1)))[0],-2);
 }finally{await decoded?.release();for(const tensor of input)await tensor.dispose();assert.equal(budget.total(),0);}
});

test('Mini decoder cancellation retires partial outputs without retiring input banks',async()=>{
 const budget=new Budget(4*1024**2),input=await features(budget),retained=budget.total(),pool=controlledPool(budget),controller=new AbortController();
 try{
  await assert.rejects(truforMiniDecode(input,3,3,{manifest:{decoder:'mini-decode',final:'mini-final'},pool,budget,storage:'memory',windowBytes:128,signal:controller.signal,onProgress(){controller.abort();}}),{code:'CANCELLED'});
  assert.equal(pool.live,0);assert.equal(budget.total(),retained);
 }finally{for(const tensor of input)await tensor.dispose();assert.equal(budget.total(),0);}
});

test('Mini retained-map rendering has identical full/window pixels and never exposes confidence',async()=>{
 const budget=new Budget(4*1024**2),tensor=await createNeuralTensor(1,7,9,{budget,cooperation:'bounded'});let full,tile;
 try{
  await tensor.writeRows(0,7,Float32Array.from({length:63},(_,i)=>i/62));const retained=budget.total(),result={data:{width:9,height:7,map:tensor,noiseprint_pp:tensor}};
  for(const view of ['map','noiseprint_pp']){
   full=await renderTruforMini(result,view,undefined,{budget});tile=await renderTruforMini(result,view,{x:2,y:1,width:4,height:3},{budget});
   for(let y=0;y<3;y++)assert.deepEqual(tile.data.subarray(y*12,(y+1)*12),full.data.subarray(((y+1)*9+2)*3,((y+1)*9+6)*3));
   full.release();tile.release();full=null;tile=null;assert.equal(budget.total(),retained);
  }
  await assert.rejects(renderTruforMini(result,'confidence',undefined,{budget}),/Unknown/);
 }finally{full?.release();tile?.release();await tensor.dispose();assert.equal(budget.total(),0);}
});

test('Mini analyzer validates the native contract before any neural worker starts',async()=>{
 const budget=new Budget(32*1024**2),identity='a'.repeat(64),asset={bytes:1,sha256:identity};
 const analyzer=createTruforMiniAnalyzer({segments:{schema:1,method:'trufor-mini',rgbDivisor:256,noiseprint:'npp',decoder:'decoder',final:'final',score:'mean_top_1_percent_localization',stateSha256:identity,assets:{npp:asset,decoder:asset,final:asset}},budget,runtimes:{},resourceHints:{hardwareConcurrency:1}});
 try{
  await assert.rejects(analyzer.analyze({surface:{descriptor:{format:'rgb8',width:29,height:29}}},{threshold:.5}),/no scientific tuning/);
  await assert.rejects(analyzer.analyze({surface:{descriptor:{format:'rgb8',width:28,height:29}}}),/29 by 29/);
  await analyzer.clearCache();assert.equal(budget.total(),0);
 }finally{await analyzer.dispose();assert.equal(budget.total(),0);}
 await assert.rejects(analyzer.analyze({}),{code:'DISPOSED'});
});
