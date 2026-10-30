import "../../runtime-context.js?v=0.30.0";
import {requireValue,EngineError} from './errors.js';
import {readOnnxGraph,onnxFields,onnxNode,onnxInput,onnxInitializer,rewriteOnnxGraph} from './onnx-scoped-graph.js';
import {prepareSegmentationScientificMask} from './segmentation-scientific-scope.js';

export const MGCF_SCOPE_TRANSFORM='mgcfdn-admitted-correlations-query-scatter/1';
const P='/network/multi_granularity_consistency_module/',S='sherloq_scientific_mgcf/',encoder=new TextEncoder();
const output=name=>P+name+'_output_0';
function varint(n){const a=[];do{const b=n&127;n=Math.floor(n/128);a.push(b|(n?128:0));}while(n);return Uint8Array.from(a);}
function stringField(number,value){const b=encoder.encode(value),a=varint(number*8+2),c=varint(b.length),r=new Uint8Array(a.length+c.length+b.length);r.set(a);r.set(c,a.length);r.set(b,a.length+c.length);return r;}
function rewire(node,inputs,outputs,attributes=[]){const replaced=new Set(attributes.map(a=>a.name)),parts=[...inputs.map(v=>stringField(1,v)),...outputs.map(v=>stringField(2,v)),...onnxFields(node.raw).filter(f=>f.number!==1&&f.number!==2&&!(f.number===5&&replaced.has(new TextDecoder().decode(onnxFields(f.payload).find(a=>a.number===1).payload)))).map(f=>f.raw),...onnxFields(onnxNode({opType:node.opType,attributes})).filter(f=>f.number===5).map(f=>f.raw)],r=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){r.set(p,at);at+=p.length;}return r;}

export function mgcfdnGridSide(model){requireValue(typeof model?.id==='string'&&model.id.startsWith('mgcfdn'),'Pinned MGCFDN model required');return ['MGCFDN','MGCFDN source/cible'].includes(model.variant)?40:16;}
export async function prepareMgcfdnScientificScope(context,{model,budget,signal}={}){
 if(context===undefined)return null;
 const side=mgcfdnGridSide(model),domain=await prepareSegmentationScientificMask(context,{rows:side,inputSide:256,budget,signal});let release;
 try{
  if(!domain.admitted)throw new EngineError('NEURAL_SCOPE_BELOW_GRID','No admissible MGCFDN correlation cells remain; refine the acquisition instead of silently discarding it.');
  release=budget.reserve(domain.admitted*16+2048);const indices=new BigInt64Array(domain.admitted);let at=0;for(let i=0;i<domain.values.length;i++)if(domain.values[i])indices[at++]=BigInt(i);
  return {indices,partial:domain.partial,side,count:domain.admitted,metadata:{...domain.metadata,stage:'source-and-target-before-dot-softmax-topk-and-global-attention',graphTransform:MGCF_SCOPE_TRANSFORM,bypassOriginal:!domain.partial,topkPadding:'Original K retained; unavailable entries are zero values and cannot identify a matching target.'},release(){release();domain.release();}};
 }catch(error){release?.();domain.release();throw error;}
}

/** Patch only the native consistency head. Original learned initializers and
 * encoder/decoder node payloads are borrowed unchanged. Query-row ScatterND is
 * O(M), never an N² array of pair indices. No scope/full-domain callers use the
 * original graph rather than this transformation. */
export function scopeMgcfdnOnnx(bytes,{side,count,topk=40}={}){
 requireValue([side,topk].every(Number.isSafeInteger)&&[16,40].includes(side)&&(count===undefined||Number.isSafeInteger(count)&&count>0&&count<side*side)&&topk===40,'Qualified partial MGCFDN grid required');
 const n=side*side,g=readOnnxGraph(bytes),byName=new Map(g.nodes.map(v=>[v.name,v]));
 const required=['MatMul','Reshape_2','Shape_1','Shape_2','Shape_3','Shape_4','Cast_1','Mul_3','Reshape_5','Mul_4','Softmax','Softmax_1','Mul_5','Reshape_6','Reshape_7','TopK','ReduceSum','Add','Div_3','Reshape_9','Reshape_10','MatMul_1'];
 for(const name of required)requireValue(byName.has(P+name),'Pinned MGCFDN consistency operator missing: '+name);
 const node=name=>byName.get(P+name),same=(name,op)=>requireValue(node(name).opType===op,'Pinned MGCFDN operator changed: '+name);
 for(const [name,op]of [['MatMul','MatMul'],['MatMul_1','MatMul'],['TopK','TopK'],['Softmax','Softmax'],['Softmax_1','Softmax'],['ReduceSum','ReduceSum'],['Div_3','Div']])same(name,op);
 requireValue(JSON.stringify(node('MatMul').inputs)===JSON.stringify([output('Reshape'),output('Reshape_1')])&&JSON.stringify(node('TopK').inputs)===JSON.stringify([output('Reshape_7'),output('Reshape_8')])&&JSON.stringify(node('MatMul_1').inputs)===JSON.stringify([output('Reshape_9'),output('Reshape_10')]),'Pinned MGCFDN correlation wiring changed');
 requireValue(!g.nodes.some(v=>v.inputs.includes(P+'TopK_output_1')),'Unexpected consumer of native MGCFDN TopK indices');
 const names=new Set([...g.inputs,...g.initializers.map(v=>v.name),...g.nodes.flatMap(v=>v.outputs)]);requireValue(![...names].some(v=>v.startsWith(S)),'MGCFDN graph is already scoped');
 const constants=[],replacements=new Map(),name=v=>S+v;
 const ints=(key,dims,values)=>{constants.push(onnxInitializer(name(key),7,dims,BigInt64Array.from(values,BigInt)));return name(key);};
 const matrixShape=ints('full_grid',[4],[1,n,side,side]),gaussianShape=ints('gaussian_shape',[3],[1,n,n]),queryShape=ints('query_index_shape',[2],[-1,1]),topkShape=ints('topk_shape',[4],[1,topk,side,side]),topkZeroShape=ints('topk_zero_shape',[2],[n,topk]),attentionZeroShape=ints('attention_zero_shape',[2],[n,256]),attentionShape=ints('attention_shape',[3],[1,256,n]);
 const N=(op,inputs,out,attrs=[])=>onnxNode({name:name(out),opType:op,inputs,outputs:[name(out)],attributes:attrs});
 const axis=value=>[{name:'axis',type:'INT',value}],perm=value=>[{name:'perm',type:'INTS',value}];
 replacements.set(P+'MatMul',[
  N('Gather',[node('MatMul').inputs[0],name('indices')],'source_features',axis(1)),
  N('Gather',[node('MatMul').inputs[1],name('indices')],'target_features',axis(2)),
  N('MatMul',[name('source_features'),name('target_features')],'dots')]);
 replacements.set(P+'Reshape_2',null);
 for(const key of ['Shape_1','Shape_2','Shape_3','Shape_4'])replacements.set(P+key,[onnxNode({name:name(key),opType:'Identity',inputs:[matrixShape],outputs:node(key).outputs})]);
 replacements.set(P+'Mul_3',[
  N('Reshape',[node('Mul_3').inputs[0],gaussianShape],'gaussian'),
  N('Gather',[name('gaussian'),name('indices')],'gaussian_sources',axis(1)),
  N('Gather',[name('gaussian_sources'),name('indices')],'gaussian_admitted',axis(2)),
  N('Mul',[name('gaussian_admitted'),name('dots')],'weighted')]);
 replacements.set(P+'Reshape_5',null);
 replacements.set(P+'Mul_4',[rewire(node('Mul_4'),[name('weighted'),node('Mul_4').inputs[1]],[name('scaled')])]);
 replacements.set(P+'Softmax',[rewire(node('Softmax'),[name('scaled')],[name('source_softmax')])]);
 replacements.set(P+'Softmax_1',[rewire(node('Softmax_1'),[name('scaled')],[name('target_softmax')])]);
 replacements.set(P+'Mul_5',[N('Mul',[name('source_softmax'),name('target_softmax')],'consistency')]);
 replacements.set(P+'Reshape_6',null);replacements.set(P+'Reshape_7',null);
 // Always append K zero-valued slots. Native consistency is nonnegative, so
 // this preserves the original K largest values for M>=K and provides only
 // zero-valued unavailable slots for M<K. Original TopK indices are unused.
 // Shape(indices) keeps one warm session across differently scoped panels.
 const paddingPrefix=ints('padding_prefix',[2],[1,topk]),topNodes=[N('Shape',[name('indices')],'count_shape'),N('Concat',[paddingPrefix,name('count_shape')],'padding_shape',axis(0)),N('ConstantOfShape',[name('padding_shape')],'padding'),N('Concat',[name('consistency'),name('padding')],'topk_input',axis(1))],topInput=name('topk_input');
 // Native TopK uses axis -3 in [1,N,H,W]; that same source axis is 1
 // after the scientific compact representation becomes [1,M,M].
 topNodes.push(rewire(node('TopK'),[topInput,node('TopK').inputs[1]],[name('topk_compact'),name('topk_indices_unused')],axis(1)),
  N('Transpose',[name('topk_compact')],'topk_transposed',perm([0,2,1])));
 const compactShape=ints('topk_compact_shape',[2],[-1,topk]);
 topNodes.push(N('Reshape',[name('topk_transposed'),compactShape],'topk_query_values'),N('Reshape',[name('indices'),queryShape],'query_indices'),N('ConstantOfShape',[topkZeroShape],'topk_zeros'),N('ScatterND',[name('topk_zeros'),name('query_indices'),name('topk_query_values')],'topk_scattered'),N('Transpose',[name('topk_scattered')],'topk_full_flat',perm([1,0])),onnxNode({name:name('topk_full'),opType:'Reshape',inputs:[name('topk_full_flat'),topkShape],outputs:[node('TopK').outputs[0]]}));
 replacements.set(P+'TopK',topNodes);
 replacements.set(P+'ReduceSum',[rewire(node('ReduceSum'),[name('consistency'),...node('ReduceSum').inputs.slice(1)],[name('mass')])]);
 replacements.set(P+'Add',[rewire(node('Add'),[name('mass'),node('Add').inputs[1]],[name('denominator')])]);
 replacements.set(P+'Div_3',[N('Div',[name('consistency'),name('denominator')],'attention')]);
 replacements.set(P+'Reshape_10',null);
 const resultShape=ints('attention_compact_shape',[2],[-1,256]);
 replacements.set(P+'MatMul_1',[
  N('Gather',[node('MatMul_1').inputs[0],name('indices')],'admitted_context',axis(2)),
  N('MatMul',[name('admitted_context'),name('attention')],'context_compact'),
  N('Transpose',[name('context_compact')],'context_transposed',perm([0,2,1])),
  N('Reshape',[name('context_transposed'),resultShape],'context_query_values'),
  N('ConstantOfShape',[attentionZeroShape],'context_zeros'),
  N('ScatterND',[name('context_zeros'),name('query_indices'),name('context_query_values')],'context_scattered'),
  N('Transpose',[name('context_scattered')],'context_full_flat',perm([1,0])),
  onnxNode({name:name('context_full'),opType:'Reshape',inputs:[name('context_full_flat'),attentionShape],outputs:node('MatMul_1').outputs})]);
 const transformed=rewriteOnnxGraph(bytes,{rewriteNode:v=>replacements.has(v.name)?replacements.get(v.name):undefined,inputs:[onnxInput(name('indices'),7,['scopeCount'])],initializers:constants});
 return {bytes:transformed,inputName:name('indices'),metadata:{id:MGCF_SCOPE_TRANSFORM,grid:[side,side],count:'scopeCount',topk,pairIndexAllocation:0,queryIndexElements:'scopeCount',learnedInitializers:'original-byte-payloads-preserved',scoring:'admitted sources and targets gathered before dot product, both softmax axes, TopK and global attention; original RGB/CNN context retained'}};
}
