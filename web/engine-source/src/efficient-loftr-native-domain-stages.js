import {requireValue,checkAbort} from './errors.js';
import {onnxFields,readOnnxGraph,onnxInput} from './onnx-scoped-graph.js';
import {EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256} from './efficient-loftr-native-stages.js';

const decoder=new TextDecoder('utf-8',{fatal:true}),co='/matcher/coarse_matching/',fp='/matcher/fine_preprocess/';
const I=(name,shape,type=1)=>({name,type,shape}),O=name=>name+'_output_0';
const strings=(fields,number)=>fields.filter(f=>f.number===number).map(f=>decoder.decode(f.payload));
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function vi(value){let n=BigInt(value);const out=[];do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);return Uint8Array.from(out);}
const field=(n,p)=>concat([vi(n*8+2),vi(p.length),p]);
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
function graphScope(bytes){
 const fields=onnxFields(bytes),nodes=fields.filter(f=>f.number===1).map(f=>{
  const nf=onnxFields(f.payload);
  return{raw:f.payload,fields:nf,inputs:strings(nf,1),outputs:strings(nf,2),name:strings(nf,3)[0]??'',opType:strings(nf,4)[0]??''};
 });
 return{fields,nodes,inputs:fields.filter(f=>f.number===11).map(f=>strings(onnxFields(f.payload),1)[0]),initializers:fields.filter(f=>f.number===5).map(f=>({name:strings(onnxFields(f.payload),8)[0],raw:f.payload}))};
}
function children(node){
 return node.fields.filter(f=>f.number===5).flatMap(f=>{
  const a=onnxFields(f.payload);
  return a.filter(v=>v.number===6).map(v=>({name:strings(a,1)[0],scope:graphScope(v.payload)}));
 });
}
// Names captured by a native If/Loop body are inputs even though ONNX does not
// repeat them on its enclosing NodeProto. Never drop a lexical dependency.
function freeValues(scope){
 const bound=new Set([...scope.inputs,...scope.initializers.map(t=>t.name),...scope.nodes.flatMap(n=>n.outputs)]),used=new Set();
 for(const node of scope.nodes){for(const input of node.inputs)if(input)used.add(input);for(const child of children(node))for(const name of freeValues(child.scope))used.add(name);}
 for(const name of bound)used.delete(name);return used;
}

/** Literal cuts of the pinned native graph, not a domain adaptation or a session.
 * The four missing component levels are redistribution, FPN, coarse and fine.
 * Fine gather is separate so each native local map can gather its own indices
 * before the unchanged row-wise fine Loop sees pairs from the common bank.
 */
export async function deriveEfficientLoFtrNativeDomainStage(bytes,{kind,layer=0,side=0,budget,signal}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length===61657027&&typeof budget?.reserve==='function','Pinned EfficientLoFTR graph and bounded memory admission required.');checkAbort(signal);
 requireValue(await sha(bytes)===EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256,'EfficientLoFTR native graph identity changed.');checkAbort(signal);
 requireValue(Number.isInteger(layer)&&layer>=0&&layer<8&&(side===0||side===1),'Native layer0..7 and ROI side0/1 required.');
 const release=budget.reserve((bytes.length+65536)*2+4194304);let returned=false;
 try{
  const source=readOnnxGraph(bytes),guards=source.nodes.filter(n=>n.opType==='If');
  requireValue(guards.length===1&&source.nodes.at(-1)===guards[0],'Native final fine guard changed.');
  const branch=children(guards[0]).find(v=>v.name==='then_branch')?.scope;
  requireValue(branch?.nodes.length===187&&branch.nodes.at(-1)?.opType==='Loop','Native fine branch or chunk Loop changed.');
  // The branch is extracted only when requested; its native node payloads and
  // Loop body remain byte-identical. Whole-image execution still uses its If.
  const available=[...source.nodes.filter(n=>n!==guards[0]),...branch.nodes],byName=new Map(available.filter(n=>n.name).map(n=>[n.name,n])),producer=new Map(available.flatMap(n=>n.outputs.map(o=>[o,n])));
  const node=name=>{const n=byName.get(name);requireValue(n,'Missing native stage boundary '+name);return n;};
  const p='/matcher/loftr_coarse/layers.'+layer+'/',q=node(p+'aggregate/Conv'),g=n=>O('/matcher/Gather'+(n?'_'+n:''));
  let inputs,outputs;
  if(kind==='rope-native'){
   requireValue(layer%2===0,'Native RoPE exists only in self layers0/2/4/6.');
   inputs=[I(O(p+(side?'k_proj/MatMul':'q_proj/MatMul')),[1,'Hb','Wb',256])];outputs=[I(O(p+(side?'rope_pos_enc_1/Add_1':'rope_pos_enc/Add_1')),[1,'Hb','Wb',256])];
  }else if(kind==='coarse-threshold'){
   inputs=[I(O(co+'Mul'),[1,'L0','L1']),I('threshold',[])];outputs=[I(O(co+'Greater'),[1,'L0','L1'],9)];
  }else if(kind==='coarse-border'){
   inputs=[I(O(co+'Greater'),[1,'L0','L1'],9),...Array.from({length:4},(_,i)=>I(g(i+1),[],7))];outputs=[I(O(co+'Reshape_3'),[1,'L0','L1'],9)];
  }else if(kind==='coarse-mutual'){
   // Only the local-border addressing is supplied separately. Both maxima
   // still read the COMPLETE unmasked native dual-softmax matrix.
   inputs=[I(O(co+'Mul'),[1,'L0','L1']),I(O(co+'Reshape_3'),[1,'L0','L1'],9)];
   outputs=[I(O(co+'Squeeze_1'),['N'],7),I(O(co+'Reshape_5'),['N'],7),I(O(co+'Reshape_7'),['N']),I('confidence',['N'])];
  }else if(kind==='redistribute'){
   inputs=[I(q.inputs[0],[1,256,'Hc','Wc']),I(O(p+'merge/MatMul'),[1,'Tq',256])];outputs=[I(O(p+'Resize'),[1,256,'Hc','Wc'])];
  }else if(kind==='coarse-score'){
   inputs=[I('/matcher/Reshape_output_0',[1,'L0',256]),I('/matcher/Reshape_1_output_0',[1,'L1',256])];
   outputs=[I(O(co+'Div'),[1,'L0',256]),I(O(co+'Div_1'),[1,'L1',256]),I(O(co+'Mul'),[1,'L0','L1'])];
  }else if(kind==='coarse-select'){
   inputs=[I(O(co+'Mul'),[1,'L0','L1']),I('threshold',[]),...Array.from({length:5},(_,n)=>I(g(n),[],7))];
   outputs=[I(O(co+'Squeeze_1'),['N'],7),I(O(co+'Reshape_5'),['N'],7),I(O(co+'GatherND'),['N',2]),I(O(co+'GatherND_1'),['N',2]),I('confidence',['N'])];
  }else if(kind==='fine-pyramid'){
   const s=side?'_1':'',h=side?3:1;
   // Native FPN consumes Div-normalized coarse sequences, not an unnormalized
   // replacement. Native transpose/reshape and three Resize2 nodes are kept.
   inputs=[I(O(co+(side?'Div_1':'Div')),[1,'L',256]),I(g(h),[],7),I(g(h+1),[],7),I(O('/matcher/backbone/layer1.1/nonlinearity'+s+'/Relu'),[1,64,'H2','W2']),I(O('/matcher/backbone/layer2.3/nonlinearity'+s+'/Relu'),[1,128,'H4','W4'])];
   outputs=[I(O(fp+(side?'Resize_5':'Resize_2')),[1,64,'Hf','Wf'])];
  }else if(kind==='fine-gather'){
   inputs=[I(O(fp+(side?'Resize_5':'Resize_2')),[1,64,'Hf','Wf']),I(O(co+(side?'Reshape_5':'Squeeze_1')),['N'],7),I(g(side?4:2),[],7)];
   outputs=[I(O(fp+(side?'Where_1':'Where')),['N',side?100:64,64])];
  }else if(kind==='fine-rows'){
   inputs=[I(O(fp+'Where'),['N',64,64]),I(O(fp+'Where_1'),['N',100,64]),I(O(co+'GatherND'),['N',2]),I(O(co+'GatherND_1'),['N',2]),I('confidence',['N'])];
   outputs=[I('keypoints0',['N',2]),I('keypoints1',['N',2])];
  }else requireValue(false,'Unknown native EfficientLoFTR domain-stage boundary.');
  const stops=new Set(inputs.map(v=>v.name)),initByName=new Map([...source.initializers,...branch.initializers].map(t=>[t.name,t])),needed=new Set(),selected=new Set();
  function visit(name){
   if(!name||stops.has(name)||needed.has(name))return;needed.add(name);if(initByName.has(name))return;
   const n=producer.get(name);requireValue(n,'Unclosed native domain-stage value '+name);if(selected.has(n))return;
   for(const input of n.inputs)visit(input);
   for(const child of children(n))for(const capture of freeValues(child.scope))visit(capture);
   selected.add(n);
  }
  for(const output of outputs)visit(output.name);
  const nodes=available.filter(n=>selected.has(n)),initializers=[...initByName.values()].filter(t=>needed.has(t.name));
  const graph=concat([...source.fields.filter(f=>![1,5,11,12,13].includes(f.number)).map(f=>f.raw),...nodes.map(n=>field(1,n.raw)),...initializers.map(t=>field(5,t.raw)),...inputs.map(v=>field(11,onnxInput(v.name,v.type,v.shape))),...outputs.map(v=>field(12,onnxInput(v.name,v.type,v.shape)))]),output=concat(source.modelFields.map(f=>f.number===7?field(7,graph):f.raw));
  requireValue(output.length<=bytes.length+65536,'Native domain cut exceeded its bounded source size.');checkAbort(signal);
  let disposed=false;returned=true;
  return{schema:'sherloq.efficient-loftr-native-domain-stage/2',kind,layer,side,sourceSha256:EFFICIENT_LOFTR_NATIVE_SOURCE_SHA256,bytes:output,inputs,outputs,nodeCount:nodes.length,nativeNodeNames:nodes.map(n=>n.name),nativeInitializerNames:initializers.map(t=>t.name),controlFlowPolicy:kind==='fine-rows'?'unchanged-native-512-row-Loop-with-all-lexical-captures':'unchanged-native-straight-line-component',operatorPayloadPolicy:'unchanged-native-nodes-including-subgraphs-and-initializers',qualified:false,dispose(){if(!disposed){disposed=true;output.fill(0);release();}}};
 }finally{if(!returned)release();}
}
