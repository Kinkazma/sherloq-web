import "../../runtime-context.js?v=0.30.0";
import{compileOriginalSourceRegions}from'./source-region-geometry.js';
import{createSourceRegionView}from'./source-region-view.js';
import{createMgcfdnContextRows}from'./mgcfdn-context-rows.js';
import{planNativeContextTokenBank}from'./mgcfdn-native-token-bank-domain.js';
import{createTntWindowBackbone,planTntWindowBackboneMemory}from'./mgcfdn-tnt-window-backbone.js';
import{admitTntWindowHead,createTntWindowHeadRun}from'./mgcfdn-tnt-window-head-runtime.js';
import{createTntWindowHeadExecutor}from'./mgcfdn-tnt-window-head-executor.js';
import{createTntWindowResources}from'./mgcfdn-tnt-window-resources.js';
import{createSegmentationPrepare}from'../experiments/segmentation/prepare.js';
import{getExecutionScheduler}from'./execution-scheduler.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
import{requireValue,checkAbort,controlCheckpoint}from'./errors.js';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
function* rectangles(domain){let active=new Map();for(let y=0;y<domain.height;y++){const next=new Map();for(const[x,right]of domain.rowIntervals(y)){const key=x+':'+right,prior=active.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x,y,width:right-x,height:1});}for(const[key,r]of active)if(!next.has(key))yield r;active=next;}yield*active.values();}
// One native bank for the supplied canonical domain. Global receives the
// deduplicated union pseudo-window from its qualified pool; no bbox is invented.
export function createTntWindowFragmentRun({original,window,backend,model,modelUrl,resources:sharedResources,cloneWindowMode='independent'},{budget,profile,signal,onOwner,resourcesFactory=createTntWindowResources,backboneFactory=createTntWindowBackbone,executorFactory=createTntWindowHeadExecutor,prepareFactory=createSegmentationPrepare,headFactory=createTntWindowHeadRun}={}){
 requireValue(['independent','global'].includes(cloneWindowMode)&&original?.segmented&&original.surface?.descriptor&&window?.contextDomain&&window?.candidateDomain&&['cpu','webgpu'].includes(backend)&&budget?.reserve&&typeof onOwner==='function','One canonical TNT window/backend and native source required');
 const pending=new Set(),planning=new Set(),headOwners=new Set(),encodingOwners=new Set(),backboneOwners=new Set(),controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),observations={rgbReadCalls:0,rgbObservedPixels:0,rgbForbiddenPixels:0};let running,closing,closed=false,view,head,executor,tokenPlan,admission,resources=sharedResources,backbone,features;
 const own=o=>{requireValue(typeof(o?.release??o?.dispose)==='function','Synchronous TNT producer owner required');pending.add(o);return o;};
 const retire=async o=>{await(o.release??o.dispose).call(o);pending.delete(o);encodingOwners.delete(o);backboneOwners.delete(o);};
 const current=()=>{checkAbort(combined);requireValue(!closed&&!closing,'TNT window fragment parent retired');};
 const nativeOwners=()=>[...pending].filter(o=>o!==view&&!planning.has(o)&&!headOwners.has(o));
 async function retireNative(){await retireCompositeOwners(nativeOwners().map(o=>()=>retire(o)));}
 const owner={release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}await retireCompositeOwners([()=>head?.dispose(),()=>retireNative()]);for(const o of[...headOwners])await retire(o);if(view&&pending.has(view))await retire(view);await retireCompositeOwners([...planning].map(o=>()=>retire(o)));planning.clear();requireValue(!pending.size,'TNT source parent still owns native producers');closed=true;})().finally(()=>closing=undefined);return closing;}};onOwner(owner);
 async function work(){
  current();const context=await compileOriginalSourceRegions(window.contextDomain.descriptor??window.contextDomain),candidate=await compileOriginalSourceRegions(window.candidateDomain.descriptor??window.candidateDomain),descriptor=original.surface.descriptor,b=window.bounds;
  requireValue(context.sourceSha256===original.sha256&&candidate.sourceSha256===original.sha256&&context.sourceWidth===descriptor.width&&context.sourceHeight===descriptor.height&&candidate.sourceWidth===descriptor.width&&candidate.sourceHeight===descriptor.height&&Array.isArray(b)&&b.length===4&&b.every(Number.isFinite),'TNT canonical source/window identities differ');
  if(context.empty||candidate.empty)return{cloneWindowMode,status:'empty',contexts:[],analysisWindow:{id:window.id,fingerprint:window.fingerprint},provenance:{cloneWindowMode,backend:'not-executed'},observations:{...observations},receipt:{learnedCalls:0}};
  requireValue(context.rect.x0+.5>=b[0]-1e-9&&context.rect.y0+.5>=b[1]-1e-9&&context.rect.x1-.5<=b[2]+1e-9&&context.rect.y1-.5<=b[3]+1e-9,'TNT contextual RGB escapes its one declared window');
  const bounded={sha256:original.sha256,descriptor,async readWindow(r,hooks){current();for(let y=r.y;y<r.y+r.height;y++)if(!context.originalRowIntervals(y).some(([lo,hi])=>r.x>=lo&&r.x+r.width<=hi)){observations.rgbForbiddenPixels+=r.width;throw Error('TNT RGB request escapes admitted Original context before CNN');}const answer=await original.surface.readWindow(r,hooks);observations.rgbReadCalls++;observations.rgbObservedPixels+=r.width*r.height;return answer;}};
  view=own(await createSourceRegionView(bounded,context.descriptor,{budget,signal:combined}));current();
  const credits=[],metadata=own({release(){for(const free of credits.splice(0))free();}});planning.add(metadata);credits.push(budget.reserve(65536));let contexts=[],pixels=0;
  for(const r of rectangles(context)){if((contexts.length&31)===0)await controlCheckpoint(combined);credits.push(budget.reserve(1024));const index=contexts.length,bounds=[r.x+context.origin[0],r.y+context.origin[1],r.x+r.width+context.origin[0],r.y+r.height+context.origin[1]];requireValue(view.includesRectangle(r),'TNT literal context escapes verified row source');pixels+=r.width*r.height;contexts.push({index,id:'tnt-context-'+index,rect:Object.freeze({...r}),bounds,width:r.width,height:r.height,inputSide:256,featureCells:256,bankOffset:index*256});}
  requireValue(pixels===context.countIncluded,'TNT literal contexts must cover each admitted Original RGB pixel exactly once');
  tokenPlan=own(planNativeContextTokenBank({variant:'mgcfdn-tnt',windowFingerprint:window.fingerprint,contexts,contextDomain:context,candidateDomain:candidate},{budget,signal:combined,onOwner:o=>{own(o);planning.add(o);}}));planning.add(tokenPlan);contexts=tokenPlan.contexts;
  if(tokenPlan.skipAllLearned)return{cloneWindowMode,status:'empty',contexts:[],analysisWindow:{id:window.id,fingerprint:window.fingerprint},provenance:{cloneWindowMode,backend:'not-executed'},observations:{...observations},receipt:{contextCells:tokenPlan.contextCells,candidateCells:tokenPlan.candidateCells,topk:40,learnedCalls:0}};
  requireValue(!tokenPlan.directNativeRectangle,'Complete TNT rectangle must retain the original native route');
  const backboneMemory=planTntWindowBackboneMemory(tokenPlan.contextCells),sourceIdentity=await digest([...(cloneWindowMode==='global'?['canonical-declared-context-union/global/1']:[]),'tnt-one-window-native-contexts/1',original.sha256,window.id,window.fingerprint,context.fingerprint,candidate.fingerprint,tokenPlan.identity]);current();
  admission=own(await admitTntWindowHead(tokenPlan,{budget,signal:combined,sourceIdentity,sourceSha256:original.sha256,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint}));planning.add(admission);
  getExecutionScheduler(budget,{maxWorkers:profile?.maxWorkers});executor=executorFactory(admission,{budget,profile,tailUrl:resources?.tailUrl??new URL(model.tail.file,modelUrl).href,signal:combined,onOwner:own});own(executor);
  // Admission occurs before any RGB row, Worker/math/device construction or
  // candidate pair allocation. Actual pool temporaries keep separate credits.
  budget.room(backboneMemory.baseOwnedBytes+64*1024**2+contexts.length*256*256*15);
  if(!resources){resources=resourcesFactory({budget,model,modelUrl,backend,onOwner:own});own(resources);}requireValue(resources.backend===backend&&resources.tailSha256===admission.modelSha256,'TNT model resources belong to another native backend/checkpoint');
  const encodingOwn=o=>{own(o);encodingOwners.add(o);return o;},backboneOwn=o=>{encodingOwn(o);backboneOwners.add(o);return o;};
  const encodeBank=async({own:headOwn})=>{
   let released=false;const encoded={outputs:null,metrics:null,async release(){if(released)return;await retireCompositeOwners([...backboneOwners].map(o=>()=>retire(o)).concat([...encodingOwners].filter(o=>!backboneOwners.has(o)).map(o=>()=>retire(o))));encoded.outputs=null;released=true;}};headOwn(encoded);own(encoded);
   const graph=await resources.ready(combined);current();backbone=await backboneFactory({budget,graph,read:resources.read,contextCells:tokenPlan.contextCells,maxWorkers:profile?.maxWorkers??1,backend,onOwner:backboneOwn});backboneOwn(backbone);current();
   const prepared=[],preparationOwners=new Set();
   for(const c of contexts){const rows=encodingOwn(createMgcfdnContextRows(view,c,{budget})),prepare=encodingOwn(prepareFactory({budget}));preparationOwners.add(rows);preparationOwners.add(prepare);const value=encodingOwn(await prepare.run({...rows,side:256},{signal:combined}));preparationOwners.add(value);prepared.push(value.tensor);current();}
   features=encodingOwn(await backbone.run(prepared,{signal:combined}));current();encoded.outputs={features:{data:features.data,dims:[1,640,1,tokenPlan.contextCells]}};encoded.metrics={backend,workers:features.workers??0,gpu:features.gpu??null,timings:features.timings??null,admission:backboneMemory};
   await retireCompositeOwners([...preparationOwners].map(o=>()=>retire(o)));current();return encoded;
  };
  const sourceOwner={sourceIdentity,assertCurrent(){current();admission.assertCurrent();},async release(){await retireNative();if(pending.has(view))await retire(view);}};
  head=headFactory(admission,{execute:executor.run,encodeBank,nativeRectangle(){throw Error('TNT rectangle route must use its original native function');},executionPolicy:executor.policy,sourceOwner,signal:combined,onOwner:o=>{own(o);headOwners.add(o);}});own(head);headOwners.add(head);
  const result=await head.run();current();return{...result,cloneWindowMode,analysisWindow:{id:window.id,kind:window.kind,bounds:[...b],fingerprint:window.fingerprint},candidateDomain:candidate,observations:{...observations},provenance:{cloneWindowMode,backend:backend==='webgpu'?'webgpu-outer-wasm-inner-and-tail':'cpu-wasm',nativeWindowIdentity:sourceIdentity,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint,sourcePolicy:cloneWindowMode==='global'?'canonical-declared-context-union-single-observation/1':'one-window-native-local-contexts-minus-original-negatives/1',maskedOriginalCnnEquivalent:false},execution:{requestedMaximumCores:profile?.maxWorkers,backboneWorkers:features?.workers??0,backboneBackend:backend==='webgpu'?'webgpu-outer-wasm-inner':'wasm-cpu',backboneMemory,headProviders:['wasm'],nativeTailLanes:executor.nativeLanes??1,numThreadsPerNativeSession:1}};
 }
 function run(){requireValue(!running&&!closed&&!closing,'TNT single-window fragment runner is single-use');running=Promise.resolve().then(work);return running;}
 return Object.freeze({run,release:owner.release,dispose:owner.release,get observations(){return{...observations};},get pendingACKs(){return pending.size;}});
}
