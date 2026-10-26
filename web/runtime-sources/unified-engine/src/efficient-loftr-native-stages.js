import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {readOnnxGraph,onnxInput} from './onnx-scoped-graph.js';

export const EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256='b52b3838bb961767a7f8b8789b8f03af355aa41a2195e501418606304e6dcb42';
const P=n=>'/matcher/loftr_coarse/layers.'+n+'/',O=n=>n+'_output_0',I=(name,shape)=>({name,type:1,shape});
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
function vi(n){n=BigInt(n);const out=[];do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);return Uint8Array.from(out);}
const field=(n,p)=>concat([vi(n*8+2),vi(p.length),p]);
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

// Literal ancestor extraction only. Native node wiring, attributes, constants,
// learned initializer payloads and model opsets are copied without rewriting.
// No graph is written to disk or session created by this function.
export async function deriveEfficientLoFtrNativeStage(bytes,{kind,layer=0,budget,signal}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length===61657027&&typeof budget?.reserve==='function','Pinned EfficientLoFTR source and graph memory admission required.');checkAbort(signal);
 requireValue(await sha(bytes)===EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256,'EfficientLoFTR native model identity changed.');checkAbort(signal);
 requireValue(Number.isInteger(layer)&&layer>=0&&layer<8,'Native EfficientLoFTR layer must remain0..7.');
 const release=budget.reserve((bytes.length+65536)*2+4194304);let returned=false;
 try{
  const g=readOnnxGraph(bytes),byName=new Map(g.nodes.map(n=>[n.name,n])),producers=new Map(g.nodes.flatMap(n=>n.outputs.map(v=>[v,n]))),node=name=>{const v=byName.get(name);requireValue(v,'Missing native EfficientLoFTR boundary '+name);return v;},p=P(layer);
  const qConv=node(p+'aggregate/Conv'),qProj=node(p+'q_proj/MatMul'),kProj=node(p+'k_proj/MatMul'),vProj=node(p+'v_proj/MatMul');
  // Native common-subexpression elimination reuses the preceding cross-layer
  // pool for self layers2/4/6. A name prefix is not a data dependency.
  const kvNorm=producers.get(kProj.inputs[0]),kvTranspose=producers.get(kvNorm?.inputs[0]),pool=producers.get(kvTranspose?.inputs[0]);
  requireValue(kvNorm?.opType==='LayerNormalization'&&kvTranspose?.opType==='Transpose'&&pool?.opType==='MaxPool'&&vProj.inputs[0]===kProj.inputs[0],'Native EfficientLoFTR KV dependency chain changed.');
  let inputs,outputs;
  if(kind==='backbone'){
   inputs=[I('image0',[1,1,'H','W'])];outputs=[I('/matcher/backbone/layer1.1/nonlinearity/Relu_output_0',[1,64,'H2','W2']),I('/matcher/backbone/layer2.3/nonlinearity/Relu_output_0',[1,128,'H4','W4']),I('/matcher/backbone/layer3.13/nonlinearity/Relu_output_0',[1,256,'H8','W8'])];
  }else if(kind==='aggregate'){
   inputs=[I(qConv.inputs[0],['B',256,'H','W'])];outputs=[I(qConv.outputs[0],['B',256,'Hb','Wb'])];
  }else if(kind==='pool'){
   inputs=[I(pool.inputs[0],['B',256,'H','W'])];outputs=[I(pool.outputs[0],['B',256,'Hb','Wb'])];
  }else if(kind==='q-project'){
   inputs=[I(qConv.outputs[0],['B',256,'Hb','Wb'])];outputs=[I(qProj.outputs[0],['B','Hb','Wb',256])];
  }else if(kind==='kv-project'){
   inputs=[I(pool.outputs[0],['B',256,'Hb','Wb'])];outputs=[I(kProj.outputs[0],['B','Hb','Wb',256]),I(vProj.outputs[0],['B','Hb','Wb',256])];
  }else if(kind==='rope-coefficients'||kind==='rope'){
   requireValue(layer===0,'Native weight-free RoPE prototype uses its exact layer0 graph.');
   const rope=p+'rope_pos_enc/',cos=node(rope+'Mul_2').inputs[1],sin=node(rope+'Mul_5').inputs[1];
   inputs=[I(qProj.outputs[0],[1,'Hb','Wb',256])];
   if(kind==='rope-coefficients')outputs=[I(cos,[1,'Hb','Wb',256]),I(sin,[1,'Hb','Wb',256])];
   else{inputs.push(I(cos,[1,'Hb','Wb',256]),I(sin,[1,'Hb','Wb',256]));outputs=[I(O(rope+'Add_1'),[1,'Hb','Wb',256])];}
  }else if(kind==='attention'){
   const q=layer%2===0?O(p+'rope_pos_enc/Add_1'):qProj.outputs[0],k=layer%2===0?O(p+'rope_pos_enc_1/Add_1'):kProj.outputs[0];
   inputs=[I(q,[1,'Hq','Wq',256]),I(k,[1,'Hk','Wk',256]),I(vProj.outputs[0],[1,'Hk','Wk',256])];outputs=[I(O(p+'attention/Transpose_4'),[1,'Tq',8,32])];
  }else if(kind==='merge'){
   const merge=node(p+'merge/MatMul');inputs=[I(merge.inputs[0],[1,'Tq',256])];outputs=[I(merge.outputs[0],[1,'Tq',256])];
  }else if(kind==='update'){
   inputs=[I(qConv.inputs[0],[1,256,'H','W']),I(O(p+'Resize'),[1,256,'H','W'])];outputs=[I(O(p+'Add'),[1,256,'H','W'])];
  }else requireValue(false,'Unknown native EfficientLoFTR stage kind.');
  const producer=new Map(g.nodes.flatMap(n=>n.outputs.map(out=>[out,n]))),inputNames=new Set(inputs.map(v=>v.name)),initNames=new Set(g.initializers.map(v=>v.name)),needed=new Set(),selected=new Set();
  function visit(value){if(!value||inputNames.has(value)||needed.has(value))return;needed.add(value);if(initNames.has(value))return;const n=producer.get(value);requireValue(n,'Unclosed native EfficientLoFTR boundary '+value);requireValue(n.opType!=='If'&&n.opType!=='Loop','Native control-flow stages require their own captured-scope receipt.');if(selected.has(n))return;for(const name of n.inputs)visit(name);selected.add(n);}
  for(const o of outputs)visit(o.name);
  const nodes=g.nodes.filter(n=>selected.has(n)),initializers=g.initializers.filter(v=>needed.has(v.name));
  const graph=concat([...g.fields.filter(f=>![1,5,11,12,13].includes(f.number)).map(f=>f.raw),...nodes.map(n=>field(1,n.raw)),...initializers.map(t=>field(5,t.raw)),...inputs.map(v=>field(11,onnxInput(v.name,v.type,v.shape))),...outputs.map(v=>field(12,onnxInput(v.name,v.type,v.shape)))]),output=concat(g.modelFields.map(f=>f.number===7?field(7,graph):f.raw));
  requireValue(output.length<=bytes.length+65536,'Native EfficientLoFTR stage exceeded its source-bound graph budget.');checkAbort(signal);
  let disposed=false;returned=true;
  return{schema:'sherloq.efficient-loftr-native-stage/1',kind,layer,sourceSha256:EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256,bytes:output,inputs,outputs,nodeCount:nodes.length,nativeNodeNames:nodes.map(n=>n.name),nativeInitializerNames:initializers.map(v=>v.name),operatorPayloadPolicy:'unchanged-native-nodes-and-initializers',qualified:false,dispose(){if(!disposed){disposed=true;output.fill(0);release();}}};
 }finally{if(!returned)release();}
}
