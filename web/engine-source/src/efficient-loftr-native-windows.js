import {createSourceRegionView} from './source-region-view.js';
import {planEfficientLoFtrLiteralContexts} from './efficient-loftr-literal-contexts.js';
import {verifyEfficientLoFtrRoleGeometry,resolveEfficientLoFtrRoleCrops} from './efficient-loftr-role-geometry.js';
import {EfficientLoFtrEngine} from './efficient-loftr.js';
import {efficientLoFtrParams,efficientLoFtrCrop} from './efficient-loftr-input.js';
import {prepareSparseNativeWindow,sparseNativeWindowParameters} from './sparse-native-window-source.js';
import {roundEven} from './pixel-utils.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

const key=(mode,window,comparison)=>JSON.stringify([mode,window.id,window.fingerprint,...(comparison?[comparison]:[])]);
const missing=(image,poly)=>{const xs=poly.map(v=>v[0]),ys=poly.map(v=>v[1]);return Math.min(image.width,Math.ceil(Math.max(...xs))+1)<=Math.max(0,Math.floor(Math.min(...xs)))||Math.min(image.height,Math.ceil(Math.max(...ys))+1)<=Math.max(0,Math.floor(Math.min(...ys)));};

/** Keep the existing two-input EfficientLoFTR graph, preprocessing, variants,
 * backend, confidence TopK, grouping and geometric fit. A native comparison
 * runs only within its containing analysis window. The global branch is an
 * explicit different context; it never qualifies independent mini-windows.
 * Holes outside both literal input crops are harmless: they are never read.
 * True holes use the received literal native contexts and shared two-role attention.
 */
export function createEfficientLoFtrNativeWindowCallback({original,budget,profile,hooks={},engineFactory=(...args)=>new EfficientLoFtrEngine(...args)}={}){
 requireValue(original&&typeof budget?.reserve==='function'&&profile&&typeof engineFactory==='function','Native EfficientLoFTR windows require Original, budget and the requested profile.');
 const resources=new Map(),lifetime=new AbortController();let closed=false,closing;
 function resource(mode,window,comparison){const identity=key(mode,window,comparison);let r=resources.get(identity);if(r)return r;r={identity,window,loans:0,busy:false,closed:false};resources.set(identity,r);
  r.retire=()=>{if(r.closing)return r.closing;r.closed=true;r.closing=(async()=>{await r.initialized?.catch(()=>{});requireValue(!r.busy&&r.loans===0,'A native EfficientLoFTR carrier still owns this window.');await r.engine?.dispose();await r.literalView?.dispose();await r.compiled?.dispose();resources.delete(identity);})();void r.closing.finally(()=>{r.closing=null;}).catch(()=>{});return r.closing;};return r;
 }
 async function run({window,task,signal:externalSignal,onOwner,sourceContextIdentity},mode){
  requireValue(!closed&&typeof onOwner==='function'&&task.operation==='tampering.copyMove.sparse'&&task.params?.algorithm==='EfficientLoFTR'&&(task.cloneWindowMode??'independent')===mode,'A live native EfficientLoFTR window and parent owner are required.');const signal=externalSignal?AbortSignal.any([externalSignal,lifetime.signal]):lifetime.signal;checkAbort(signal);
  const comparison=await verifyEfficientLoFtrRoleGeometry(task.efficientLoFtrComparison);checkAbort(signal);const r=resource(mode,window,comparison?.fingerprint);requireValue(!r.closed&&!r.busy,'Native EfficientLoFTR window is busy or retiring.');let loanReleased=false;r.loans++;try{onOwner({async dispose(){if(!loanReleased){loanReleased=true;r.loans--;}}});}catch(error){r.loans--;throw error;}r.busy=true;let result,literalPlan,returned=false,failed=false,primary;
  try{
   r.initialized??=(async()=>{r.prepared=await prepareSparseNativeWindow({original,window,task},{budget,signal:lifetime.signal,onOwner:owner=>r.compiled=owner});})();await r.initialized;checkAbort(signal);
   const p=r.prepared,{input}=sparseNativeWindowParameters({...task,params:efficientLoFtrParams(task.params)},p.origin,{analysisWindowMode:mode}),params=efficientLoFtrParams(input),originalParams=efficientLoFtrParams({...input,regions:input.regions.map(poly=>poly.map(([x,y])=>[x+p.origin[0],y+p.origin[1]]))});
   const nativeCrops=resolveEfficientLoFtrRoleCrops({width:p.contextDomain.sourceWidth,height:p.contextDomain.sourceHeight},originalParams.regions,params.longSide,comparison,{sourceSha256:p.contextDomain.sourceSha256,sourceGrid:[p.contextDomain.sourceWidth,p.contextDomain.sourceHeight]}).crops;requireValue(nativeCrops[0].x!==nativeCrops[1].x||nativeCrops[0].y!==nativeCrops[1].y||nativeCrops[0].width!==nativeCrops[1].width||nativeCrops[0].height!==nativeCrops[1].height,'EfficientLoFTR requires two distinct native comparison regions.');
   const metadata={id:window.id,kind:window.kind,mode,origin:[...p.origin],sourceContextIdentity,contextFingerprint:p.contextDomain.fingerprint,candidateFingerprint:p.candidateDomain.fingerprint,scientificScopeFingerprint:p.scientificScopeFingerprint,coordinates:'window-native-pixel-centres',matching:'native two-input EfficientLoFTR within this analysis only'};
   const geometry=resolveEfficientLoFtrRoleCrops(p.image,params.regions,params.longSide,comparison,{origin:p.origin,sourceSha256:p.contextDomain.sourceSha256,sourceGrid:[p.contextDomain.sourceWidth,p.contextDomain.sourceHeight],allowOutside:true});if(geometry.crops.some(c=>c===null)){result={status:'no-regions',regions:params.regions,params,compare:true,cloneWindowMode:mode,metadata:{algorithm:'EfficientLoFTR',...(comparison?{efficientLoFtrComparison:comparison}:{}),analysisWindow:{...metadata,status:'comparison-region-outside-window',inferenceExecutions:0}},release(){}};returned=true;return result;}
   const crops=geometry.crops;
   // The pinned native engine rejects identical effective inputs before RGB.
   // Preserve that refusal within THIS autonomous window; valid neighbours
   // still execute. The distinct Original pair was checked above.
   if(crops[0].x===crops[1].x&&crops[0].y===crops[1].y&&crops[0].width===crops[1].width&&crops[0].height===crops[1].height){const refusal={code:'native-identical-comparison-crops',reason:'Native EfficientLoFTR requires two distinct effective comparison crops; both roles intersect this analysis window in the same crop.',originalCrops:nativeCrops,localCrops:crops};result={status:'no-regions',regions:params.regions,params,compare:true,cloneWindowMode:mode,provenance:{cloneWindowMode:mode,params:task.params,requestedParameters:task.params,nativeParameters:params,nativeComparisonRefusal:refusal,...(comparison?{efficientLoFtrComparison:comparison}:{})},metadata:{algorithm:'EfficientLoFTR',...(comparison?{efficientLoFtrComparison:comparison}:{}),analysisWindow:{...metadata,status:refusal.code,inferenceExecutions:0,nativeComparisonRefusal:refusal}},release(){}};returned=true;return result;}
   let requiresLiteral=false;
   // Inspect geometry before reading any RGB or creating a graph runtime.
   // The model's two crops remain literal, not a painted membership image.
   for(const crop of crops)for(let y=crop.y;y<crop.y+crop.height;y++){
    const intervals=p.contextDomain.originalRowIntervals(y+p.origin[1]),a=crop.x+p.origin[0],b=a+crop.width;let included=0;for(const[left,right]of intervals)included+=Math.max(0,Math.min(b,right)-Math.max(a,left));
    if(included!==crop.width)requiresLiteral=true;if(y%32===0)await controlCheckpoint(signal);
   }
   if(requiresLiteral){
    r.literalView??=await createSourceRegionView({descriptor:{width:p.contextDomain.sourceWidth,height:p.contextDomain.sourceHeight},sha256:p.contextDomain.sourceSha256,readWindow(rect,localHooks){return p.image.readWindow({...rect,x:rect.x-p.origin[0],y:rect.y-p.origin[1]},localHooks);}},p.contextDomain.descriptor,{budget,signal:lifetime.signal});checkAbort(signal);
    literalPlan=await planEfficientLoFtrLiteralContexts(r.literalView,{...params,regions:geometry.effectiveRegions},{budget,signal});
    if(literalPlan.status!=='ready'){result={status:'no-regions',regions:params.regions,params,compare:true,cloneWindowMode:mode,metadata:{algorithm:'EfficientLoFTR',...(comparison?{efficientLoFtrComparison:comparison}:{}),analysisWindow:{...metadata,status:'comparison-role-without-admitted-RGB',inferenceExecutions:0}},release(){}};returned=true;return result;}
   }
   r.engine??=engineFactory(p.image,budget,profile);requireValue(typeof r.engine.analyze==='function'&&typeof r.engine.dispose==='function','Existing EfficientLoFTR native engine required.');
   result=await r.engine.analyze(params,{...hooks,...(literalPlan?{nativeLiteralContext:{view:r.literalView,plan:literalPlan}}:{}),nativeComparisonMetadata:comparison,nativeComparisonOrigin:p.origin,nativeComparisonOriginalGrid:[p.contextDomain.sourceWidth,p.contextDomain.sourceHeight],backend:task.backend??hooks.backend??'auto',signal,nativeSourceCandidates:{fingerprint:p.candidateDomain.fingerprint,containsPoint:([x,y])=>p.candidateDomain.containsOriginal(roundEven(x+p.origin[0]),roundEven(y+p.origin[1]))}});checkAbort(signal);
   result.cloneWindowMode=mode;result.provenance={...result.provenance,cloneWindowMode:mode,params:task.params,requestedParameters:task.params,nativeParameters:result.params??params,...(comparison?{efficientLoFtrComparison:comparison}:{}),nativeContextPolicy:mode==='global'?'canonical-union-native-two-input-comparison':'one-declared-window-native-two-input-comparison'};result.metadata={...result.metadata,analysisWindow:{...metadata,status:'native-complete'}};returned=true;return result;
  }catch(error){failed=true;primary=error;throw error;}
  finally{try{await retireCompositeOwners([...(!returned&&result?[()=>result.release()]:[]),()=>literalPlan?.release()],failed?{primary}:{});}finally{r.busy=false;}}
 }
 const callback=job=>run(job,'independent');
 callback.runGlobal=({plan,...job})=>{requireValue(plan?.mode==='global'&&plan.global,'Explicit native global comparison plan required.');const d=plan.global.contextDomain;return run({...job,window:{id:'global-analysis',kind:'region',bounds:[d.rect.x0,d.rect.y0,d.rect.x1,d.rect.y1],polygon:[[d.rect.x0,d.rect.y0],[d.rect.x1,d.rect.y0],[d.rect.x1,d.rect.y1],[d.rect.x0,d.rect.y1]],...plan.global,status:'ready'}},'global');};
 callback.retainWindows=async plan=>{requireValue(!closed&&['independent','global'].includes(plan?.mode),'Canonical EfficientLoFTR window plan required.');const keep=new Set(plan.mode==='global'&&plan.global?[key('global',{id:'global-analysis',fingerprint:plan.global.fingerprint},plan.originalTask?.efficientLoFtrComparison?.fingerprint)]:plan.windows.filter(w=>w.status!=='empty').map(w=>key('independent',w,plan.originalTask?.efficientLoFtrComparison?.fingerprint)));await retireCompositeOwners([...resources].filter(([id])=>!keep.has(id)).map(([,r])=>()=>r.retire()));};
 callback.dispose=()=>{closed=true;lifetime.abort();if(closing)return closing;closing=retireCompositeOwners([...resources.values()].map(r=>()=>r.retire()));void closing.finally(()=>{closing=null;}).catch(()=>{});return closing;};
 callback.state=()=>({closed,entries:resources.size,loans:[...resources.values()].reduce((n,r)=>n+r.loans,0)});return callback;
}
