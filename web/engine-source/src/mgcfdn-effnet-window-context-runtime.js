import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {MGCFDN_EFFNET_WINDOW_SOURCE_SHA256,MGCFDN_EFFNET_WINDOW_TRANSFORM} from './mgcfdn-effnet-window-context-graph.js';
const P='/network/multi_granularity_consistency_module/',F='/network/visual_feature_extractor/Concat_3_output_0',S='sherloq_mgcf_effnet_window01/';
const out=n=>P+n+'_output_0',fg=n=>out('fine_grained_module/'+n),ap=n=>out('aspp/'+n),V=n=>S+n;
const digest=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(v=>v.toString(16).padStart(2,'0')).join('');
const tensor=(data,dims)=>({data,dims}),keyFields=p=>[p.windowFingerprint,p.identity,p.sourceSha256,p.domainFingerprint,p.contexts.map(c=>[c.id,c.index,c.bankOffset,c.bounds])];

/** Analytic admission is completed before coordinates, banks, sessions, or M²
 * tensors exist. The deliberately conservative bound includes every global
 * operator output without assuming allocator reuse. Native heap is unchanged;
 * this bound is not a claim about successful backend heap admission. */
export async function admitMgcfdnEffnetWindowContexts(sourcePlan,{budget,signal}={}){
 checkAbort(signal);requireValue(sourcePlan?.variant==='mgcfdn-effnet'&&/^[a-f0-9]{64}$/.test(sourcePlan.windowFingerprint??'')&&Array.isArray(sourcePlan.contexts)&&typeof budget?.reserve==='function','Verified MGCFDN source plan and budget required.');
 const snapshot=JSON.stringify(keyFields(sourcePlan)),contexts=sourcePlan.contexts;
 for(let i=0;i<contexts.length;i++){const c=contexts[i];requireValue(c.index===i&&c.bankOffset===i*256&&c.featureCells===256&&c.bounds?.length===4&&c.bounds.every(Number.isSafeInteger)&&c.bounds[2]>c.bounds[0]&&c.bounds[3]>c.bounds[1],'MGCFDN native context contract changed.');}
 // source01's policy is disjoint literal RGB contexts. XFeat's overlapping
 // native-window coverage is a separate adaptation and cannot silently feed
 // this unweighted common population. No pair-index array is allocated here.
 for(let i=0;i<contexts.length;i++){if((i&31)===0)checkAbort(signal);const a=contexts[i].bounds;for(let j=0;j<i;j++){const b=contexts[j].bounds;requireValue(Math.max(a[0],b[0])>=Math.min(a[2],b[2])||Math.max(a[1],b[1])>=Math.min(a[3],b[3]),'MGCFDN head02 requires disjoint source01 contexts; overlapping coverage needs its own explicit population adaptation.');}}
 const count=contexts.length,M=BigInt(count)*256n,pair=4n*M*M;
 // 32 full FP32 pair extents exceed the graph's matrix-producing outputs and
 // reserve their complete coexistence, plus transpose/scratch and owned banks.
 const pairBound=count>1?pair*32n:0n,linear=count>1?4n*M*(464n*4n+256n*4n+40n*3n+4n)+BigInt(count)*256n*256n*8n+16n*1024n*1024n:4096n+8n*M,total=pairBound+linear;
 requireValue(total<=BigInt(Number.MAX_SAFE_INTEGER),'MGCFDN single-window admission overflow.');
 const release=budget.reserve(Number(total));let returned=false;
 try{
  const identity=await digest([MGCFDN_EFFNET_WINDOW_TRANSFORM,MGCFDN_EFFNET_WINDOW_SOURCE_SHA256,...keyFields(sourcePlan)]);checkAbort(signal);requireValue(snapshot===JSON.stringify(keyFields(sourcePlan)),'MGCFDN source plan changed during admission.');
  const envelope=count?[Math.min(...contexts.map(c=>c.bounds[0])),Math.min(...contexts.map(c=>c.bounds[1])),Math.max(...contexts.map(c=>c.bounds[2])),Math.max(...contexts.map(c=>c.bounds[3]))]:null;
  let disposed=false;returned=true;return Object.freeze({identity,sourceIdentity:sourcePlan.identity,sourceSha256:sourcePlan.sourceSha256,domainFingerprint:sourcePlan.domainFingerprint,modelSha256:MGCFDN_EFFNET_WINDOW_SOURCE_SHA256,transform:MGCFDN_EFFNET_WINDOW_TRANSFORM,windowFingerprint:sourcePlan.windowFingerprint,featureCells:Number(M),contexts,envelope:envelope&&Object.freeze(envelope),directNativeRectangle:count===1,empty:count===0,qualifiedLearnedHead:false,bytes:Object.freeze({singlePair:pair.toString(),allGlobalIntermediates:pairBound.toString(),linear:linear.toString(),total:total.toString()}),assertCurrent(){requireValue(!disposed&&snapshot===JSON.stringify(keyFields(sourcePlan)),'MGCFDN source identity expired.');},dispose(){if(disposed)return;disposed=true;release();}});
 }finally{if(!returned)release();}
}

/** Native arange anchors 0..15 mapped through Original into the admitted
 * envelope's native 16-unit chart. Subtract origins before floating arithmetic
 * so a common Original translation leaves every FP32 coordinate byte equal. */
export function mgcfdnEffnetWindowPriorChart(admission){
 admission.assertCurrent();const M=admission.featureCells,x=new Float32Array(M),y=new Float32Array(M);if(!M)return{x,y};const[eX,eY,right,bottom]=admission.envelope,w=right-eX,h=bottom-eY;
 for(const c of admission.contexts)for(let j=0;j<16;j++)for(let i=0;i<16;i++){const k=c.bankOffset+j*16+i;x[k]=((c.bounds[0]-eX)+i*(c.bounds[2]-c.bounds[0])/16)*16/w;y[k]=((c.bounds[1]-eY)+j*(c.bounds[3]-c.bounds[1])/16)*16/h;}
 return{x,y};
}

export function createMgcfdnEffnetWindowHeadRun(admission,{execute,encode,nativeRectangle,executionPolicy,sourceOwner,mapContexts=async(contexts,run)=>{for(const c of contexts)await run(c);},signal}={}){
 requireValue(typeof execute==='function'&&typeof encode==='function'&&typeof nativeRectangle==='function','Explicit MGCFDN native stage executors required.');admission.assertCurrent();
 requireValue(executionPolicy?.modelSha256===MGCFDN_EFFNET_WINDOW_SOURCE_SHA256&&executionPolicy.sourceIdentity===admission.sourceIdentity&&typeof executionPolicy.assertCurrent==='function','Admitted current MGCFDN native execution policy required.');executionPolicy.assertCurrent();
 requireValue(sourceOwner?.sourceIdentity===admission.sourceIdentity&&typeof sourceOwner.assertCurrent==='function'&&typeof sourceOwner.release==='function','A current parent-owned MGCFDN source lifetime is required.');sourceOwner.assertCurrent();
 const pending=new Set([sourceOwner]),controller=new AbortController();let running=null,disposing=null,disposed=false,result=null;
 // Producers must publish their owner synchronously at creation, before their
 // first await. A later construction/finally rejection must not orphan it.
 const own=loan=>{requireValue(loan&&typeof loan.release==='function','MGCFDN producer must register a releasable owner.');pending.add(loan);return loan;};
 const current=()=>{checkAbort(signal);checkAbort(controller.signal);requireValue(!disposed,'MGCFDN run retired.');admission.assertCurrent();sourceOwner.assertCurrent();executionPolicy.assertCurrent();};
 const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 async function retire(loan){await loan.release();pending.delete(loan);}
 async function call(label,feeds,context){current();const loan=await execute(label,feeds,{signal:combined,own,context});requireValue(pending.has(loan)&&loan.outputs,'MGCFDN stage owner must be captured before its first await.');current();return loan;}
 const read=(loan,name,size)=>{const t=loan.outputs[name],M=admission.featureCells,shapes={[F]:[1,464,16,16],[out('Div')]:[1,464,16,16],[out('TopK')]:[1,40,M],[out('Div_3')]:[1,M,M],[fg('avg_pool/GlobalAveragePool')]:[1,40,1,1],[ap('convs.4/convs.4.0/GlobalAveragePool')]:[1,464,1,1],[fg('conv_next/conv_next.2/Relu')]:[1,40,16,16],[out('Mul_6')]:[1,256,16,16],[out('MatMul_1')]:[1,256,M],logits:[1,1,256,256],probability:[1,1,256,256]};requireValue(t?.data instanceof Float32Array&&t.data.length===size&&JSON.stringify(t.dims)===JSON.stringify(shapes[name]),'Invalid MGCFDN stage result '+name);return t.data;};
 function bankPut(bank,channels,c,data,M){for(let k=0;k<channels;k++)bank.set(data.subarray(k*256,(k+1)*256),k*M+c.bankOffset);}
 function bankGet(bank,channels,c,M){const a=new Float32Array(channels*256);for(let k=0;k<channels;k++)a.set(bank.subarray(k*M+c.bankOffset,k*M+c.bankOffset+256),k*256);return a;}
 async function work(){
  current();if(admission.empty)return Object.freeze({contexts:[],receipt:{empty:true,learnedCalls:0}});
  if(admission.directNativeRectangle){const c=admission.contexts[0],loan=await nativeRectangle(c,{signal:combined,own});requireValue(pending.has(loan),'Native rectangle owner must be captured before its first await.');current();result=loan;return loan;}
  const M=admission.featureCells,bank=new Float32Array(464*M),normal=new Float32Array(464*M),sources=new Float32Array(464*M),chart=mgcfdnEffnetWindowPriorChart(admission);
  await mapContexts(admission.contexts,async c=>{current();const loan=await encode(c,{signal:combined,own});requireValue(pending.has(loan)&&loan.outputs,'Native encoder owner must be captured before its first await.');current();const encoded=read(loan,F,464*256);bankPut(bank,464,c,encoded,M);const normalized=await call('normalize',{[F]:tensor(encoded,[1,464,16,16])},c);bankPut(normal,464,c,read(normalized,out('Div'),464*256),M);await retire(normalized);await retire(loan);await controlCheckpoint(combined);});
  for(let c=0;c<464;c++)for(let k=0;k<M;k++)sources[k*464+c]=normal[c*M+k];
  const consistency=await call('global-consistency',{[V('normalized_sources')]:tensor(sources,[1,M,464]),[V('normalized_targets')]:tensor(normal,[1,464,M]),[V('source_x')]:tensor(chart.x,[1,M,1]),[V('target_x')]:tensor(chart.x,[1,1,M]),[V('source_y')]:tensor(chart.y,[1,M,1]),[V('target_y')]:tensor(chart.y,[1,1,M])}),top=read(consistency,out('TopK'),40*M),attention=read(consistency,out('Div_3'),M*M);
  const pools=await call('global-pools',{[F]:tensor(bank,[1,464,1,M]),[out('TopK')]:tensor(top,[1,40,1,M])}),fine=read(pools,fg('avg_pool/GlobalAveragePool'),40),aspp=read(pools,ap('convs.4/convs.4.0/GlobalAveragePool'),464),f2bank=new Float32Array(40*M),f3bank=new Float32Array(256*M);
  await mapContexts(admission.contexts,async c=>{const local=await call('context-f3',{[F]:tensor(bankGet(bank,464,c,M),[1,464,16,16]),[out('TopK')]:tensor(bankGet(top,40,c,M),[1,40,16,16]),[fg('avg_pool/GlobalAveragePool')]:tensor(fine,[1,40,1,1]),[ap('convs.4/convs.4.0/GlobalAveragePool')]:tensor(aspp,[1,464,1,1])},c);bankPut(f2bank,40,c,read(local,fg('conv_next/conv_next.2/Relu'),40*256),M);bankPut(f3bank,256,c,read(local,out('Mul_6'),256*256),M);await retire(local);await controlCheckpoint(combined);});
  await retire(pools);const mixed=await call('global-attention',{[V('f3_bank')]:tensor(f3bank,[1,256,M]),[V('attention')]:tensor(attention,[1,M,M])}),f4=read(mixed,out('MatMul_1'),256*M),outputs=[];
  await mapContexts(admission.contexts,async c=>{const decoded=await call('context-decode',{[fg('conv_next/conv_next.2/Relu')]:tensor(bankGet(f2bank,40,c,M),[1,40,16,16]),[out('Mul_6')]:tensor(bankGet(f3bank,256,c,M),[1,256,16,16]),[out('Reshape_11')]:tensor(bankGet(f4,256,c,M),[1,256,16,16]),[out('TopK')]:tensor(bankGet(top,40,c,M),[1,40,16,16])},c);outputs[c.index]=Object.freeze({context:c,logits:new Float32Array(read(decoded,'logits',65536)),probability:new Float32Array(read(decoded,'probability',65536))});await retire(decoded);await controlCheckpoint(combined);});
  await retire(mixed);await retire(consistency);current();result=Object.freeze({contexts:Object.freeze(outputs),receipt:Object.freeze({adaptation:MGCFDN_EFFNET_WINDOW_TRANSFORM,sourceIdentity:admission.sourceIdentity,domainFingerprint:admission.domainFingerprint,featureCells:M,topk:40,globalPools:2,spatialContextCount:admission.contexts.length,maskedOriginalCnnEquivalent:false})});return result;
 }
 function run(){requireValue(!disposed&&!running,'MGCFDN run is single-use.');running=work();return running;}
 function dispose(){if(disposing)return disposing;disposed=true;controller.abort();disposing=(async()=>{try{await running;}catch{}let failed=false,first;for(const loan of [...pending].filter(v=>v!==sourceOwner))try{await retire(loan);}catch(error){if(!failed){failed=true;first=error;}}if(failed)throw first;if(pending.has(sourceOwner))await retire(sourceOwner);result=null;admission.dispose();})().finally(()=>{disposing=null;});return disposing;}
 return Object.freeze({run,dispose,release:dispose,get pendingACKs(){return pending.size;}});
}
