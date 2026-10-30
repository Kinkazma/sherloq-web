import "../../runtime-context.js?v=0.30.0";
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {createCompiledStrictDenseSource} from './dense-strict-source.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

const shiftPolygons=(polygons,origin)=>(polygons??[]).map(poly=>poly.map(([x,y])=>[x-origin[0],y-origin[1]]));
const scopePolygon=r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
export function sparseNativeWindowParameters(task,origin,{analysisWindowMode}={}){
 const scope=task.params?.scientificScope??task.scientificScope,input={...task.params};delete input.scientificScope;
 if(input.compare===true&&(!Array.isArray(input.regions)||input.regions.length!==2))throw new EngineError('SCIENTIFIC_SCOPE_PAIR_REQUIRED','Native comparison requires its two explicitly selected acquisition polygons; an envelope is a separate analysis window.');
 // A scientific scope's searchRegions enumerates autonomous parent jobs.
 // Once the canonical planner has selected THIS window it must not expand
 // into every parent search job a second time. Exact candidate/context
 // certificates already delimit the input. Explicit native compare ROIs
 // remain a separate, unchanged two-region option.
 const orchestrated=scope&&analysisWindowMode!==undefined;
 if(orchestrated)requireValue(['independent','global'].includes(analysisWindowMode),'Unknown native analysis-window mode.');
 const nativeRegions=input.compare===true?input.regions:orchestrated?[]:scope?(scope.searchRegions??scope.regions).map(scopePolygon):input.regions;
 input.regions=shiftPolygons(nativeRegions,origin);
 // The verified window context/candidate domains already own scope negatives.
 // Re-rasterizing those half-open boundaries as inclusive native polygons erodes
 // admitted edge pixels. Preserve and translate explicit native exclusions only.
 input.excluded=shiftPolygons(input.excluded,origin);input.guides=shiftPolygons(input.guides,origin);
 return{input,scientificScopeFingerprint:scope?.fingerprint??null,nativeRegionPolicy:input.compare===true?'explicit-native-comparison-pair':orchestrated?'canonical-window-candidate-domain':'native-declared-search-regions'};
}

/** Compile this canonical window directly. Re-running the old global context
 * planner here could expand its RGB frame to neighbouring acquisitions.
 * Scientific polygons are translated, including disjoint polygons: compare
 * stays true with its two native ROIs; a mini-window cannot borrow the other.
 * onOwner receives the existing compiled-source owner before any await. */
export async function prepareSparseNativeWindow({original,window,task},{budget,signal,onOwner}={}){
 requireValue(task?.operation==='tampering.copyMove.sparse'&&window?.status!=='empty','A nonempty canonical sparse window is required.');
 const record=sparseStrictImageRecord(original,budget),source=record.originalSource??record,context=window.contextDomain,candidate=window.candidateDomain;
 requireValue(source.sha256===context?.sourceSha256&&source.sha256===candidate?.sourceSha256&&typeof window.fingerprint==='string','Window domains differ from Original.');
 const origin=[...context.origin],{input,scientificScopeFingerprint}=sparseNativeWindowParameters(task,origin);
 const prepared={source:source.surface,sourceDomain:context,candidateDomain:candidate,contextDomain:context,width:context.width,height:context.height,origin,fingerprint:window.fingerprint};
 const compiled=await createCompiledStrictDenseSource(prepared,{budget,signal,original:source,excluded:input.excluded,onOwner});checkAbort(signal);
 const fullRectangle=context.countIncluded===context.width*context.height&&candidate.countIncluded===context.countIncluded&&candidate.rect.x0===context.rect.x0&&candidate.rect.y0===context.rect.y0&&candidate.rect.x1===context.rect.x1&&candidate.rect.y1===context.rect.y1;
 const image={format:'rgb8',width:context.width,height:context.height,readWindow:(rect,hooks)=>compiled.source.view.readWindow(rect,hooks),temporarySession:source.session,getTemporarySession:source.ensureTemporarySession,readRows(y,count,options={}){return compiled.source.view.readWindow({x:0,y,width:context.width,height:count},options);}};
 return{compiled,image,input,origin,fullRectangle,contextDomain:context,candidateDomain:candidate,scientificScopeFingerprint};
}

