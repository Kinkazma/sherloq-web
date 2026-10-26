import "../../runtime-context.js?v=0.25.0";
// Product orchestration candidate. Arithmetic copied byte-for-byte from frozen
// head02; the diagnostic root-reservation gate is replaced by the live native
// executor's model/source/admission policy. No capability is registered here.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {MGCFDN_BASE_SHA256,MGCFDN_GLOBAL_HEAD_TRANSFORM} from './mgcfdn-global-head-graph.js';
import {mgcfdnPriorChart} from './mgcfdn-global-head-runtime.js';
const P='/network/multi_granularity_consistency_module/',F='/network/visual_feature_extractor/Concat_4_output_0',S='sherloq_mgcf_global02/';
const out=n=>P+n+'_output_0',fg=n=>out('fine_grained_module/'+n),ap=n=>out('aspp/'+n),V=n=>S+n;
const tensor=(data,dims)=>({data,dims});
export function createMgcfdnProductHeadRun(admission,{execute,encode,nativeRectangle,executionPolicy,sourceOwner,mapContexts=async(contexts,run)=>{for(const c of contexts)await run(c);},signal}={}){
 requireValue(typeof execute==='function'&&typeof encode==='function'&&typeof nativeRectangle==='function','Explicit MGCFDN native stage executors required.');admission.assertCurrent();
 requireValue(executionPolicy?.modelSha256===MGCFDN_BASE_SHA256&&executionPolicy.sourceIdentity===admission.sourceIdentity&&typeof executionPolicy.assertCurrent==='function','Admitted current MGCFDN native execution policy required.');executionPolicy.assertCurrent();
 requireValue(sourceOwner?.sourceIdentity===admission.sourceIdentity&&typeof sourceOwner.assertCurrent==='function'&&typeof sourceOwner.release==='function','A current parent-owned MGCFDN source lifetime is required.');sourceOwner.assertCurrent();
 const pending=new Set([sourceOwner]),controller=new AbortController();let running=null,disposing=null,disposed=false,result=null;
 // Producers must publish their owner synchronously at creation, before their
 // first await. A later construction/finally rejection must not orphan it.
 const own=loan=>{requireValue(loan&&typeof loan.release==='function','MGCFDN producer must register a releasable owner.');pending.add(loan);return loan;};
 const current=()=>{checkAbort(signal);checkAbort(controller.signal);requireValue(!disposed,'MGCFDN run retired.');admission.assertCurrent();sourceOwner.assertCurrent();executionPolicy.assertCurrent();};
 const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 async function retire(loan){await loan.release();pending.delete(loan);}
 async function call(label,feeds,context){current();const loan=await execute(label,feeds,{signal:combined,own,context});requireValue(pending.has(loan)&&loan.outputs,'MGCFDN stage owner must be captured before its first await.');current();return loan;}
 const read=(loan,name,size)=>{const t=loan.outputs[name],M=admission.featureCells,shapes={[F]:[1,640,40,40],[out('Div')]:[1,640,40,40],[out('TopK')]:[1,40,M],[out('Div_3')]:[1,M,M],[fg('avg_pool/GlobalAveragePool')]:[1,40,1,1],[ap('convs.4/convs.4.0/GlobalAveragePool')]:[1,640,1,1],[fg('conv_next/conv_next.2/Relu')]:[1,40,40,40],[out('Mul_6')]:[1,256,40,40],[out('MatMul_1')]:[1,256,M],logits:[1,1,256,256],probability:[1,1,256,256]};requireValue(t?.data instanceof Float32Array&&t.data.length===size&&JSON.stringify(t.dims)===JSON.stringify(shapes[name]),'Invalid MGCFDN stage result '+name);return t.data;};
 function bankPut(bank,channels,c,data,M){for(let k=0;k<channels;k++)bank.set(data.subarray(k*1600,(k+1)*1600),k*M+c.bankOffset);}
 function bankGet(bank,channels,c,M){const a=new Float32Array(channels*1600);for(let k=0;k<channels;k++)a.set(bank.subarray(k*M+c.bankOffset,k*M+c.bankOffset+1600),k*1600);return a;}
 async function work(){
  current();if(admission.empty)return Object.freeze({contexts:[],receipt:{empty:true,learnedCalls:0}});
  if(admission.directNativeRectangle){const c=admission.contexts[0],loan=await nativeRectangle(c,{signal:combined,own});requireValue(pending.has(loan),'Native rectangle owner must be captured before its first await.');current();result=loan;return loan;}
  const M=admission.featureCells,bank=new Float32Array(640*M),normal=new Float32Array(640*M),sources=new Float32Array(640*M),chart=mgcfdnPriorChart(admission);
  await mapContexts(admission.contexts,async c=>{current();const loan=await encode(c,{signal:combined,own});requireValue(pending.has(loan)&&loan.outputs,'Native encoder owner must be captured before its first await.');current();const encoded=read(loan,F,640*1600);bankPut(bank,640,c,encoded,M);const normalized=await call('normalize',{[F]:tensor(encoded,[1,640,40,40])},c);bankPut(normal,640,c,read(normalized,out('Div'),640*1600),M);await retire(normalized);await retire(loan);await controlCheckpoint(combined);});
  for(let c=0;c<640;c++)for(let k=0;k<M;k++)sources[k*640+c]=normal[c*M+k];
  const consistency=await call('global-consistency',{[V('normalized_sources')]:tensor(sources,[1,M,640]),[V('normalized_targets')]:tensor(normal,[1,640,M]),[V('source_x')]:tensor(chart.x,[1,M,1]),[V('target_x')]:tensor(chart.x,[1,1,M]),[V('source_y')]:tensor(chart.y,[1,M,1]),[V('target_y')]:tensor(chart.y,[1,1,M])}),top=read(consistency,out('TopK'),40*M),attention=read(consistency,out('Div_3'),M*M);
  const pools=await call('global-pools',{[F]:tensor(bank,[1,640,1,M]),[out('TopK')]:tensor(top,[1,40,1,M])}),fine=read(pools,fg('avg_pool/GlobalAveragePool'),40),aspp=read(pools,ap('convs.4/convs.4.0/GlobalAveragePool'),640),f2bank=new Float32Array(40*M),f3bank=new Float32Array(256*M);
  await mapContexts(admission.contexts,async c=>{const local=await call('context-f3',{[F]:tensor(bankGet(bank,640,c,M),[1,640,40,40]),[out('TopK')]:tensor(bankGet(top,40,c,M),[1,40,40,40]),[fg('avg_pool/GlobalAveragePool')]:tensor(fine,[1,40,1,1]),[ap('convs.4/convs.4.0/GlobalAveragePool')]:tensor(aspp,[1,640,1,1])},c);bankPut(f2bank,40,c,read(local,fg('conv_next/conv_next.2/Relu'),40*1600),M);bankPut(f3bank,256,c,read(local,out('Mul_6'),256*1600),M);await retire(local);await controlCheckpoint(combined);});
  await retire(pools);const mixed=await call('global-attention',{[V('f3_bank')]:tensor(f3bank,[1,256,M]),[V('attention')]:tensor(attention,[1,M,M])}),f4=read(mixed,out('MatMul_1'),256*M),outputs=[];
  await mapContexts(admission.contexts,async c=>{const decoded=await call('context-decode',{[fg('conv_next/conv_next.2/Relu')]:tensor(bankGet(f2bank,40,c,M),[1,40,40,40]),[out('Mul_6')]:tensor(bankGet(f3bank,256,c,M),[1,256,40,40]),[out('Reshape_11')]:tensor(bankGet(f4,256,c,M),[1,256,40,40]),[out('TopK')]:tensor(bankGet(top,40,c,M),[1,40,40,40])},c);outputs[c.index]=Object.freeze({context:c,logits:new Float32Array(read(decoded,'logits',65536)),probability:new Float32Array(read(decoded,'probability',65536))});await retire(decoded);await controlCheckpoint(combined);});
  await retire(mixed);await retire(consistency);current();result=Object.freeze({contexts:Object.freeze(outputs),receipt:Object.freeze({adaptation:MGCFDN_GLOBAL_HEAD_TRANSFORM,sourceIdentity:admission.sourceIdentity,domainFingerprint:admission.domainFingerprint,featureCells:M,topk:40,globalPools:2,spatialContextCount:admission.contexts.length,maskedOriginalCnnEquivalent:false})});return result;
 }
 function run(){requireValue(!disposed&&!running,'MGCFDN run is single-use.');running=work();return running;}
 function dispose(){if(disposing)return disposing;disposed=true;controller.abort();disposing=(async()=>{try{await running;}catch{}let failed=false,first;for(const loan of [...pending].filter(v=>v!==sourceOwner))try{await retire(loan);}catch(error){if(!failed){failed=true;first=error;}}if(failed)throw first;if(pending.has(sourceOwner))await retire(sourceOwner);result=null;admission.dispose();})().finally(()=>{disposing=null;});return disposing;}
 return Object.freeze({run,dispose,release:dispose,get pendingACKs(){return pending.size;}});
}
