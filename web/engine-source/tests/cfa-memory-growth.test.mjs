import test from 'node:test';import assert from 'node:assert/strict';
import {runCfaProgram,runCfaProgramHybrid} from '../src/cfa-program.js';
import {runNoiseprintPlusProgram} from '../src/noiseprint-plus-program.js';
const softplus=x=>Math.fround(Math.log1p(Math.exp(x)));
// Real Wasm growth detaches borrowed views. Operator doubles isolate transport
// ownership here; native arithmetic is qualified separately with operators.wasm.
function allocator(growAt){
 const memory=new WebAssembly.Memory({initial:1,maximum:16}),pointers=new Set(),retired=[];let next=16,calls=0;
 const module={get HEAPU8(){return new Uint8Array(memory.buffer);},get HEAPF32(){return new Float32Array(memory.buffer);},get HEAP32(){return new Int32Array(memory.buffer);},
  _malloc(bytes){if(++calls===growAt){const old=memory.buffer;memory.grow(1);retired.push(old);}const pointer=next;next+=Math.ceil(bytes/16)*16;pointers.add(pointer);return pointer;},
  _free(pointer){assert.equal(pointers.delete(pointer),true,'every allocation is released once');},
  _cfa_activate(pointer,length,mode){const values=new Float32Array(memory.buffer,pointer,length);for(let i=0;i<length;i++)values[i]=mode===0?softplus(values[i]):Math.fround(values[i]<0?.1*values[i]:values[i]);}
 };
 return {module,memory,retired,pointers,get calls(){return calls;}};
}
function gpuDouble(){
 const handles=new Set();let graphs=0,peak=0,reads=0;
 const handle=(data,dims)=>{const h={data:Float32Array.from(data),dims:[...dims],release(){assert.equal(handles.delete(h),true);h.data=null;}};handles.add(h);peak=Math.max(peak,handles.size);return h;};
 return {supportsResident:true,metrics:{test:'resident ownership'},beginModel(){},beginGraph(){graphs++;},async endGraph(){graphs--;},upload({data,dims}){return handle(data,dims);},async read(h){reads++;return h.data.slice();},async convolution({input,weights,bias,shape}){assert.deepEqual(shape,[1,1,1,1]);return handle(Float32Array.from(input.data,x=>Math.fround(x*weights[0]+bias[0])),input.dims);},get graphs(){return graphs;},get handles(){return handles.size;},get peak(){return peak;},get reads(){return reads;}};
}
const input={data:Float32Array.of(-2,-1,0,2),dims:[1,1,1,4]},identity={input:'x',output:'y',initializers:{},nodes:[{name:'identity',op:'Identity',inputs:['x'],outputs:['y'],attrs:{}}]};
for(const hybrid of [false,true])test('CFA '+(hybrid?'legacy hybrid':'CPU')+' Identity reacquires both views after malloc grows the actual Wasm memory',async()=>{
 const a=allocator(2),gpu={beginModel(){},async convolution(){throw Error('No convolution required');}};
 const result=hybrid?await runCfaProgramHybrid(a.module,identity,new Float32Array(),input,gpu):runCfaProgram(a.module,identity,new Float32Array(),input);
 assert.deepEqual([...result.data],[...input.data]);assert.deepEqual(result.dims,input.dims);assert.equal(a.retired.length,1);assert.equal(a.retired[0].byteLength,0);assert.equal(a.pointers.size,0);assert.equal(result.data.buffer.byteLength,16);
});
test('resident CFA Softplus keeps GPU tensors alive through readback and reacquires native views after output allocation grows memory',async()=>{
 const a=allocator(5),gpu=gpuDouble(),values=Float32Array.from({length:64},(_,i)=>(i-32)/16),program={input:'x',output:'y',initializers:{w:{dims:[1,1,1,1],offset:0},bias:{dims:[1],offset:1}},nodes:[{name:'conv',op:'Conv',inputs:['x','w','bias'],outputs:['c'],attrs:{}},{name:'softplus',op:'Softplus',inputs:['c'],outputs:['y'],attrs:{}}]};
 const result=await runCfaProgramHybrid(a.module,program,Float32Array.of(2,.5),{data:values,dims:[1,1,8,8]},gpu);
 assert.deepEqual([...result.data],[...values].map(x=>softplus(Math.fround(x*2+.5))));assert.equal(result.hybridConvolutions,1);assert.equal(gpu.reads,1);assert.equal(gpu.peak,2);assert.equal(gpu.handles,0);assert.equal(gpu.graphs,0);assert.equal(a.retired.length,1);assert.equal(a.retired[0].byteLength,0);assert.equal(a.pointers.size,0);
});
test('CFA CPU activation already takes fresh views after the destination grows memory',()=>{
 const a=allocator(2),program={...identity,nodes:[{...identity.nodes[0],op:'Softplus'}]},result=runCfaProgram(a.module,program,new Float32Array(),input);
 assert.deepEqual([...result.data],[...input.data].map(softplus));assert.equal(a.retired[0].byteLength,0);assert.equal(a.pointers.size,0);
});
test('Noiseprint++ arithmetic reacquires source, output and weights after allocation grows memory',()=>{
 const a=allocator(3),program={initializers:{factor:{dims:[1],offset:0}},nodes:[{op:'Relu',inputs:['x']},{op:'Mul',inputs:['x','factor']},{op:'Add',inputs:['x','factor']}]},result=runNoiseprintPlusProgram(a.module,program,Float32Array.of(2),{data:Float32Array.of(-2,0,1,2),dims:[1,1,1,4]});
 assert.deepEqual([...result.data],[2,2,4,6]);assert.equal(a.retired[0].byteLength,0);assert.equal(a.pointers.size,0);
});
