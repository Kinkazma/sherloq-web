import {createOriginalSourceRegionsState,compileOriginalSourceRegions,validateOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {assertSourceRegionOperation,sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
import {assertBatchScientificScope} from './batch-catalog.js?v=0.31.0';
const check=signal=>signal?.throwIfAborted();
const bounds=polygon=>({x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))});
const polygon=region=>region.polygon??[[region.x0,region.y0],[region.x1,region.y0],[region.x1,region.y1],[region.x0,region.y1]];
/** A caller may retain mutable image records; an in-flight method keeps the
 * exact source and prepared perimeter it captured, including after awaits. */
export function captureBatchPreparedInput(image,{signal}={}){
 check(signal);const owner=image.preparation,blob=image.blob;
 const identity=()=>JSON.stringify([image.id,image.sourceSha256,image.width,image.height,image.preparation,image.originalSourceRegions??null,image.sourceRegionCeiling??null]);
 const captured=identity();return()=>{check(signal);if(image.preparation!==owner||image.blob!==blob||identity()!==captured)throw Object.assign(Error('La source ou les zones du lot ont changé pendant l’analyse.'),{code:'BATCH_SOURCE_REGIONS_CHANGED'});};
}
/** Bridge only a completed legacy preparation to the maintained Original input
 * domain. Source bytes and scientific settings are not rewritten. This never
 * turns a prepared search envelope into candidate membership. */
export async function compileBatchPreparedInputDomain(image,{signal}={}){
 const current=captureBatchPreparedInput(image,{signal});current();const scope=structuredClone(assertBatchScientificScope(image)),size={sourceSha256:scope.sourceSha256,width:scope.width,height:scope.height};
 if(image.sourceSha256!==size.sourceSha256)throw Object.assign(Error('La préparation du lot ne correspond pas aux octets de sa source.'),{code:'BATCH_SOURCE_REGIONS_INVALID'});
 const zones=[...scope.regions.map((region,index)=>{const p=polygon(region);return{id:'batch-input-positive-'+index,kind:'acquisition',enabled:true,...bounds(p),polygon:p,origin:'batch-preparation'};}),...scope.excluded.map((p,index)=>({id:'batch-input-negative-'+index,kind:'exclusion',enabled:true,...bounds(p),polygon:p,origin:'batch-preparation'}))];
 const state=await createOriginalSourceRegionsState(size);current();const snapshot=await state.replaceZones(zones,{positiveMode:'selected',enabled:true,signal});current();
 const rawCeiling=image.originalSourceRegions??scope.originalSourceRegions??scope.sourceRegionCeiling??image.sourceRegionCeiling,ceiling=rawCeiling?await validateOriginalSourceRegions(rawCeiling,size):undefined;current();
 const domain=await compileOriginalSourceRegions(snapshot,{...(ceiling?{ceiling}:{})});current();return domain.descriptor;
}
/** Admission uses the engine's current published adapters/parameter rules.
 * Unsupported scope is refused before scientific execution, never postmasked. */
export async function admitBatchPreparedInputDomain(descriptor,operation,{capabilities,params,task,signal}={}){
 const domain=await compileOriginalSourceRegions(descriptor);check(signal);assertSourceRegionOperation(operation,{shape:sourceRegionDomainShape(domain),capabilities,params,task});return domain.descriptor;
}

/** Describe an input-filtered diagnostic only after the actual native output
 * attests the exact admitted source/domain. This never grants a batch vote. */
export function batchPreparedViewSupport(recipe,image,support,output,descriptor){
 if(recipe?.kind!=='view'||support?.mode!=='raw-only'||!descriptor||typeof image?.id!=='string'||image.id.length===0||typeof image.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(image.sourceSha256)||typeof descriptor.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(descriptor.fingerprint)||!Number.isSafeInteger(descriptor.countIncluded)||descriptor.countIncluded<0)return support;
 const source=descriptor.snapshot?.sourceSha256,provenance=output?.provenance,executed=output?.metrics?.sourceRegion;
 if(source!==image.sourceSha256||provenance?.originalSha256!==source||provenance?.sourceRegionDomain?.fingerprint!==descriptor.fingerprint||executed?.domainFingerprint!==descriptor.fingerprint||executed?.originalImageId!==image.id||executed?.includedPixels!==descriptor.countIncluded||provenance?.originalEncodedBytesPreserved!==true)return support;
 return {...support,mode:'native-input-diagnostic',qualifiedForScopedSignal:false,nativeInputDomain:{fingerprint:descriptor.fingerprint,sourceSha256:source,includedPixels:descriptor.countIncluded,coordinates:'original-pixels'},reason:'Native input regions applied; inspection output without an automatic batch vote.'};
}
