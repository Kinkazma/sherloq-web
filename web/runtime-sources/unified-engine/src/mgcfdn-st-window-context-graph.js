import "../../runtime-context.js?v=0.25.0";
import{stNativeMeanGraph}from'./mgcfdn-st-native-mean-graph.js';
import {requireValue,checkAbort} from './errors.js';
import {readOnnxGraph,onnxFields,onnxNode,onnxInput,onnxInitializer} from './onnx-scoped-graph.js';

// MGCFDN_ST only. Literal parts of ONE autonomous window share its native head.
// Pure graph construction; no product registration or learned qualification.
export const MGCFDN_ST_WINDOW_SOURCE_SHA256='d7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d';
export const MGCFDN_ST_GPU_ENCODER_SHA256='d3739d6e9d540879f8fcf0f1483ffa2e5299e8c35e1d40c1916fa5ffa6d9d6ac';
export const MGCFDN_ST_WASM_HEAD_SHA256='ed18f1799651542fc0f950c26908d7e57fe2b027087df0ecea511fc91aaac784';
export const MGCFDN_ST_WINDOW_TRANSFORM='mgcfdn-st-one-window-context-head/1';
const P='/network/multi_granularity_consistency_module/',F='/network/visual_feature_extractor/Concat_4_output_0',S='sherloq_mgcf_st_window01/';
const out=n=>P+n+'_output_0',fg=n=>out('fine_grained_module/'+n),ap=n=>out('aspp/'+n);
const utf8=new TextEncoder();
function cat(parts){const r=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){r.set(p,i);i+=p.length;}return r;}
function vi(value){let n=BigInt.asUintN(64,BigInt(value));const a=[];do{const b=Number(n&127n);n>>=7n;a.push(b|(n?128:0));}while(n);return Uint8Array.from(a);}
const field=(n,p)=>cat([vi(n*8+2),vi(p.length),p]);
const str=(n,v)=>field(n,utf8.encode(v));
const a=(name,value)=>({name,type:'INT',value}),perm=value=>({name:'perm',type:'INTS',value});
const N=(op,inputs,output,attributes=[])=>onnxNode({name:S+output,opType:op,inputs,outputs:[output.startsWith('/')?output:S+output],attributes});
const V=n=>S+n;
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');

// Keep the exact operator/attribute payload and replace its boundary wiring.
function rewire(node,inputs,outputs,attributes=[]){
 const names=new Set(attributes.map(a=>a.name)),decode=new TextDecoder();
 const attrs=onnxFields(onnxNode({opType:node.opType,attributes})).filter(f=>f.number===5).map(f=>f.raw);
 return cat([...inputs.map(v=>str(1,v)),...outputs.map(v=>str(2,v)),...node.fields.filter(f=>f.number!==1&&f.number!==2&&!(f.number===5&&names.has(decode.decode(onnxFields(f.payload).find(a=>a.number===1).payload)))).map(f=>f.raw),...attrs]);
}

// Ancestor extraction stops at declared literal boundaries. It never carries
// stale native shapes into a dynamic population and never changes weight bytes.
function stage(g,label,inputs,outputs,{replacements=new Map(),extraNodes=[],extraInitializers=[]}={}){
 const nodes=g.nodes.flatMap(n=>replacements.has(n.name)?replacements.get(n.name)??[]:[n.raw]).concat(extraNodes);
 const parsed=nodes.map(raw=>{const f=onnxFields(raw),s=n=>f.filter(v=>v.number===n).map(v=>new TextDecoder().decode(v.payload));return {raw,inputs:s(1),outputs:s(2)};});
 const producer=new Map(parsed.flatMap(n=>n.outputs.map(v=>[v,n]))),inputNames=new Set(inputs.map(v=>v.name));
 const initializers=[...g.initializers,...extraInitializers.map(raw=>({raw,name:new TextDecoder().decode(onnxFields(raw).find(f=>f.number===8).payload)}))],initNames=new Set(initializers.map(v=>v.name)),needed=new Set(),selected=new Set();
 function visit(value){if(!value||inputNames.has(value)||needed.has(value))return;needed.add(value);if(initNames.has(value))return;const n=producer.get(value);requireValue(n,'MGCFDN graph boundary has no producer: '+value);if(selected.has(n))return;for(const i of n.inputs)visit(i);selected.add(n);}
 for(const o of outputs)visit(o.name);
 const ordered=[];const emitted=new Set();function emit(n){if(emitted.has(n))return;for(const i of n.inputs){const p=producer.get(i);if(selected.has(p))emit(p);}emitted.add(n);ordered.push(n.raw);}for(const n of parsed)if(selected.has(n))emit(n);
 const kept=initializers.filter(v=>needed.has(v.name));
 const graph=cat([...g.fields.filter(f=>![1,5,11,12,13].includes(f.number)).map(f=>f.raw),...ordered.map(n=>field(1,n)),...kept.map(n=>field(5,n.raw)),...inputs.map(v=>field(11,onnxInput(v.name,v.type??1,v.shape))),...outputs.map(v=>field(12,onnxInput(v.name,v.type??1,v.shape)))]);
 const bytes=cat(g.modelFields.map(f=>f.number===7?field(7,graph):f.raw));
 return {label,bytes,inputs,outputs,nodeCount:ordered.length,initializerNames:kept.map(v=>v.name),nativeInitializerPayloads:kept.filter(v=>g.initializers.includes(v)).map(v=>({name:v.name,raw:v.raw}))};
}
const I=(name,shape,type=1)=>({name,shape,type});

/** No session/inference. Reads the single pinned native model in place and
 * creates graph bytes only after its caller has admitted their owned memory. */
export async function rewriteMgcfdnStWindowContexts(bytes,{signal,budget,featureCells=1600,backend='cpu',encoderBytes}={}){
 requireValue(['cpu','webgpu'].includes(backend),'Original ST backend required');const gpu=backend==='webgpu',expectedBytes=gpu?28852562:89592572,expectedSha=gpu?MGCFDN_ST_WASM_HEAD_SHA256:MGCFDN_ST_WINDOW_SOURCE_SHA256;
 requireValue(bytes instanceof Uint8Array&&bytes.byteLength===expectedBytes,'Pinned ST CPU or nativeWASM head bytes required');checkAbort(signal);requireValue(await sha(bytes)===expectedSha,'ST head SHA changed');checkAbort(signal);if(gpu){requireValue(encoderBytes instanceof Uint8Array&&encoderBytes.byteLength===61042997,'Original split ST GPU encoder required');requireValue(await sha(encoderBytes)===MGCFDN_ST_GPU_ENCODER_SHA256,'Original ST GPU encoder SHA changed');}checkAbort(signal);
 requireValue(typeof budget?.reserve==='function','Owned MGCFDN graph budget required.');
 const release=budget.reserve((bytes.length+(gpu?encoderBytes.length:0))*2+4194304);let returned=false;
 try{
 requireValue(Number.isSafeInteger(featureCells)&&featureCells>=1600&&featureCells%1600===0,'Admitted ST bank population1600F required');
 let g=readOnnxGraph(bytes),nativeEncoder;const scalarName='/network/visual_feature_extractor/layer1/layer1.0/layer1.0.0/layer1.0.0.0/Constant_output_0';
 if(gpu){nativeEncoder=readOnnxGraph(encoderBytes);const scalar=nativeEncoder.nodes.find(n=>n.outputs.includes(scalarName));requireValue(scalar?.opType==='Constant','Native encoder scalar boundary required');g={...g,nodes:[...g.nodes,scalar]};}
 const originalInitializers=new Map([...g.initializers,...(nativeEncoder?.initializers??[])].map(t=>[t.name,t])),byName=new Map(g.nodes.map(n=>[n.name,n])),node=n=>{const r=byName.get(P+n);requireValue(r,'Missing native MGCFDN operator '+n);return r;};
 const features=I(F,[1,640,40,40]),top=I(out('TopK'),[1,40,40,40]),finePool=I(fg('avg_pool/GlobalAveragePool'),[1,40,1,1]),asppPool=I(ap('convs.4/convs.4.0/GlobalAveragePool'),[1,640,1,1]);
 const f2=I(fg('conv_next/conv_next.2/Relu'),[1,40,40,40]),f3=I(out('Mul_6'),[1,256,40,40]),f4=I(out('Reshape_11'),[1,256,40,40]);
 const stages=[];
 // This is the original640-channel encoder, including all39 native cascade means.
 // Its context is one admitted literal crop; no RGB from another crop is read.
 if(gpu)stages.push({label:'encoder',bytes:new Uint8Array(encoderBytes),inputs:[I('rgb',[1,3,256,256])],outputs:[features,I(scalarName,[],7)],nodeCount:nativeEncoder.nodes.length,initializerNames:nativeEncoder.initializers.map(t=>t.name),nativeInitializerPayloads:nativeEncoder.initializers.map(t=>({name:t.name,raw:t.raw}))});else stages.push(stage(g,'encoder',[I('rgb',[1,3,256,256])],[features]));
 stages.push(stage(g,'normalize',[features],[I(out('Div'),[1,640,40,40])]));
 // Native arithmetic/order/sigma constants and learned alpha are retained.
 // Both global axes range over M=1600F, with no per-context normalization.
 const replacements=new Map(),set=(n,ins,outs,attrs)=>replacements.set(P+n,[rewire(node(n),ins,outs,attrs)]);
 set('MatMul',[V('normalized_sources'),V('normalized_targets')],[out('MatMul')]);
 set('Sub',[V('target_y'),V('source_y')],[out('Sub')]);set('Sub_1',[V('target_x'),V('source_x')],[out('Sub_1')]);
 set('Mul_3',[out('Cast_1'),out('MatMul')],[out('Mul_3')]);set('Mul_4',[out('Mul_3'),node('Mul_4').inputs[1]],[out('Mul_4')]);
 set('TopK',[out('Mul_5'),out('Reshape_8')],[out('TopK'),out('TopK').replace('_output_0','_output_1')],[a('axis',1)]);
 // Native -3 on [1,M,40,40] denotes sources; compact [1,M,M] uses 1.
 set('ReduceSum',[out('Mul_5'),V('global_source_axis')],[out('ReduceSum')]);set('Div_3',[out('Mul_5'),out('Add')],[out('Div_3')]);
 stages.push(stage(g,'global-consistency',[I(V('normalized_sources'),[1,'M',640]),I(V('normalized_targets'),[1,640,'M']),I(V('source_x'),[1,'M',1]),I(V('source_y'),[1,'M',1]),I(V('target_x'),[1,1,'M']),I(V('target_y'),[1,1,'M'])],[I(out('TopK'),[1,40,'M']),I(out('Div_3'),[1,'M','M'])],{replacements,extraInitializers:[onnxInitializer(V('global_source_axis'),7,[1],BigInt64Array.of(1n))]}));
 // Native pointwise conv_pre and both native GAP reductions see one bank.
 const zeroTemplate=g.nodes.find(n=>n.name.startsWith('native_seg_mean_39_')&&n.opType==='ConstantOfShape');requireValue(zeroTemplate,'Pinned native ST zero/reduction prototype');
 const fineMean=stNativeMeanGraph({input:fg('conv_pre/conv_pre.2/Relu'),output:finePool.name,channels:40,plane:featureCells,prefix:S+'head_native_mean_fine_',zeroTemplate}),asppMean=stNativeMeanGraph({input:F,output:asppPool.name,channels:640,plane:featureCells,prefix:S+'head_native_mean_aspp_',zeroTemplate});
 stages.push(stage(g,'global-pools',[I(F,[1,640,1,'M']),I(out('TopK'),[1,40,1,'M'])],[finePool,asppPool],{extraNodes:[...fineMean.nodes,...asppMean.nodes],extraInitializers:[...fineMean.initializers,...asppMean.initializers]}));
 // All 3x3/dilated neighborhoods remain native40x40 literal contexts.
 stages.push(stage(g,'context-f3',[features,top,finePool,asppPool],[f2,f3]));
 const attentionReplacements=new Map([[P+'MatMul_1',[rewire(node('MatMul_1'),[V('f3_bank'),V('attention')],[out('MatMul_1')])]]]);
 stages.push(stage(g,'global-attention',[I(V('f3_bank'),[1,256,'M']),I(V('attention'),[1,'M','M'])],[I(out('MatMul_1'),[1,256,'M'])],{replacements:attentionReplacements}));
 stages.push(stage(g,'context-decode',[f2,f3,f4,top],[I('logits',[1,3,256,256]),I('probability',[1,3,256,256])]));
 const seen=new Map();for(const s of stages)for(const t of s.nativeInitializerPayloads){const raw=originalInitializers.get(t.name)?.raw;requireValue(t.raw===raw,'MGCFDN learned initializer payload changed.');seen.set(t.name,raw);}
 const initializerNames=Object.freeze([...seen.keys()]);for(const s of stages)s.nativeInitializerPayloads.length=0;seen.clear();
 let disposed=false;returned=true;return Object.freeze({transform:MGCFDN_ST_WINDOW_TRANSFORM,variant:'mgcfdn-st',qualifiedLearnedHead:false,sourceSha256:expectedSha,stages:Object.freeze(stages.map(({nativeInitializerPayloads,...s})=>Object.freeze(s))),retainedInitializerNames:initializerNames,metadata:Object.freeze({featureCellsPerContext:1600,channels:640,topk:40,nativeMeanPopulation:featureCells,poolArithmetic:'native-four-lane-four-level-cascade-fp32/1',dualSoftmaxAxes:Object.freeze([-1,-2]),population:'single-window-1600F',poolPopulation:'admitted-parts-of-this-one-window',spatialPopulation:'one-literal-context',learnedPayloads:'original-byte-payloads',cnnEquivalence:'explicit-context-adaptation-not-masked-original-equivalence',directRectangle:'caller-must-use-unchanged-native-path'}),dispose(){if(disposed)return;disposed=true;for(const s of stages)s.bytes.fill(0);release();}});
 }finally{if(!returned)release();}
}
