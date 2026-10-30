import "../../runtime-context.js?v=0.30.0";
import {d2prlInputSide} from '../experiments/d2prl/input-side.js';
import {d2prlRoleSource} from '../experiments/d2prl/role-spatial.js';
import {requireValue} from './errors.js';
import {readOnnxGraph,onnxInput} from './onnx-scoped-graph.js';
import {D2PRL_ROLE_SOURCE_SHA256,D2PRL_ROLE_SOURCE_BYTES} from './d2prl-fragment-role-graph.js';
const full=Object.freeze([1,1,448,448]),small=Object.freeze([1,1,56,56]),features=Object.freeze([1,448,56,56]),gridFull=Object.freeze([1,448,448,2]),gridSmall=Object.freeze([1,56,56,2]);
const port=(name,shape)=>Object.freeze({name,shape}),divNames=['/Div_output_0','/Div_1_output_0','/Div_2_output_0','/Div_3_output_0'];
const contract=(part,inputs,outputs)=>Object.freeze({policy:'d2prl-fragment-role-'+part+'-v1',inputs:Object.freeze(inputs),outputs:Object.freeze(outputs)});
/** Every cut names its exact tensor boundary. The foreign fragment supplies
 * only a native GridSample result; all routing, resizing, weighting and role
 * arithmetic remain the pinned model operators and initializer bytes. */
export const D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS=Object.freeze({
 normalize:contract('normalize',['x_cor','y_cor','x_cor2','y_cor2','union'].map(n=>port(n,full)),[port('/Round_output_0',full),...divNames.map(n=>port(n,full)),port('/Reshape_output_0',gridFull)]),
 routing:contract('routing',[port('/Round_output_0',full),port('/GridSample_output_0',full),...divNames.map(n=>port(n,full))],[port('/Round_1_output_0',full),port('/Round_2_output_0',full),port('/Resize_output_0',small),...Array.from({length:6},(_,i)=>port('/Resize_'+(i+1)+'_output_0',small)),...Array.from({length:3},(_,i)=>port('/Reshape_'+(i+1)+'_output_0',gridSmall))]),
 classify:contract('classify',[port('/Concat_21_output_0',features),port('/GridSample_1_output_0',features),port('/GridSample_2_output_0',features),port('/Resize_output_0',small)],[port('/Add_2_output_0',small)]),
 finish:contract('finish',[port('/Add_2_output_0',small),port('/GridSample_3_output_0',small),port('/Round_output_0',full)],[port('target',full),port('source',full)]),
 'sample-union':contract('sample-union',[port('/Round_output_0',full),port('/Reshape_output_0',gridFull)],[port('/GridSample_output_0',full)]),
 'sample-feature':contract('sample-feature',[port('/Concat_21_output_0',features),port('/Reshape_1_output_0',gridSmall)],[port('/GridSample_1_output_0',features)]),
 'sample-feature2':contract('sample-feature2',[port('/Concat_21_output_0',features),port('/Reshape_2_output_0',gridSmall)],[port('/GridSample_2_output_0',features)]),
 'sample-role':contract('sample-role',[port('/Add_2_output_0',small),port('/Reshape_3_output_0',gridSmall)],[port('/GridSample_3_output_0',small)]),
});
function varint(value){requireValue(Number.isSafeInteger(value)&&value>=0,'Bounded ONNX field size required');const values=[];do{const v=value%128;value=Math.floor(value/128);values.push(v|(value?128:0));}while(value);return Uint8Array.from(values);}
const field=(number,raw)=>[varint(number*8+2),varint(raw.length),raw];
function concat(parts){const n=parts.reduce((n,p)=>n+p.length,0);requireValue(Number.isSafeInteger(n),'ONNX graph size overflow');const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
export async function adaptD2PRLFragmentRoleRoutingGraph(bytes,{part,inputSide=448}={}){
 const side=d2prlInputSide(inputSide),source=d2prlRoleSource(side),base=Object.hasOwn(D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS,part)?D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS[part]:null,c=base&&{...base,inputs:base.inputs.map(p=>({...p,shape:p.shape.map((v,i)=>p.shape[3]===2?(i===1||i===2?v*side/448:v):(i>=2?v*side/448:v))})),outputs:base.outputs.map(p=>({...p,shape:p.shape.map((v,i)=>p.shape[3]===2?(i===1||i===2?v*side/448:v):(i>=2?v*side/448:v))}))};requireValue(c&&bytes instanceof Uint8Array&&bytes.length===source.bytes,'Pinned D2PRL role source and named routing part required');
 const sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');requireValue(sourceSha256===source.sha256,'D2PRL role graph source SHA-256 differs');
 const graph=readOnnxGraph(bytes);requireValue(graph.nodes.length===source.nodes&&graph.initializers.length===source.initializers&&JSON.stringify(graph.inputs)===JSON.stringify(['rgb','x_cor','y_cor','x_cor2','y_cor2','union']),'Pinned D2PRL role topology required');
 const boundary=new Set(c.inputs.map(p=>p.name)),initializers=new Map(graph.initializers.map(v=>[v.name,v])),producers=new Map(),nodes=new Set(),weights=new Set(),visiting=new Set(),usedInputs=new Set();
 for(const node of graph.nodes)for(const output of node.outputs){requireValue(output&&!producers.has(output)&&!initializers.has(output),'Unique original D2PRL tensor producers required');producers.set(output,node);}
 function visit(name){if(!name)return;if(boundary.has(name)){usedInputs.add(name);return;}if(initializers.has(name)){weights.add(name);return;}const n=producers.get(name);requireValue(n,'D2PRL routing cut depends on an unavailable tensor: '+name);if(nodes.has(n))return;requireValue(!visiting.has(n),'D2PRL role dependency cycle');visiting.add(n);for(const input of n.inputs)visit(input);visiting.delete(n);nodes.add(n);}
 for(const out of c.outputs)visit(out.name);requireValue(usedInputs.size===boundary.size,'Every declared native routing boundary must feed its outputs');
 const pieces=[];let ni=0,ii=0;for(const f of graph.fields){if(f.number===1){if(nodes.has(graph.nodes[ni++]))pieces.push(f.raw);}else if(f.number===5){if(weights.has(graph.initializers[ii++].name))pieces.push(f.raw);}else if(![11,12,13].includes(f.number))pieces.push(f.raw);}
 for(const p of c.inputs)pieces.push(...field(11,onnxInput(p.name,1,p.shape)));for(const p of c.outputs)pieces.push(...field(12,onnxInput(p.name,1,p.shape)));
 const header=concat([varint(58),varint(pieces.reduce((n,p)=>n+p.length,0))]),adapted=concat(graph.modelFields.flatMap(f=>f.number===7?[header,...pieces]:[f.raw]));requireValue(adapted.length<=bytes.length,'A dependency cut must not grow its pinned source model');
 return{bytes:adapted,metadata:{policy:c.policy,part,sourceSha256,inputs:c.inputs.map(p=>({name:p.name,shape:[...p.shape]})),outputs:c.outputs.map(p=>({name:p.name,shape:[...p.shape]})),nodes:nodes.size,initializers:weights.size,learnedWeights:'Original initializer payloads and operator nodes byte-identical',scope:'Dependency cut only; numerical fragment inference and cross-fragment sampling require separate qualification'}};
}
