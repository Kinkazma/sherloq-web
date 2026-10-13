import test from 'node:test';
import assert from 'node:assert/strict';
import {onnxFields,readOnnxGraph,onnxNode,onnxInput,onnxInitializer,replaceOnnxNodeInputs,rewriteOnnxGraph} from '../src/onnx-scoped-graph.js';
import {neuralGraphTransformAllowance,neuralModelSessionIdentity} from '../src/neural-scoped-model.js';

const join=(...items)=>Uint8Array.from(items.flatMap(v=>Array.from(v))),integer=n=>{const out=[];do{const b=n%128;n=Math.floor(n/128);out.push(b+(n?128:0));}while(n);return Uint8Array.from(out);};
const message=(n,b)=>join(integer(n*8+2),integer(b.length),b),string=(n,s)=>message(n,new TextEncoder().encode(s));
const fixture=()=>{
 const weights=onnxInitializer('learned',1,[4],Float32Array.of(-0,1.25,-2.5,3.75)),node=onnxNode({name:'native',opType:'Add',inputs:['rgb','learned'],outputs:['probability']}),unknown=string(19,'preserve-model-extension');
 return {weights,bytes:join(Uint8Array.of(8,8),message(7,join(message(1,node),string(2,'native-graph'),message(5,weights),message(11,onnxInput('rgb',1,[1,4])),string(14,'preserve-graph-extension'))),unknown)};
};
test('scope graph reconstruction preserves learned tensor bytes, unknown fields, source ownership and original operators',()=>{
 const {weights,bytes}=fixture(),original=bytes.slice(),parsed=readOnnxGraph(bytes);assert.equal(parsed.nodes[0].opType,'Add');assert.equal(parsed.initializers[0].name,'learned');
 const mask=onnxNode({name:'scope-gate',opType:'Mul',inputs:['rgb','scope'],outputs:['scoped-rgb']});
 const result=rewriteOnnxGraph(bytes,{prependNodes:[mask],inputs:[onnxInput('scope',1,[1,4])],rewriteNode:n=>[replaceOnnxNodeInputs(n,['scoped-rgb','learned'])]});
 const after=readOnnxGraph(result);assert.deepEqual(bytes,original);assert.deepEqual(after.inputs,['rgb','scope']);assert.deepEqual(after.nodes.map(n=>n.opType),['Mul','Add']);assert.deepEqual(after.nodes[1].inputs,['scoped-rgb','learned']);assert.deepEqual(after.initializers[0].raw,weights);
 assert.deepEqual(after.fields.filter(f=>f.number===14).map(f=>f.raw),parsed.fields.filter(f=>f.number===14).map(f=>f.raw));assert.deepEqual(after.modelFields.filter(f=>f.number===19).map(f=>f.raw),parsed.modelFields.filter(f=>f.number===19).map(f=>f.raw));
 assert.ok(parsed.initializers[0].raw.buffer===bytes.buffer,'A learned tensor is borrowed, never decoded or cloned by the parser');
});
test('unmodified graph bytes and integer/float attributes preserve exact protobuf encodings',()=>{
 const {bytes}=fixture();assert.deepEqual(rewriteOnnxGraph(bytes,{rewriteNode:()=>undefined}),bytes);
 const n=onnxNode({opType:'TopK',inputs:['x','k'],outputs:['v','i'],attributes:[{name:'axis',type:'INT',value:-1},{name:'largest',type:'INT',value:1},{name:'axes',type:'INTS',value:[-1,0]},{name:'alpha',type:'FLOAT',value:.5}]});
 const attrs=onnxFields(n).filter(f=>f.number===5).map(f=>onnxFields(f.payload));
 assert.equal(attrs[0].find(f=>f.number===3).value,2n**64n-1n);assert.equal(attrs[0].find(f=>f.number===20).value,2n);
 const float=attrs[3].find(f=>f.number===2);assert.equal(new DataView(float.payload.buffer,float.payload.byteOffset,4).getFloat32(0,true),.5);
});
test('malformed models fail closed before a rewritten model allocation',()=>{
 for(const bytes of [Uint8Array.of(58,127,1),Uint8Array.of(58,128),Uint8Array.of(15),Uint8Array.of(0),Uint8Array.of(8,...Array(10).fill(255))])assert.throws(()=>readOnnxGraph(bytes),{code:'INVALID_INPUT'});
 const {bytes}=fixture();assert.throws(()=>readOnnxGraph(join(bytes,message(7,new Uint8Array()))),/Duplicate singleton/);
 assert.throws(()=>rewriteOnnxGraph(bytes,{rewriteNode:()=>undefined,inputs:[onnxInput('scope'+'.'.repeat(1024),1,[1])],maxAddedBytes:16}),/allowance/);
 assert.throws(()=>rewriteOnnxGraph(bytes,{rewriteNode:()=>undefined,inputs:[onnxInput('rgb',1,[1,4])]}),/replace an original tensor/);
 assert.throws(()=>rewriteOnnxGraph(bytes,{rewriteNode:()=>undefined,initializers:[onnxInitializer('learned',1,[4],new Float32Array(4))]}),/replace an original tensor/);
 assert.throws(()=>onnxInitializer('bad',1,[4],new Uint8Array(4)),/shape and dtype/);
});
test('model session identity includes the scoped policy and its memory allowance is pinned',()=>{
 const sha='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59',plain={sha256:sha},scoped={...plain,graphTransform:{id:'selfdm-native-scope-v2',sourceSha256:sha,maxAddedBytes:524288}};
 assert.equal(neuralGraphTransformAllowance(plain),0);assert.equal(neuralGraphTransformAllowance(scoped),524288);assert.notEqual(neuralModelSessionIdentity(plain),neuralModelSessionIdentity(scoped));
 for(const update of [{id:'arbitrary'},{sourceSha256:'a'.repeat(64)},{maxAddedBytes:524289},{maxAddedBytes:-1}])assert.throws(()=>neuralGraphTransformAllowance({...plain,graphTransform:{...scoped.graphTransform,...update}}),{code:'INVALID_INPUT'});
});
