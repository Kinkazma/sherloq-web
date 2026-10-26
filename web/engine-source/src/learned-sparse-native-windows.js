import {SparseCopyEngine} from './sparse-copy.js';
import {prepareSparseNativeWindow,sparseNativeWindowParameters} from './sparse-native-window-source.js';
import {extractXfeatStrictNative} from './xfeat-strict-native-features.js';
import {extractAlikedStrictNative} from './aliked-strict-extract.js';
import {createAlikedStrictMask} from './aliked-strict-mask.js';
import {planAlikedStrictContexts} from './aliked-strict-contexts.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

export const LEARNED_SPARSE_WINDOW_ALGORITHMS=Object.freeze(['XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue']);
/** Existing native engines are retained by canonical window identity. The
 * parent runner receives only a loan; clearImages/retainWindows owns retirement
 * in the order engine ACK, native derived ACK, then compiled RGB source ACK.
 * Every analyze returns a fresh native result, never a detached old answer. */
export function createLearnedSparseWindowCallback({original,budget,profile,hooks={},strictAlikedRuntime,engineFactory=(image,budget,profile)=>new SparseCopyEngine(image,budget,profile),xfeatExtract=extractXfeatStrictNative,alikedExtract=extractAlikedStrictNative,alikedMask=createAlikedStrictMask}={}){
 requireValue(original&&budget?.reserve&&profile&&typeof engineFactory==='function','Learned sparse windows need their Original owner, shared budget and unchanged profile.');
 const resources=new Map(),lifetime=new AbortController();let closed=false;
 const key=(window,task,mode='independent')=>JSON.stringify([mode,original.sha256,window.id,window.fingerprint,task.backend??hooks.backend??'auto',profile.maxWorkers]);
 function resourceFor(window,task){
  const resource={window,engine:null,compiled:null,nativeOwners:new Set(),children:new Map(),loans:new Set(),retirement:null,readyFailure:false};
  const captureNative=owner=>{requireValue(owner&&typeof owner.dispose==='function','Native derived window owner required.');resource.nativeOwners.add(owner);};
  resource.retireNative=async()=>{for(const owner of [...resource.nativeOwners].reverse()){await owner.dispose();resource.nativeOwners.delete(owner);}};
  resource.ready=prepareSparseNativeWindow({original,window,task},{budget,onOwner:owner=>resource.compiled=owner}).then(prepared=>{
   resource.prepared=prepared;const engine=resource.engine=engineFactory(prepared.image,budget,profile),ordinary=engine.learned;
   requireValue(engine&&typeof engine.analyze==='function'&&typeof engine.dispose==='function'&&ordinary&&typeof ordinary.extract==='function','Existing native sparse engine required.');
   if(!prepared.fullRectangle)engine.learned={dispose:()=>ordinary.dispose(),extract:async(image,settings)=>{
    checkAbort(settings.signal);
   if(settings.family==='XFeat')return xfeatExtract(prepared.compiled.source,{...settings,budget,profile,signal:settings.signal,candidateDomain:prepared.candidateDomain,onOwner:captureNative});
   requireValue(['ALIKED','ALIKED rotation'].includes(settings.family),'Unexpected native learned family.');
   const backend=settings.backend,signal=settings.signal,window=resource.window;
   const runtime=await strictAlikedRuntime?.({backend,profile,signal,window,prepared,family:settings.family,models:settings.model?.graphs});checkAbort(signal);
   const requestedProvider=backend==='cpu'?'wasm':backend==='webgpu'||globalThis.navigator?.gpu?'webgpu':'wasm';
   if(runtime?.dispose)captureNative(runtime);
   if(!runtime||runtime.provider!==requestedProvider||!['wasm','webgpu'].includes(runtime.provider))throw new EngineError('SOURCE_SCOPE_BACKEND_UNQUALIFIED','This fragmented ALIKED window needs a native adapter qualified for the requested backend; the ordinary rectangle GPU path is preserved.',{details:{backend,requestedProvider,windowId:window.id}});
   const coverage=await planAlikedStrictContexts(prepared.compiled.source.view,{budget,signal,width:image.width,height:image.height});captureNative({dispose:()=>coverage.dispose()});
   const mask=await alikedMask({width:image.width,height:image.height,regions:settings.regions,excluded:settings.excluded,budget,signal,onOwner:captureNative,wasmBinary:runtime.maskWasmBinary});
   const [ox,oy]=prepared.origin,allowedAtSource=(x,y)=>prepared.candidateDomain.containsOriginal(x,y)&&mask.allowedAtSource(x-ox,y-oy);
   const membership=(points,into)=>{const copy=allocateOwnedTypedArray(Float64Array,points.length,{budget,owner:'aliked-window-local-mask'});try{copy.data.set(points);for(let i=0;i<copy.data.length;i+=7){copy.data[i]-=ox;copy.data[i+1]-=oy;}return mask.membership(copy.data,into);}finally{copy.release();}};
   const raw=await alikedExtract(prepared.compiled.source.view,{...runtime,budget,profile,signal,coverage,modelKind:settings.family==='ALIKED rotation'?'aliked-n16rot':'aliked-n16',models:settings.model?.graphs,limit:settings.limit,zoneCount:mask.zoneCount,membership,allowedAtSource,onOwner:captureNative});checkAbort(signal);
   // SparseCopyEngine accepts synchronous released feature banks. Copy only
   // the native tables, then await every derived raw owner ACK before returning.
   const copies=[];let copied=false;
   try{const copy=(Type,data,label)=>{const a=allocateOwnedTypedArray(Type,data.length,{budget,owner:'aliked-window-bank',label});copies.push(a);a.data.set(data);return a.data;},points=copy(Float64Array,raw.points,'native local points'),descriptors=copy(Float32Array,raw.descriptors,'native SDDH128'),members=copy(Uint8Array,raw.members,'native memberships');
    for(let i=0;i<points.length;i+=7){points[i]-=ox;points[i+1]-=oy;}
    await raw.release();checkAbort(signal);let released=false;copied=true;return{points,descriptors,members,zoneCount:raw.zoneCount,descriptorSize:raw.descriptorSize,totalFeatures:raw.totalFeatures,metadata:{...raw.metadata,provider:runtime.provider,...(runtime.metadata?{runtimeAdapter:runtime.metadata()}:{}),coordinates:'window-native-pixel-centres',origin:[ox,oy]},release(){if(released)return;released=true;for(const a of copies)a.release();}};
   }finally{if(!copied)for(const a of copies)a.release();}
   }};return resource;
  }).catch(error=>{resource.readyFailure=true;throw error;});void resource.ready.catch(()=>{});
  resource.dispose=()=>{
   if(resource.retirement)return resource.retirement;
   resource.retirement=(async()=>{await resource.ready.catch(()=>{});await Promise.all([...resource.loans].map(loan=>loan.closed));
    if(resource.engine){await resource.engine.dispose();resource.engine=null;}
    await resource.retireNative();for(const [identity,child]of resource.children){await child.dispose();resource.children.delete(identity);}if(resource.compiled){await resource.compiled.dispose();resource.compiled=null;}
   })();void resource.retirement.catch(()=>{resource.retirement=null;});return resource.retirement;
  };return resource;
 }
 const executeNative=async({window,task,signal:externalSignal,onOwner,sourceContextIdentity,mode})=>{
  const signal=externalSignal?AbortSignal.any([externalSignal,lifetime.signal]):lifetime.signal;
  requireValue(!closed&&typeof onOwner==='function'&&(task.cloneWindowMode??'independent')===mode&&LEARNED_SPARSE_WINDOW_ALGORITHMS.includes(task.params?.algorithm),'A live native learned callback, explicit effective mode and parent owner required.');checkAbort(signal);
  const identity=key(window,task,mode);let resource=resources.get(identity);
  if(resource?.readyFailure){await resource.dispose();resources.delete(identity);resource=null;}
  if(!resource){resource=resourceFor(window,task);resources.set(identity,resource);}
  let finish,retirement;const loan={closed:new Promise(resolve=>finish=resolve),dispose(){if(retirement)return retirement;retirement=(async()=>{await resource.active?.catch(()=>{});await resource.retireNative();resource.loans.delete(loan);finish();})();void retirement.catch(()=>{retirement=null;});return retirement;}};resource.loans.add(loan);onOwner(loan);
  await resource.ready;checkAbort(signal);requireValue(!resource.active,'Native learned window engine is busy.');await resource.retireNative();checkAbort(signal);requireValue(!resource.active,'Native learned window engine is busy.');
  const {input,scientificScopeFingerprint,nativeRegionPolicy}=sparseNativeWindowParameters(task,resource.prepared.origin,{analysisWindowMode:mode}),backend=task.backend??hooks.backend??'auto',jointSearch=mode==='global'&&input.compare!==true;
  // Source/candidate union already locks observations and eligibility. Analysis
  // windows must not become separate matcher memberships in explicit joint mode.
  if(jointSearch)input.regions=[];let output,returned=false,failed=false,primary;
  resource.task=task;const active=resource.engine.analyze(input,{...hooks,backend,signal,scientificScope:undefined,sourceSha256:resource.prepared.contextDomain.sourceSha256,sourceContextFingerprint:sourceContextIdentity});resource.active=active;
  try{output=await active;checkAbort(signal);output.cloneWindowMode=mode;output.provenance={...output.provenance,cloneWindowMode:mode,params:task.params,cloneContextFingerprint:window.fingerprint,cloneWindowIds:mode==='global'?window.declaredWindowIds:[window.id],nativeContextPolicy:mode==='global'?'declared-window-union-single-observation':'one-declared-window',requestedParameters:task.params,nativeParameters:output.params??input,requestedParameterCoordinates:'original-pixels',nativeParameterCoordinates:'source-context-local-pixel-centres',nativeRegionPolicy:jointSearch?'one-search-context-over-admitted-union':nativeRegionPolicy};output.metadata={...output.metadata,analysisWindow:{id:window.id,kind:window.kind,contextFingerprint:resource.prepared.contextDomain.fingerprint,candidateFingerprint:resource.prepared.candidateDomain.fingerprint,sourceContextIdentity,origin:[...resource.prepared.origin],scientificScopeFingerprint,mode,...(mode==='global'?{sourceObservationPolicy:'declared-window-union-single-observation'}:{}),nativeWholeRectangle:resource.prepared.fullRectangle,sourceUnionRectangle:resource.prepared.fullRectangle,coordinates:mode==='global'?'joint-context-native-pixel-centres':'window-native-pixel-centres',matching:mode==='global'?'unchanged native SparseCopyEngine over the admitted declared-context union':'unchanged native SparseCopyEngine within this window only'}};returned=true;return output;
  }catch(error){failed=true;primary=error;throw error;}finally{if(resource.active===active)resource.active=null;if(!returned&&output)await retireCompositeOwners([()=>output.release()],failed?{primary}:{});}
 };
 const runWindow=job=>executeNative({...job,mode:'independent'});
 const jointAnalysis=plan=>{
  const global=plan?.global;if(!(plan?.mode==='global'&&global?.contextPolicy==='declared-window-context-union'&&global.candidateDomain&&global.contextDomain&&typeof global.fingerprint==='string'))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Joint learned analysis requires the canonical declared-window union; legacy bbox context is not admitted.');
  const context=global.contextDomain;return{id:'joint-declared-windows',kind:'global',declaredWindowIds:[...global.windowIds],fingerprint:JSON.stringify(['union-before-native-input/1',global.fingerprint]),candidateDomain:global.candidateDomain,contextDomain:context,status:global.candidateDomain.empty?'empty':'ready',bounds:[context.rect.x0,context.rect.y0,context.rect.x1,context.rect.y1]};
 };
 runWindow.runGlobal=({plan,...job})=>{const window=jointAnalysis(plan);requireValue(window.status!=='empty','An empty joint analysis has no native execution.');return executeNative({...job,window,mode:'global'});};
 runWindow.retainWindows=async plan=>{
  requireValue(!closed&&plan&&Array.isArray(plan.windows)&&['independent','global'].includes(plan.mode),'Canonical native analysis plan required.');const task=plan.originalTask??{},keep=new Set();
  if(plan.mode==='independent'){for(const window of plan.windows)if(window.status!=='empty')keep.add(key(window,task,'independent'));}
  else if(plan.windows.some(window=>window.status!=='empty')){const window=jointAnalysis(plan);keep.add(key(window,task,'global'));}
  await retireCompositeOwners([...resources].filter(([identity])=>!keep.has(identity)).map(([identity,resource])=>async()=>{await resource.dispose();resources.delete(identity);}));
 };
 runWindow.dispose=async()=>{closed=true;lifetime.abort();await retireCompositeOwners([...resources].map(([identity,resource])=>async()=>{await resource.dispose();resources.delete(identity);}));};
 return runWindow;
}
