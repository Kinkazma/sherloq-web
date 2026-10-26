import "../../runtime-context.js?v=0.25.0";
import {requireValue} from './errors.js';
import {readOnnxGraph,onnxInput} from './onnx-scoped-graph.js';

export const D2PRL_ROLE_SOURCE_SHA256='33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b';
export const D2PRL_ROLE_SOURCE_BYTES=19943135;
export const D2PRL_FRAGMENT_ROLE_GRAPHS=Object.freeze({
 features:Object.freeze({policy:'d2prl-fragment-role-features-v1',input:'rgb',inputShape:[1,3,448,448],output:'/Concat_21_output_0',outputShape:[1,448,56,56]}),
 classifier:Object.freeze({policy:'d2prl-fragment-role-classifier-v1',input:'/Concat_26_output_0',inputShape:[1,1344,56,56],output:'/last_mask2/last_mask2.13/Sigmoid_output_0',outputShape:[1,1,56,56]}),
});
function varint(value){requireValue(Number.isSafeInteger(value)&&value>=0,'Bounded ONNX field size required');const values=[];do{const v=value%128;value=Math.floor(value/128);values.push(v|(value?128:0));}while(value);return Uint8Array.from(values);}
function field(number,raw){return[varint(number*8+2),varint(raw.length),raw];}
function concat(parts){const length=parts.reduce((n,p)=>n+p.length,0);requireValue(Number.isSafeInteger(length),'ONNX graph size overflow');const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
/** A dependency cut of the pinned original roles graph. Every selected node and
 * initializer is copied verbatim, including native resize and BN arithmetic.
 * The caller supplies native per-fragment features/samples; no role sampling,
 * inferred output, mask or altered learned coefficient is injected here. */
export async function adaptD2PRLFragmentRoleGraph(bytes,{part}={}){
 const contract=D2PRL_FRAGMENT_ROLE_GRAPHS[part];requireValue(contract&&bytes instanceof Uint8Array&&bytes.length===D2PRL_ROLE_SOURCE_BYTES,'Pinned D2PRL role source and named graph part required');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');requireValue(sha===D2PRL_ROLE_SOURCE_SHA256,'D2PRL role graph source SHA-256 differs');
 const graph=readOnnxGraph(bytes);requireValue(graph.nodes.length===454&&graph.initializers.length===146&&JSON.stringify(graph.inputs)===JSON.stringify(['rgb','x_cor','y_cor','x_cor2','y_cor2','union']),'Pinned D2PRL role topology required');
 const producers=new Map(),initializers=new Map(graph.initializers.map(value=>[value.name,value])),neededNodes=new Set(),neededInitializers=new Set(),visiting=new Set();
 for(const node of graph.nodes)for(const output of node.outputs){requireValue(output&&!producers.has(output)&&!initializers.has(output),'Unique original D2PRL tensor producers required');producers.set(output,node);}
 function visit(name){if(!name||name===contract.input)return;if(initializers.has(name)){neededInitializers.add(name);return;}const node=producers.get(name);requireValue(node,'D2PRL role cut depends on an unavailable input: '+name);if(neededNodes.has(node))return;requireValue(!visiting.has(node),'D2PRL role dependency cycle');visiting.add(node);for(const input of node.inputs)visit(input);visiting.delete(node);neededNodes.add(node);}
 visit(contract.output);
 const input=onnxInput(contract.input,1,contract.inputShape),output=onnxInput(contract.output,1,contract.outputShape),parts=[];let ni=0,ii=0;
 for(const f of graph.fields){if(f.number===1){const node=graph.nodes[ni++];if(neededNodes.has(node))parts.push(f.raw);}else if(f.number===5){const initializer=graph.initializers[ii++];if(neededInitializers.has(initializer.name))parts.push(f.raw);}else if(![11,12,13].includes(f.number))parts.push(f.raw);}
 parts.push(...field(11,input),...field(12,output));const graphLength=parts.reduce((n,p)=>n+p.length,0),header=concat([varint(58),varint(graphLength)]),modelParts=graph.modelFields.flatMap(f=>f.number===7?[header,...parts]:[f.raw]),size=modelParts.reduce((n,p)=>n+p.length,0);requireValue(size<=bytes.length,'A D2PRL dependency cut must not grow its admitted source graph');
 const adapted=concat(modelParts);return{bytes:adapted,metadata:{policy:contract.policy,part,sourceSha256:sha,input:contract.input,inputShape:[...contract.inputShape],output:contract.output,outputShape:[...contract.outputShape],nodes:neededNodes.size,initializers:neededInitializers.size,learnedWeights:'Original initializer protobuf payloads and operator nodes retained byte for byte',scope:'Dependency extraction only; complete fragment inference and role sampling require separate qualification'}};
}
