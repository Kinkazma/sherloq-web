import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './original-source-regions.js?v=0.25.0';
import {scopeFingerprint} from './batch-scientific-preparation.js?v=0.25.0';
import {scientificScopeRgbExclusions} from './scientific-scope-rgb-selection.js?v=0.25.0';
import {requireValue,checkAbort,EngineError} from './unified-engine/src/errors.js';

/** Unlike batch classifier preparation, the simple geometric detector can use
 * a strict admitted domain. Empty acquisitions never imply whole image unless
 * the source owner explicitly supplies that intent. The captured Original
 * ceiling is intersected intact; its text/human exclusions are not filtered. */
export async function subimagesSourceDomain({image,scope,wholeImageWhenNoAcquisitions=false},{signal}={}){
 checkAbort(signal);requireValue(typeof wholeImageWhenNoAcquisitions==='boolean'&&image?.sourceSha256===scope?.sourceSha256&&image.width===scope.width&&image.height===scope.height&&Array.isArray(scope.regions)&&Array.isArray(scope.excluded)&&await scopeFingerprint(scope)===scope.fingerprint,'Subimage detection requires its exact source-bound editor scope.');checkAbort(signal);
 if(!scope.regions.length&&!wholeImageWhenNoAcquisitions)throw new EngineError('SOURCE_SCOPE_EMPTY','The editor admits no acquisition; only the source owner can explicitly request whole-image detection.');
 // This detector has no native text-candidate mask. OCR text that is already
 // an explicit exclusion stays hard. Only verified acquisition complements
 // are redundant with the positive union and may be omitted.
 const {excluded}=scientificScopeRgbExclusions(scope,{nativeTextCandidates:false}),state=await createOriginalSourceRegionsState({sourceSha256:image.sourceSha256,width:image.width,height:image.height});
 const geometry=(r,id,kind)=>{const polygon=r.polygon??r;requireValue(Array.isArray(polygon)&&polygon.length>=3,'A subimage detection zone needs its original polygon.');return{id,kind,enabled:true,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon};};
 const zones=[...scope.regions.map((r,i)=>geometry(r.polygon?r:[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],'subimage-positive-'+i,'acquisition')),...excluded.map((p,i)=>geometry(p,'subimage-negative-'+i,'exclusion'))];
 const snapshot=await state.replaceZones(zones,{positiveMode:scope.regions.length?'selected':'whole',enabled:true,signal});checkAbort(signal);
 const ceiling=image.sourceRegionCeiling??image.originalSourceRegions??scope.sourceRegionCeiling;
 const domain=await compileOriginalSourceRegions(snapshot,{...(ceiling?{ceiling}:{}),signal});checkAbort(signal);
 if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','The current editor and Original ceiling admit no pixels for geometric detection.');return domain;
}
