import "../../runtime-context.js?v=0.25.0";
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {planMgcfdnNativeContexts} from './mgcfdn-native-context-plan.js';
import {createMgcfdnContextRows} from './mgcfdn-context-rows.js';
import {admitMgcfdnGlobalHead} from './mgcfdn-global-head-runtime.js';
import {createMgcfdnProductHeadRun} from './mgcfdn-product-head.js';
import {createMgcfdnWindowGpuExecutor} from './mgcfdn-window-gpu-executor.js';
import {createMgcfdnProductExecutor} from './mgcfdn-product-executor.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');

// This carrier computes a raw context bundle only. The product integration
// must project the bundle with the existing native decoder/projector before
// admission; no gate is opened by this module. Rectangles keep their original
// complete native path and are deliberately outside this adaptation.
export function createMgcfdnWindowFragmentRun({original,window,backend,urls,cloneWindowMode='independent'},{budget,profile,signal,onOwner,executorFactory,prepareFactory=createSegmentationPrepare,headFactory=createMgcfdnProductHeadRun}={}){
  requireValue(['independent','global'].includes(cloneWindowMode)&&['cpu','webgpu'].includes(backend)&&original?.segmented&&window?.contextDomain&&window?.candidateDomain&&typeof onOwner==='function','One canonical MGCFDN window and its selected existing backend required');
  const pending=new Set(),controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);let running,closing,closed=false,head,executor,admission,plan,view;
  const own=value=>{requireValue(value&&typeof(value.release??value.dispose)==='function','Synchronous fragment producer owner required');pending.add(value);return value;};
  const retire=async value=>{await(value.release??value.dispose).call(value);pending.delete(value);};
  const current=()=>{checkAbort(combined);requireValue(!closed&&!closing,'MGCFDN single-window fragment run retired');};
  const observations={rgbReadCalls:0,rgbObservedPixels:0,rgbForbiddenPixels:0};
  const owner={release(){if(closing)return closing;controller.abort();closing=(async()=>{try{await running;}catch{}// Termination/close of the GPU producer acknowledges every native output before source retirement.
    await executor?.release();if(head)await head.dispose();await retireCompositeOwners([...pending].map(value=>()=>retire(value)));closed=true;
  })().finally(()=>closing=undefined);return closing;}};onOwner(owner);
  async function work(){
    current();const context=await compileOriginalSourceRegions(window.contextDomain.descriptor??window.contextDomain),candidate=await compileOriginalSourceRegions(window.candidateDomain.descriptor??window.candidateDomain),d=original.surface.descriptor;
    requireValue(context.sourceSha256===original.sha256&&candidate.sourceSha256===original.sha256&&context.sourceWidth===d.width&&context.sourceHeight===d.height&&candidate.sourceWidth===d.width&&candidate.sourceHeight===d.height&&typeof window.fingerprint==='string','One-window fragment source identity differs');
    const b=window.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=d.width&&b[3]<=d.height&&b[2]>b[0]&&b[3]>b[1],'Original window bounds required');
    if(context.empty||candidate.empty)return{cloneWindowMode,status:'empty',contexts:[],analysisWindow:{id:window.id,fingerprint:window.fingerprint},provenance:{cloneWindowMode,backend:'not-executed'},observations};
    requireValue(context.countIncluded<(context.rect.x1-context.rect.x0)*(context.rect.y1-context.rect.y0),'Complete rectangles retain the unmodified native route');
    requireValue(context.rect.x0+.5>=b[0]-1e-9&&context.rect.y0+.5>=b[1]-1e-9&&context.rect.x1-.5<=b[2]+1e-9&&context.rect.y1-.5<=b[3]+1e-9,'Fragment context escapes its canonical window');
    // The frozen head population is all admitted context cells. Candidate-only
    // gaps need their own compact affinity membership before this adaptation
    // can serve such an envelope. Do not quietly enlarge its candidates.
    requireValue(context.countIncluded===candidate.countIncluded,'Fragment envelope with candidate-only gaps needs native affinity membership');
    for(let y=context.rect.y0;y<context.rect.y1;y++)requireValue(JSON.stringify(context.originalRowIntervals(y))===JSON.stringify(candidate.originalRowIntervals(y)),'Fragment candidates differ from this admitted context population');
    const bounded={sha256:original.sha256,descriptor:d,async readWindow(r,hooks){
      current();for(let y=r.y;y<r.y+r.height;y++)if(!context.originalRowIntervals(y).some(([lo,hi])=>r.x>=lo&&r.x+r.width<=hi)){observations.rgbForbiddenPixels+=r.width;throw Error('Fragment RGB escapes this window context before CNN');}
      const value=await original.surface.readWindow(r,hooks);observations.rgbReadCalls++;observations.rgbObservedPixels+=r.width*r.height;return value;
    }};
    view=await createSourceRegionView(bounded,context.descriptor,{budget,signal:combined});own(view);current();
    plan=own(await planMgcfdnNativeContexts(view,{budget,signal:combined}));current();
    // Add the canonical window to the bank identity. Coincident A/B windows
    // still perform autonomous analyses, never share a learned population.
    const identity=await hash(['mgcfdn-one-window-fragments/1',original.sha256,window.id,window.fingerprint,context.fingerprint,candidate.fingerprint,plan.identity]);current();
    const scopedPlan={...plan,identity};admission=own(await admitMgcfdnGlobalHead(scopedPlan,{budget,signal:combined}));current();
    const factory=executorFactory??(backend==='webgpu'?createMgcfdnWindowGpuExecutor:(a,options)=>createMgcfdnProductExecutor(a,{...options,modelUrl:urls.base,own:options.onOwner}));
    executor=factory(admission,{budget,profile,urls,backend,signal:combined,onOwner:own});own(executor);
    const sourceOwner={sourceIdentity:identity,assertCurrent(){current();admission.assertCurrent();},async release(){await view.dispose();}};
    async function encode(c,options){
      current();const rows=own(createMgcfdnContextRows(view,c,{budget})),prepare=own(prepareFactory({budget}));
      const prepared=own(await prepare.run({...rows,side:256},{signal:combined}));current();
      const answer=await executor.run('encoder',{rgb:{data:prepared.tensor,dims:[1,3,256,256]}},{...options,context:c});
      await retire(prepared);await retire(rows);await retire(prepare);current();return answer;
    }
    head=headFactory(admission,{execute:executor.run,encode,nativeRectangle(){throw Error('Rectangle route must retain the original native function');},executionPolicy:executor.policy,sourceOwner,mapContexts:executor.mapContexts,signal:combined});own(head);
    const output=await head.run();current();return{...output,cloneWindowMode,analysisWindow:{id:window.id,kind:window.kind,bounds:[...b],fingerprint:window.fingerprint},provenance:{cloneWindowMode,backend:backend==='webgpu'?'webgpu-cpu':'cpu-wasm',nativeWindowIdentity:identity,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint,sourcePolicy:'one-window-minus-true-negatives/1',maskedOriginalCnnEquivalent:false},candidateDomain:candidate,observations:{...observations},execution:{requestedMaximumCores:profile?.maxWorkers,nativeLanes:executor.nativeLanes??executor.grant,encoderProviders:backend==='webgpu'?['webgpu','wasm']:['wasm'],headProviders:backend==='webgpu'?['webgpu','wasm']:['wasm'],numThreadsPerNativeSession:1}};
  }
  function run(){requireValue(!running&&!closing&&!closed,'Single-use native window fragment run');running=Promise.resolve().then(work);return running;}
  return Object.freeze({run,release:owner.release,get observations(){return{...observations};},get pendingACKs(){return pending.size;}});
}
