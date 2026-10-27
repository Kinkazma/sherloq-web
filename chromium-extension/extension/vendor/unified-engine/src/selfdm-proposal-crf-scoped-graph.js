import {requireValue} from './errors.js';
import {readOnnxGraph,onnxNode,onnxInput,onnxInitializer,rewriteOnnxGraph,replaceOnnxNodeInputs} from './onnx-scoped-graph.js';
export const SELFDM_PROPOSAL_CRF_SCOPE_POLICY='selfdm-proposal-crf-scope-v1';
export const SELFDM_PROPOSAL_CRF_SHA256='e614ae178a99af889a0fbfc58be1e281281c41934e5b16d00ad475d3952482ff';
const P='/sherloq/crf_scope',attr=(name,value)=>({name,type:'INT',value});
const node=(opType,inputs,output,suffix,attributes=[])=>onnxNode({name:P+'/'+suffix,opType,inputs,outputs:[output],attributes});
/** Native49-neighbour CRF edges are restricted BEFORE multiplying any unary
 * source probability. Retained adjacency mass is renormalized to the native
 * mass, preserving an all-admitted graph exactly. Original appearance tensors
 * and the original learned/fixed CRF constants are not changed.
 */
export function adaptSelfDMProposalCRFScopedGraph(bytes){
 const graph=readOnnxGraph(bytes),byName=new Map(graph.nodes.map(n=>[n.name,n]));
 requireValue(graph.nodes.length===232&&graph.initializers.length===241&&JSON.stringify(graph.inputs)===JSON.stringify(['unary','image','origin']),'Pinned Proposal CRF topology required');
 requireValue(byName.get('/Mul_15')?.opType==='Mul'&&byName.get('/Mul_15').inputs[0]==='/Mul_13_output_0'&&byName.get('/Add_25')?.outputs[0]==='probability','Pinned Proposal CRF message and output required');
 const kernels=new Float32Array(49*49);for(let i=0;i<49;i++)kernels[i*49+i]=1;
 const constants=[onnxInitializer(P+'/neighbours',1,[49,1,7,7],kernels),onnxInitializer(P+'/axes1',7,[1],BigInt64Array.of(1n)),onnxInitializer(P+'/axes2',7,[1],BigInt64Array.of(2n)),onnxInitializer(P+'/epsilon',1,[],Float32Array.of(1e-6))];
 const prepend=[node('Conv',['scientific_scope_coarse',P+'/neighbours'],P+'/source-neighbours','source-neighbours',[{name:'kernel_shape',type:'INTS',value:[7,7]},{name:'pads',type:'INTS',value:[3,3,3,3]},{name:'strides',type:'INTS',value:[1,1]}]),node('Unsqueeze',[P+'/source-neighbours',P+'/axes1'],P+'/source-mask','source-mask'),node('Unsqueeze',['scientific_scope_coarse',P+'/axes2'],P+'/target-mask','target-mask')];
 return rewriteOnnxGraph(bytes,{inputs:[onnxInput('scientific_scope_coarse',1,[1,1,'scopeCoarseHeight','scopeCoarseWidth']),onnxInput('scientific_scope_output',1,[1,'scopeHeight','scopeWidth'])],initializers:constants,prependNodes:prepend,rewriteNode(original){
  if(original.name==='/Mul_15')return [
   node('Mul',[original.inputs[0],P+'/source-mask'],P+'/source-adjacency','source-adjacency'),
   node('Mul',[P+'/source-adjacency',P+'/target-mask'],P+'/allowed-adjacency','allowed-adjacency'),
   node('ReduceSum',[original.inputs[0],P+'/axes2'],P+'/native-mass','native-mass',[attr('keepdims',1)]),
   node('ReduceSum',[P+'/allowed-adjacency',P+'/axes2'],P+'/allowed-mass','allowed-mass',[attr('keepdims',1)]),
   node('Max',[P+'/allowed-mass',P+'/epsilon'],P+'/denominator','denominator'),
   node('Div',[P+'/native-mass',P+'/denominator'],P+'/mass-ratio','mass-ratio'),
   node('Mul',[P+'/allowed-adjacency',P+'/mass-ratio'],P+'/normalized-adjacency','normalized-adjacency'),
   replaceOnnxNodeInputs(original,[P+'/normalized-adjacency',original.inputs[1]])
  ];
  if(original.name==='/Add_25')return [onnxNode({name:original.name,opType:'Add',inputs:original.inputs,outputs:[P+'/native-probability']}),node('Mul',[P+'/native-probability','scientific_scope_output'],'probability','output')];
 }});
}
