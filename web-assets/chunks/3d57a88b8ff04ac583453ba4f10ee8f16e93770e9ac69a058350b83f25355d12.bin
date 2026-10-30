import "../../runtime-context.js?v=0.30.0";
import{requireValue}from'./errors.js';import{readOnnxGraph,onnxInput}from'./onnx-scoped-graph.js';
const F='/network/visual_feature_extractor/Concat_4_output_0',C='/network/visual_feature_extractor/layer1/layer1.0/layer1.0.0/layer1.0.0.0/Constant_output_0';
function cat(parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){result.set(p,at);at+=p.length;}return result;}
function vi(n){const a=[];do{const b=n%128;n=Math.floor(n/128);a.push(b+(n?128:0));}while(n);return Uint8Array.from(a);}
const field=(n,b)=>cat([vi(n*8+2),vi(b.length),b]);
// The caller has already verified the complete base SHA and owns its byte
// envelope. Only original ancestor nodes and initializer raw payloads survive.
// No alternate encoder mirror, resampling, learned change or operator rewrite.
export function deriveMgcfdnProductEncoder(bytes){
 const g=readOnnxGraph(bytes),producer=new Map(g.nodes.flatMap(n=>n.outputs.map(v=>[v,n]))),initializers=new Map(g.initializers.map(v=>[v.name,v])),needed=new Set(),selected=new Set();
 function visit(value){if(!value||value==='rgb'||needed.has(value))return;needed.add(value);if(initializers.has(value))return;const node=producer.get(value);requireValue(node,'Native encoder ancestor missing: '+value);if(selected.has(node))return;for(const v of node.inputs)visit(v);selected.add(node);}
 visit(F);visit(C);const nodes=g.nodes.filter(n=>selected.has(n)),weights=g.initializers.filter(v=>needed.has(v.name));requireValue(nodes.length>0&&weights.length>0,'Native MGCFDN encoder is empty');
 const graph=cat([...g.fields.filter(f=>![1,5,11,12,13].includes(f.number)).map(f=>f.raw),...nodes.map(n=>field(1,n.raw)),...weights.map(v=>field(5,v.raw)),field(11,onnxInput('rgb',1,[1,3,256,256])),field(12,onnxInput(F,1,[1,640,40,40])),field(12,onnxInput(C,7,[]))]);
 return{bytes:cat(g.modelFields.map(f=>f.number===7?field(7,graph):f.raw)),nodeCount:nodes.length,initializerCount:weights.length};
}
