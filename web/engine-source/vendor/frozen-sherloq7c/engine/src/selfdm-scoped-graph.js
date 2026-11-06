import {requireValue} from './errors.js';
import {readOnnxGraph,onnxNode,onnxInput,onnxInitializer,rewriteOnnxGraph,replaceOnnxNodeInputs} from './onnx-scoped-graph.js';

export const SELFDM_SCOPE_POLICY='selfdm-native-scope-v2';
export const SELFDM_SCOPE_MODEL_SHA256='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59';
export const SELFDM_SCOPE_INPUTS=Object.freeze({scientific_scope_indices:['scopeCount'],scientific_scope_output:[1,1,512,512]});
const P='/sherloq/scientific_scope',F=1,I64=7;
const constant=(name,type,dims,value)=>onnxInitializer(P+'/'+name,type,dims,value);
const node=(opType,inputs,output,suffix,attributes=[])=>onnxNode({name:P+'/'+suffix,opType,inputs,outputs:[output],attributes});
const attr=(name,value)=>({name,type:'INT',value});

/** The verified model is adapted in RAM only. Gather restricts both operands
 * before attention/correlation MatMul, making their domain N×N instead of
 *4096×4096. ScatterND restores the learned classifier's original spatial grid
 * with an O(N)index list, not a quadratic index allocation. Original weights,
 * RGB and CNN neighbourhoods remain byte-identical. There is no RGB painting.
 */
export function adaptSelfDMScopedGraph(bytes){
 const graph=readOnnxGraph(bytes),byName=new Map(graph.nodes.map(n=>[n.name,n]));
 requireValue(graph.nodes.length===420&&graph.initializers.length===94&&graph.inputs.length===1&&graph.inputs[0]==='rgb','Pinned SelfDM graph topology required');
 const expects=[];
 for(let index=0;index<3;index++){
  const attention='/network/satten_'+(index+3),corr='/network/Corr'+(index?'_'+index:''),top='/network/poolopt_on_corrmat'+(index?'_'+index:'');
  expects.push([attention+'/MatMul','MatMul'],[attention+'/softmax/Softmax','Softmax'],[attention+'/MatMul_1','MatMul'],[corr+'/MatMul','MatMul'],[corr+'/Reshape_1','Reshape'],[top+'/TopK','TopK']);
 }
 expects.push(['/Sigmoid','Sigmoid']);
 for(const [name,op]of expects)requireValue(byName.get(name)?.opType===op,'Pinned SelfDM scope operator unavailable: '+name);
 requireValue(byName.get('/Sigmoid').outputs[0]==='probability','Pinned SelfDM probability output required');
 const constants=[constant('axes0',I64,[1],BigInt64Array.of(0n)),constant('axes1',I64,[1],BigInt64Array.of(1n)),constant('pad-prefix',I64,[2],BigInt64Array.from([1n,48n])),constant('zero',F,[],Float32Array.of(0)),constant('negative',F,[],Float32Array.of(-1e9))];
 for(const c of [48,256,512]){
  constants.push(constant('scatter-shape-'+c,I64,[2],BigInt64Array.from([4096n,BigInt(c)])),constant('native-shape-'+c,I64,c===48?[4]:[3],BigInt64Array.from(c===48?[1n,48n,64n,64n]:[1n,BigInt(c),4096n])));
 }
 const prepend=[node('Unsqueeze',['scientific_scope_indices',P+'/axes1'],P+'/indices-2d','indices-2d'),node('Shape',['scientific_scope_indices'],P+'/count','count'),node('Concat',[P+'/pad-prefix',P+'/count'],P+'/padding-shape','padding-shape',[attr('axis',0)]),node('Expand',[P+'/negative',P+'/padding-shape'],P+'/padding','padding')];
 let replacements=0;
 const restore=(input,output,c,suffix)=>[
  node('Squeeze',[input,P+'/axes0'],P+'/'+suffix+'-squeezed',suffix+'-squeezed'),
  node('Transpose',[P+'/'+suffix+'-squeezed'],P+'/'+suffix+'-updates',suffix+'-updates',[{name:'perm',type:'INTS',value:[1,0]}]),
  node('Expand',[P+'/zero',P+'/scatter-shape-'+c],P+'/'+suffix+'-empty',suffix+'-empty'),
  node('ScatterND',[P+'/'+suffix+'-empty',P+'/indices-2d',P+'/'+suffix+'-updates'],P+'/'+suffix+'-scattered',suffix+'-scattered'),
  node('Transpose',[P+'/'+suffix+'-scattered'],P+'/'+suffix+'-transposed',suffix+'-transposed',[{name:'perm',type:'INTS',value:[1,0]}]),
  node('Reshape',[P+'/'+suffix+'-transposed',P+'/native-shape-'+c],output,suffix+'-native')
 ];
 const adapted=rewriteOnnxGraph(bytes,{inputs:Object.entries(SELFDM_SCOPE_INPUTS).map(([name,shape])=>onnxInput(name,name==='scientific_scope_indices'?I64:F,shape)),initializers:constants,prependNodes:prepend,rewriteNode(original){
  const nodes=[],inputs=[...original.inputs];
  const gather=(slot,axis,suffix)=>{const output=P+'/'+suffix;nodes.push(node('Gather',[inputs[slot],'scientific_scope_indices'],output,suffix,[attr('axis',axis)]));inputs[slot]=output;};
  for(let index=0;index<3;index++){
   const attention='/network/satten_'+(index+3),corr='/network/Corr'+(index?'_'+index:''),top='/network/poolopt_on_corrmat'+(index?'_'+index:'');
   if(original.name===attention+'/MatMul'){gather(0,1,'query-'+index);gather(1,2,'key-'+index);}
   else if(original.name===attention+'/MatMul_1'){
    gather(0,2,'value-'+index);const compact=P+'/attention-values-'+index;
    replacements++;return [...nodes,onnxNode({name:original.name,opType:'MatMul',inputs,outputs:[compact]}),...restore(compact,original.outputs[0],index?512:256,'attention-'+index)];
   }else if(original.name===corr+'/MatMul'){gather(0,1,'correlation-query-'+index);gather(1,2,'correlation-key-'+index);}
   else if(original.name===corr+'/Reshape_1'){
    // Native TopK is still rank48. Extra negative candidates are padding only;
    // they become0 under the unchanged native ReLU when N is below48.
    replacements++;return [node('Concat',[original.inputs[0],P+'/padding'],original.outputs[0],'correlation-padding-'+index,[attr('axis',1)])];
   }else if(original.name===top+'/TopK'){
    const compact=P+'/top-'+index;replacements++;
    return [onnxNode({name:original.name,opType:'TopK',inputs:original.inputs,outputs:[compact,original.outputs[1]],attributes:[attr('axis',1),attr('largest',1),attr('sorted',1)]}),...restore(compact,original.outputs[0],48,'top-'+index)];
   }
  }
  if(original.name==='/Sigmoid'){
   replacements++;return [onnxNode({name:original.name,opType:'Sigmoid',inputs:original.inputs,outputs:[P+'/native-probability']}),node('Mul',[P+'/native-probability','scientific_scope_output'],'probability','output')];
  }
  if(nodes.length){replacements++;return [...nodes,replaceOnnxNodeInputs(original,inputs)];}
 }});
 requireValue(replacements===16,'Complete SelfDM scope adaptation required');
 return adapted;
}
