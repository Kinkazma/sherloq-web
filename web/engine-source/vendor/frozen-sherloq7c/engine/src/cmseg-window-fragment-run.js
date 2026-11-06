import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {createMgcfdnContextRows} from './mgcfdn-context-rows.js';
import {createCmsegWindowContextHead} from './cmseg-window-context-head.js';
import {createCmsegWindowCnnRuntime} from '../experiments/segmentation/cmseg-window-cnn-runtime.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';

/** Raw one-window carrier. This module does not open a product admission gate.
 * Literal admitted RGB uses the existing Pillow512 native preparation; the
 * original encoder/decoder surround three common native-scale correlations.
 * Whole rectangles retain the previous complete native inference route.
 */
export function createCmsegWindowFragmentRun({original,window,variant,backend,modelUrl,cloneWindowMode='independent'},
 {budget,profile,signal,onOwner,cnnFactory=createCmsegWindowCnnRuntime,
  prepareFactory=createSegmentationPrepare,headFactory=createCmsegWindowContextHead}={}){
 const model=SEGMENTATION_MODELS[variant];
 requireValue(original?.segmented&&original.surface?.readWindow&&original.surface.descriptor&&window?.contextDomain&&window?.candidateDomain&&model?.family==='cmseg'&&['cpu','webgpu'].includes(backend)&&['independent','global'].includes(cloneWindowMode)&&typeof onOwner==='function'&&budget?.reserve&&Number.isInteger(profile?.maxWorkers),'Canonical CMSeg source, native variant/backend and synchronously published owner required');
 const controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),pending=new Set();
 const sourceSha256=original.sha256,sourceDescriptor=original.surface.descriptor,sourceDimensions=[sourceDescriptor.width,sourceDescriptor.height],windowFingerprint=window.fingerprint;
 let running,closing,closed=false,head,cnn,view;
 const observations={rgbReadCalls:0,rgbObservedPixels:0,rgbForbiddenPixels:0};
 const own=value=>{requireValue(value&&typeof(value.release??value.dispose)==='function','CMSeg raw carrier stage owner required');pending.add(value);return value;};
 const retire=async value=>{await(value.release??value.dispose).call(value);pending.delete(value);};
 const current=()=>{checkAbort(combined);requireValue(!closed&&!closing&&original.sha256===sourceSha256&&original.surface.descriptor===sourceDescriptor&&sourceDimensions[0]===sourceDescriptor.width&&sourceDimensions[1]===sourceDescriptor.height&&window.fingerprint===windowFingerprint,'CMSeg Original source or canonical window identity changed');};
 const owner={release(){if(closing)return closing;if(closed)return Promise.resolve();controller.abort();closing=(async()=>{
  try{await running;}catch{}
  if(head&&pending.has(head))await retire(head);
  if(cnn&&pending.has(cnn))await retire(cnn);
  await retireCompositeOwners([...pending].filter(v=>v!==view).map(value=>()=>retire(value)));
  if(view&&pending.has(view))await retire(view);
  closed=true;
 })().finally(()=>closing=undefined);return closing;}};
 onOwner(owner);
 async function work({onProgress}={}){
  current();const context=await compileOriginalSourceRegions(window.contextDomain.descriptor??window.contextDomain),candidate=await compileOriginalSourceRegions(window.candidateDomain.descriptor??window.candidateDomain);
  requireValue(context.sourceSha256===sourceSha256&&candidate.sourceSha256===sourceSha256&&context.sourceWidth===sourceDimensions[0]&&context.sourceHeight===sourceDimensions[1]&&candidate.sourceWidth===sourceDimensions[0]&&candidate.sourceHeight===sourceDimensions[1]&&typeof windowFingerprint==='string','CMSeg canonical domains differ from Original');
  const bounds=window.bounds;
  requireValue(Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<=sourceDimensions[0]&&bounds[3]<=sourceDimensions[1]&&bounds[2]>bounds[0]&&bounds[3]>bounds[1],'CMSeg declared native window bounds required');
  if(context.empty||candidate.empty)return Object.freeze({status:'empty',cloneWindowMode,contexts:[],analysisWindow:{id:window.id,fingerprint:windowFingerprint},provenance:{cloneWindowMode,backend:'not-executed'},observations:{...observations},release:owner.release});
  requireValue(context.rect.x0>=bounds[0]&&context.rect.y0>=bounds[1]&&context.rect.x1<=bounds[2]&&context.rect.y1<=bounds[3],'CMSeg context escapes its explicit window');
  const bounded={sha256:sourceSha256,descriptor:sourceDescriptor,async readWindow(rect,hooks){
   current();for(let y=rect.y;y<rect.y+rect.height;y++)if(!context.originalRowIntervals(y).some(([lo,hi])=>rect.x>=lo&&rect.x+rect.width<=hi)){observations.rgbForbiddenPixels+=rect.width;throw Error('CMSeg source read escapes admitted RGB before encoder');}
   const value=await original.surface.readWindow(rect,hooks);observations.rgbReadCalls++;observations.rgbObservedPixels+=rect.width*rect.height;return value;
  }};
  view=own(await createSourceRegionView(bounded,context.descriptor,{budget,signal:combined}));current();
  const contexts=Array.from(view.admittedRectangles(),(rect,index)=>({id:'native-context-'+index,rect,bounds:[rect.x+view.domain.origin[0],rect.y+view.domain.origin[1],rect.x+rect.width+view.domain.origin[0],rect.y+rect.height+view.domain.origin[1]]}));
  requireValue(contexts.length>1,'A complete rectangular CMSeg context must keep its existing native path');
  // Each RGB row is copied and its real source ACK is awaited by the existing
  // context-row adapter before the unchanged native Pillow preparer sees it.
  async function prepare(context,options){
   current();const rows=own(createMgcfdnContextRows(view,context,{budget})),preparer=own(prepareFactory({budget})),prepared=own(await preparer.run({...rows,side:512},options));current();
   const input=prepared.tensor;requireValue(input instanceof Float32Array&&input.length===3*512**2,'CMSeg original Pillow512 preparation changed');
   let released=false;const loan=own({input,async release(){if(released)return;await retire(prepared);await retire(rows);await retire(preparer);released=true;}});return loan;
  }
  cnn=own(cnnFactory({budget,model,modelUrl,backend,maxWorkers:profile.maxWorkers,onOwner:own}));
  const sourceOwner={sourceIdentity:[sourceSha256,window.id,windowFingerprint,cloneWindowMode],assertCurrent:current,async release(){await retire(view);}};
  head=own(headFactory({window,contexts,model,backend,profile,budget,cnn,prepare,sourceOwner,signal:combined,onOwner:own}));
  const result=await head.run({onProgress});current();
  return Object.freeze({...result,cloneWindowMode,analysisWindow:{id:window.id,kind:window.kind,bounds:[...bounds],fingerprint:windowFingerprint},candidateDomain:candidate,
   provenance:{cloneWindowMode,backend:backend==='webgpu'?'webgpu-cpu':'cpu-wasm',sourceSha256,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint,nativeModelId:model.id,sourcePolicy:'literal-admitted-contexts-before-cnn/1',maskedOriginalCnnEquivalent:false},
   observations:{...observations},execution:{requestedMaximumCores:profile.maxWorkers,nativeInputSide:512,encoderProviders:backend==='webgpu'&&model.backbone?['webgpu','wasm']:['wasm'],correlationProviders:backend==='webgpu'?['webgpu','wasm']:['wasm'],decoderProviders:['wasm'],numThreadsPerNativeSession:1},release:owner.release});
 }
 return Object.freeze({run(hooks={}){requireValue(!running&&!closing&&!closed,'CMSeg raw fragment carrier is single-use');running=Promise.resolve().then(()=>work(hooks));return running;},release:owner.release,get pendingACKs(){return pending.size;},get observations(){return{...observations};}});
}
