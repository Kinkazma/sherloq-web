import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {readOnnxGraph,onnxFields,onnxNode,onnxInput,onnxInitializer} from './onnx-scoped-graph.js';

// VIG only. Context visuals Mctx and matching candidates N remain distinct.
// Pure graph construction; no product registration or learned qualification.
export const MGCFDN_VIG_WINDOW_SOURCE_SHA256='606b6d93a54142cf469fccd023b2200dfe755b190e5527c58c25aa61b847f57f';
export const MGCFDN_VIG_WINDOW_TRANSFORM='mgcfdn-vig-one-window-context-head/1';
const P='/network/multi_granularity_consistency_module/',F='features',S='sherloq_mgcf_vig_window01/';
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
export async function rewriteMgcfdnVigWindowContexts(bytes,{signal,budget,contextCells,candidateCells}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.byteLength===28780877,'Pinned MGCFDN_VIG bytes required.');checkAbort(signal);
 requireValue(await sha(bytes)===MGCFDN_VIG_WINDOW_SOURCE_SHA256,'MGCFDN_VIG SHA changed.');checkAbort(signal);
 requireValue(Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&Number.isSafeInteger(candidateCells)&&candidateCells>=40&&candidateCells<=contextCells,'Distinct admitted VIG context and candidate populations required');
 requireValue(typeof budget?.reserve==='function','Owned MGCFDN graph budget required.');
 const release=budget.reserve(bytes.length*2+4194304);let returned=false;
 try{
 const g=readOnnxGraph(bytes),byName=new Map(g.nodes.map(n=>[n.name,n])),node=n=>{const r=byName.get(P+n);requireValue(r,'Missing native MGCFDN operator '+n);return r;};
 const features=I(F,[1,640,16,16]),top=I(out('TopK'),[1,40,16,16]),finePool=I(fg('avg_pool/GlobalAveragePool'),[1,40,1,1]),asppPool=I(ap('convs.4/convs.4.0/GlobalAveragePool'),[1,640,1,1]);
 const f2=I(fg('conv_next/conv_next.2/Relu'),[1,40,16,16]),f3=I(out('Mul_6'),[1,256,16,16]),f4=I(out('Reshape_11'),[1,256,16,16]);
 const stages=[];
 // Candidate gathering is performed before this boundary, including before L2.
 // The contextual VIG backbone is a separate operator and supplies Mctx cells.
 const candidateFeatures=I(F,[1,640,1,'N']);
 stages.push(stage(g,'normalize-candidates',[candidateFeatures],[I(out('Div'),[1,640,1,'N'])]));
 // Native arithmetic/order/sigma constants and learned alpha are retained.
 // Both matching axes range over N candidates, with no per-context normalization.
 const replacements=new Map(),set=(n,ins,outs,attrs)=>replacements.set(P+n,[rewire(node(n),ins,outs,attrs)]);
 set('MatMul',[V('normalized_sources'),V('normalized_targets')],[out('MatMul')]);
 set('Sub',[V('target_y'),V('source_y')],[out('Sub')]);set('Sub_1',[V('target_x'),V('source_x')],[out('Sub_1')]);
 set('Mul_3',[out('Cast_1'),out('MatMul')],[out('Mul_3')]);set('Mul_4',[out('Mul_3'),node('Mul_4').inputs[1]],[out('Mul_4')]);
 set('TopK',[out('Mul_5'),out('Reshape_8')],[out('TopK'),out('TopK').replace('_output_0','_output_1')],[a('axis',1)]);
 // Native -3 on [1,256,16,16] denotes sources; compact [1,N,N] uses 1.
 set('ReduceSum',[out('Mul_5'),V('global_source_axis')],[out('ReduceSum')]);set('Div_3',[out('Mul_5'),out('Add')],[out('Div_3')]);
 stages.push(stage(g,'global-consistency',[I(V('normalized_sources'),[1,'N',640]),I(V('normalized_targets'),[1,640,'N']),I(V('source_x'),[1,'N',1]),I(V('source_y'),[1,'N',1]),I(V('target_x'),[1,1,'N']),I(V('target_y'),[1,1,'N'])],[I(out('TopK'),[1,40,'N']),I(out('Div_3'),[1,'N','N'])],{replacements,extraInitializers:[onnxInitializer(V('global_source_axis'),7,[1],BigInt64Array.of(1n))]}));
 // FineGrained conv_pre/GAP sees N; the visual ASPP GAP sees Mctx.
 stages.push(stage(g,'window-pools',[I(F,[1,640,1,'Mctx']),I(out('TopK'),[1,40,1,'N'])],[finePool,asppPool]));
 // All 3x3/dilated neighborhoods remain native16x16 literal contexts.
 stages.push(stage(g,'context-f3',[features,top,finePool,asppPool],[f2,f3]));
 const attentionReplacements=new Map([[P+'MatMul_1',[rewire(node('MatMul_1'),[V('f3_bank'),V('attention')],[out('MatMul_1')])]]]);
 stages.push(stage(g,'candidate-attention',[I(V('f3_bank'),[1,256,'N']),I(V('attention'),[1,'N','N'])],[I(out('MatMul_1'),[1,256,'N'])],{replacements:attentionReplacements}));
 stages.push(stage(g,'context-decode',[f2,f3,f4,top],[I('logits',[1,1,256,256]),I('probability',[1,1,256,256])]));
 const seen=new Map();for(const s of stages)for(const t of s.nativeInitializerPayloads){const raw=g.initializers.find(v=>v.name===t.name).raw;requireValue(t.raw===raw,'MGCFDN learned initializer payload changed.');seen.set(t.name,raw);}
 const initializerNames=Object.freeze([...seen.keys()]);for(const s of stages)s.nativeInitializerPayloads.length=0;seen.clear();
 let disposed=false;returned=true;return Object.freeze({transform:MGCFDN_VIG_WINDOW_TRANSFORM,variant:'mgcfdn-vig',qualifiedLearnedHead:false,sourceSha256:MGCFDN_VIG_WINDOW_SOURCE_SHA256,stages:Object.freeze(stages.map(({nativeInitializerPayloads,...s})=>Object.freeze(s))),retainedInitializerNames:initializerNames,metadata:Object.freeze({contextCells,candidateCells,poolPopulations:Object.freeze({matchingSource:candidateCells,matchingTarget:candidateCells,fineGrainedCandidate:candidateCells,asppVisualContext:contextCells}),featureCellsPerContext:256,channels:640,topk:40,dualSoftmaxAxes:Object.freeze([-1,-2]),population:'one-window-distinct-context-and-candidate-banks',poolPopulation:'FineGrained=N-candidates;ASPP=Mctx-admitted-visual-context',spatialPopulation:'one-literal-context',learnedPayloads:'original-byte-payloads',cnnEquivalence:'explicit-context-adaptation-not-masked-original-equivalence',directRectangle:'caller-must-use-unchanged-native-path'}),dispose(){if(disposed)return;disposed=true;for(const s of stages)s.bytes.fill(0);release();}});
 }finally{if(!returned)release();}
}
