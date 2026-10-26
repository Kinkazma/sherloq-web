import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createCmsegWindowCnnRuntime,CMSEG_WINDOW_NATIVE_SHAPES as shapes} from '../experiments/segmentation/cmseg-window-cnn-runtime.js';
const MiB=1024**2;
const tensors=()=>Object.fromEntries(shapes.map((shape,i)=>['x'+(i+1),{shape,data:new Float32Array(shape.reduce((a,b)=>a*b,1)).fill(Math.fround((i+1)/10))}]));
const base={id:'controlled-native-stages-no-NN',bytes:32,assetBytes:64,correlationGpuOnly:true};
function factory({refuse=()=>false}={}){
 const calls=[],workers=[];return{calls,workers,create(){const worker={postMessage(data){calls.push(data);queueMicrotask(()=>{const values=data.kind==='decoder'?{probability:{shape:[1,1,512,512],data:new Float32Array(512**2).fill(.25)}}:data.kind==='bypass'?{x1:{shape:shapes[0],data:data.input}}:tensors();worker.onmessage({data:{ok:true,values,heapBytes:16*MiB,ort:{controlled:true},timings:{inferenceMs:0}}});});},terminate(){if(refuse())throw 0;worker.dead=true;}};workers.push(worker);return worker;}};
}
test('CMSeg CNN stage facade preserves all native grids, existing WASM encoder and warm decoder without NN',async()=>{
 const budget=new Budget(2*1024*MiB),f=factory(),runtime=createCmsegWindowCnnRuntime({budget,model:base,modelUrl:'http://example.invalid/model.json',backend:'webgpu',maxWorkers:10,workerFactory:f.create});let encoded,decoded;
 try{const input=new Float32Array(3*512**2).fill(.125);encoded=await runtime.encode(input);assert.equal(f.calls[0].kind,'encoder');assert.strictEqual(f.calls[0].input,input);for(let i=0;i<5;i++)assert.deepEqual(encoded.values['x'+(i+1)].shape,shapes[i]);
  const feeds={x1:encoded.values.x1,x5:encoded.values.x5,c2:{shape:[1,24,128,128],data:new Float32Array(24*128**2)},c3:{shape:[1,32,64,64],data:new Float32Array(32*64**2)},c4:{shape:[1,96,32,32],data:new Float32Array(96*32**2)}};decoded=await runtime.decode(feeds);assert.equal(f.calls[1].kind,'decoder');assert.strictEqual(f.calls[1].inputs,feeds);assert.equal(f.workers.length,1);assert.equal(runtime.snapshot().workerReuses,1);assert.equal(runtime.snapshot().nativeThreadsPerOrtSession,1);assert.equal(runtime.snapshot().requestedMaxWorkers,10);assert.deepEqual(decoded.values.probability.data,new Float32Array(512**2).fill(.25));
 }finally{encoded?.release();decoded?.release();await runtime.release();}assert.equal(budget.total(),0);
});
for(const backend of ['cpu','webgpu'])test('CMSeg generalization keeps its own custom backbone provider and bypass tensor ('+backend+',0NN)',async()=>{
 const budget=new Budget(2*1024*MiB),f=factory(),native=tensors(),bypass=new Float32Array(16*256**2).fill(.3);let releases=0,disposals=0,argumentsSeen;
 const runtime=createCmsegWindowCnnRuntime({budget,model:{...base,backbone:{bytes:16,file:'backbone.json'}},modelUrl:'http://example.invalid/model.json',backend,maxWorkers:10,workerFactory:f.create,readAsset:async()=>new TextEncoder().encode('{}'),backboneFactory:async options=>{argumentsSeen=options;return{async run(){return{values:{...native,bypass:{data:bypass}},release(){releases++;}};},dispose(){disposals++;}};}});let result;
 try{result=await runtime.encode(new Float32Array(3*512**2));assert.equal(argumentsSeen.backend,backend);assert.equal(argumentsSeen.maxWorkers,10);assert.equal(f.calls[0].kind,'bypass');assert.strictEqual(f.calls[0].input,bypass);for(const key of ['x2','x3','x4','x5'])assert.strictEqual(result.values[key].data,native[key].data);assert.equal(releases,1);assert.equal(disposals,1);}finally{result?.release();await runtime.release();}assert.equal(budget.total(),0);
});
test('CMSeg refused backbone cleanup keeps owned credits, preserves primary0 and publishes no unreturned output',async()=>{
 const budget=new Budget(2*1024*MiB),f=factory();let allow=false,disposals=0;
 const runtime=createCmsegWindowCnnRuntime({budget,model:{...base,backbone:{bytes:16,file:'backbone.json'}},modelUrl:'http://example.invalid/model.json',backend:'webgpu',maxWorkers:10,workerFactory:f.create,readAsset:async()=>new TextEncoder().encode('{}'),backboneFactory:async()=>({async run(){return{values:{...tensors(),bypass:{data:new Float32Array(16*256**2)}},release(){}};},dispose(){disposals++;if(!allow)throw 0;}})});
 let rejected=false;try{await runtime.encode(new Float32Array(3*512**2));}catch(error){rejected=true;assert.equal(error,0);}assert.ok(rejected);assert.ok(budget.total()>0);assert.equal(runtime.snapshot().outputLoans,0);assert.equal(f.calls.length,0);assert.ok(disposals>=2);allow=true;await runtime.release();assert.equal(budget.total(),0);
});
test('CMSeg native Worker terminate refusal retains the warm session credit until retry (0NN)',async()=>{
 const budget=new Budget(2*1024*MiB);let refuses=true;const f=factory({refuse:()=>refuses}),runtime=createCmsegWindowCnnRuntime({budget,model:base,modelUrl:'http://example.invalid/model.json',backend:'webgpu',maxWorkers:10,workerFactory:f.create});const result=await runtime.encode(new Float32Array(3*512**2));result.release();const before=budget.total();let rejected=false;try{await runtime.release();}catch(error){rejected=true;assert.equal(error,0);}assert.ok(rejected);assert.equal(budget.total(),before);assert.equal(f.workers[0].dead,undefined);refuses=false;await runtime.release();assert.equal(budget.total(),0);assert.equal(f.workers[0].dead,true);
});
