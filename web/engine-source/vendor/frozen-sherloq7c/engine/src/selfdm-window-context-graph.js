import {readOnnxGraph,onnxFields,onnxNode,onnxInput,onnxInitializer,replaceOnnxNodeInputs} from './onnx-scoped-graph.js';
import {requireValue} from './errors.js';
export const SELFDM_WINDOW_MODEL_SHA256='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59';
export const SELFDM_WINDOW_GRAPH_POLICY='selfdm-native-window-context-bank/2';
export const SELFDM_WINDOW_FEATURES=Object.freeze(['/network/FeatureL2Norm/Div_output_0','/network/FeatureL2Norm_1/Div_output_0','/network/FeatureL2Norm_2/Div_output_0']);
export const SELFDM_WINDOW_ATTENDED=Object.freeze([3,4,5].map(i=>'/network/satten_'+i+'/Add_output_0'));
export const SELFDM_WINDOW_QUERIES='/sherloq/selfdm_window/query_indices';
export const SELFDM_WINDOW_BANK='/network/Concat_output_0';
export const SELFDM_WINDOW_GLOBAL='/network/classifier/global_avg_pool/global_avg_pool.3/Relu_output_0';
const encoder=new TextEncoder(),P='/sherloq/selfdm_window';
function cat(parts){const n=parts.reduce((sum,p)=>sum+p.length,0);requireValue(Number.isSafeInteger(n),'Native graph size overflow');const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function vint(value){let n=BigInt(value);const out=[];do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);return Uint8Array.from(out);}
function field(number,bytes){return cat([vint(number*8+2),vint(bytes.length),bytes]);}
const attr=(name,value)=>({name,type:'INT',value});
const node=(opType,inputs,output,suffix,attributes=[])=>onnxNode({name:P+'/'+suffix,opType,inputs,outputs:[output],attributes});
const io=(names,channels,height,width)=>names.map((name,i)=>({name,dims:[1,channels[i],height,width]}));
const nativeFeatures=()=>io(SELFDM_WINDOW_FEATURES,[256,512,512],64,64);
function specification(stage){
 if(stage==='encoder')return{inputs:[{name:'rgb',dims:[1,3,512,512]}],outputs:nativeFeatures()};
 const queries={name:SELFDM_WINDOW_QUERIES,type:7,dims:['nativeQueries']};
 if(stage==='attention')return{inputs:[...io(SELFDM_WINDOW_FEATURES,[256,512,512],1,'nativeCandidates'),queries],outputs:io(SELFDM_WINDOW_ATTENDED,[256,512,512],1,'nativeQueries')};
 if(stage==='relations')return{inputs:[...io(SELFDM_WINDOW_ATTENDED,[256,512,512],1,'nativeCandidates'),queries],outputs:[{name:SELFDM_WINDOW_BANK,dims:[1,144,1,'nativeQueries']}]};
 if(stage==='global')return{inputs:[{name:SELFDM_WINDOW_BANK,dims:[1,144,1,'nativeCandidates']}],outputs:[{name:SELFDM_WINDOW_GLOBAL,dims:[1,48,1,1]}]};
 requireValue(stage==='decoder','Unknown native SelfDM window graph stage');return{inputs:[{name:SELFDM_WINDOW_BANK,dims:[1,144,64,64]},{name:SELFDM_WINDOW_GLOBAL,dims:[1,48,1,1]}],outputs:[{name:'probability',dims:[1,1,512,512]}]};
}
/** Five cuts of the SAME verified Float32 model. Learned initializer messages
 * and all retained native math nodes are copied byte-for-byte. Only relation
 * shape constants become the actual common-bank population, and the existing
 * scoped negative padding keeps native TopK48 when fewer than48 centres exist.
 * Each RGB context retains its native512/64 grids; no complete head is run on
 * an isolated fragment. One common ASPP mean feeds every spatial decoder. */
export function buildSelfDMWindowContextGraph(bytes,stage,{budget}={}){
 requireValue(bytes instanceof Uint8Array&&budget?.reserve,'Verified original SelfDM bytes and admitted graph owner required');const free=budget.reserve(bytes.length+524288);try{return compile(bytes,stage,free);}catch(error){free();throw error;}
}
/** Called only after the existing native graph pool admitted the original plus
 * derived model allowance and fetched the exact verified source asset. */
export function adaptSelfDMWindowContextGraph(bytes,stage,{admittedBytes}={}){
 requireValue(bytes instanceof Uint8Array&&Number.isSafeInteger(admittedBytes)&&admittedBytes>=bytes.length+524288,'Native worker model admission must precede context graph allocation');return compile(bytes,stage,()=>{});
}
function compile(bytes,stage,free){
  const graph=readOnnxGraph(bytes);requireValue(graph.nodes.length===420&&graph.initializers.length===94&&graph.inputs.length===1&&graph.inputs[0]==='rgb','Pinned native SelfDM420/94 graph required');
  const spec=specification(stage),external=new Set(spec.inputs.map(v=>v.name)),initializers=new Map(graph.initializers.map(v=>[v.name,v])),producer=new Map(graph.nodes.flatMap(n=>n.outputs.map(name=>[name,n]))),needed=new Set(),weights=new Set();
  function visit(name){if(!name||external.has(name))return;if(initializers.has(name)){weights.add(name);return;}const n=producer.get(name);requireValue(n,'Missing native SelfDM tensor '+name);if(needed.has(n))return;needed.add(n);for(const input of n.inputs)visit(input);}
  for(const output of spec.outputs)visit(output.name);
  const constants=[],prefix=[],shapeChanges=[],nativeNodes=[],parts=[];
  if(stage==='attention'||stage==='relations'){
   const source=(stage==='attention'?SELFDM_WINDOW_FEATURES:SELFDM_WINDOW_ATTENDED)[0];
   constants.push(onnxInitializer(P+'/index3',7,[],BigInt64Array.of(3n)),onnxInitializer(P+'/index0',7,[],BigInt64Array.of(0n)),onnxInitializer(P+'/one',7,[],BigInt64Array.of(1n)),onnxInitializer(P+'/query-prefix',7,[2],BigInt64Array.from([1n,-1n])));
   prefix.push(node('Shape',[source],P+'/shape','shape'),node('Gather',[P+'/shape',P+'/index3'],P+'/population','population',[attr('axis',0)]),node('Shape',[SELFDM_WINDOW_QUERIES],P+'/query-count','query-count'),node('Gather',[P+'/query-count',P+'/index0'],P+'/queries','queries',[attr('axis',0)]),node('Concat',[P+'/query-prefix',P+'/query-count'],P+'/query-shape','query-shape',[attr('axis',0)]));
   if(stage==='attention')for(let i=0;i<3;i++)prefix.push(node('Gather',[SELFDM_WINDOW_FEATURES[i],SELFDM_WINDOW_QUERIES],P+'/query-feature-'+i,'query-feature-'+i,[attr('axis',3)]));
   else{constants.push(onnxInitializer(P+'/padding-prefix',7,[3],BigInt64Array.from([1n,48n,1n])),onnxInitializer(P+'/negative',1,[],Float32Array.of(-1e9)));prefix.push(node('Concat',[P+'/padding-prefix',P+'/query-count'],P+'/padding-shape','padding-shape',[attr('axis',0)]),node('Expand',[P+'/negative',P+'/padding-shape'],P+'/padding','padding'));}
  }
  const encoded=[];
  for(const n of graph.nodes){if(!needed.has(n))continue;nativeNodes.push(n.name);let replacement;
   if(stage==='attention'||stage==='relations')for(let i=0;i<3;i++){
    const base=stage==='attention'?'/network/satten_'+(i+3):'/network/Corr'+(i?'_'+i:'');
    for(const[suffix,value]of [['Constant_2',P+'/one'],['Constant_3',P+'/queries'],['Constant_4',P+'/population']])if(n.name===base+'/'+suffix){requireValue(n.opType==='Constant','Native relation shape constant required');replacement=[node('Identity',[value],n.outputs[0],'shape-'+shapeChanges.length)];shapeChanges.push(n.name);}
    if(stage==='attention'){
     if(n.name===base+'/query_conv/Conv'){requireValue(n.inputs[0]===SELFDM_WINDOW_FEATURES[i],'Original native query input required');replacement=[replaceOnnxNodeInputs(n,[P+'/query-feature-'+i,...n.inputs.slice(1)])];}
     if(n.name===base+'/Reshape')replacement=[replaceOnnxNodeInputs(n,[n.inputs[0],P+'/query-shape'])];
     if(n.name===base+'/Add'){requireValue(n.inputs[1]===SELFDM_WINDOW_FEATURES[i],'Native residual input required');replacement=[replaceOnnxNodeInputs(n,[n.inputs[0],P+'/query-feature-'+i])];}
    }else{
     if(n.name===base+'/MatMul'){requireValue(n.opType==='MatMul','Native correlation matrix required');const gathered=P+'/correlation-queries-'+i;replacement=[node('Gather',[n.inputs[1],SELFDM_WINDOW_QUERIES],gathered,'correlation-queries-'+i,[attr('axis',2)]),replaceOnnxNodeInputs(n,[n.inputs[0],gathered])];}
     if(n.name===base+'/Reshape_1'){requireValue(n.opType==='Reshape','Native correlation layout required');const native=P+'/correlation-'+i;replacement=[cat([...n.fields.filter(f=>f.number!==2).map(f=>f.raw),field(2,encoder.encode(native))]),node('Concat',[native,P+'/padding'],n.outputs[0],'top48-padding-'+i,[attr('axis',1)])];}
    }
   }
   encoded.push(...(replacement??[n.raw]));
  }
  requireValue(!['attention','relations'].includes(stage)||shapeChanges.length===9,'All three native attention/correlation layouts must use the same actual bank');
  for(const n of [...prefix,...encoded])parts.push(field(1,n));
  const originalWeightFields=graph.fields.filter(f=>f.number===5);for(let i=0;i<graph.initializers.length;i++)if(weights.has(graph.initializers[i].name))parts.push(originalWeightFields[i].raw);
  for(const value of constants)parts.push(field(5,value));
  for(const value of spec.inputs)parts.push(field(11,onnxInput(value.name,value.type??1,value.dims)));
  for(const value of spec.outputs)parts.push(field(12,onnxInput(value.name,value.type??1,value.dims)));
  parts.push(field(2,encoder.encode('SelfDM native window '+stage)));
  const length=parts.reduce((sum,p)=>sum+p.length,0),header=cat([vint(58),vint(length)]),out=cat(graph.modelFields.flatMap(f=>f.number===7?[header,...parts]:[f.raw]));requireValue(out.length<=bytes.length+524288,'Native stage exceeds admitted graph bound');
  let released=false;return{bytes:out,metadata:{policy:SELFDM_WINDOW_GRAPH_POLICY,stage,originalNodes:420,originalInitializers:94,nativeNodes,nativeInitializers:[...weights],inputs:spec.inputs,outputs:spec.outputs,shapeChanges,learnedWeightsChanged:false,nativeOperatorFormulasChanged:false,domainAdapted:['attention','relations','global'].includes(stage),relationTopK:48,commonGlobalBranch:SELFDM_WINDOW_GLOBAL},release(){if(released)return;released=true;free();}};
}
