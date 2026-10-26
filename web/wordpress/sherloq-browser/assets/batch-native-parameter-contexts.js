import {legacyBatchPixelDomain,LEGACY_BATCH_PIXEL_DOMAIN_VERSION} from './legacy-batch-pixel-domain.js';
import {originalBatchTaskDomain} from './original-source-regions-batch.js';
import {nativeParameterContexts} from './native-context-constraints.js';
export const batchNativeParameterOperations=Object.freeze(['detail.wavelets','noise.blocking']);
/** UI-only identity; actual domain validation still precedes context publication. */
export function batchNativeParameterContextKey(images,operations){return JSON.stringify([operations,[...images].filter(i=>i.selected).map(i=>[i.id,i.sourceSha256,i.width,i.height,i.preparation?.status,i.preparation?.fingerprint,i.preparation?.sourceRegionDomain?.fingerprint,i.originalSourceRegions?.fingerprint,i.originalSourceRegions?.revision]),LEGACY_BATCH_PIXEL_DOMAIN_VERSION]);}
/** Same source-domain decision as batch-runner. Never infer an unconsumed scope. */
export async function prepareBatchNativeParameterContexts(images,operations,{signal}={}){
 if(!operations.length)return[];if(operations.some(op=>!batchNativeParameterOperations.includes(op)))throw Object.assign(Error('This batch numeric metadata operation is unsupported.'),{code:'INVALID_INPUT'});
 const contexts=[];for(const image of images.filter(i=>i.selected)){
  signal?.throwIfAborted();if(image.preparation?.status!=='ready')throw Object.assign(Error('Selected batch geometry must be prepared before native numeric admission.'),{code:'BATCH_SCOPE_REQUIRED'});
  let domain;for(const operation of operations){const next=await originalBatchTaskDomain(image,operation,{admit:false})??await legacyBatchPixelDomain(image,operation,{signal});signal?.throwIfAborted();if(domain!==undefined&&(domain?.fingerprint??null)!==(next?.fingerprint??null))throw Object.assign(Error('Batch native numeric domains differ between operations.'),{code:'BATCH_SOURCE_REGIONS_INVALID'});domain=next;}
  for(const context of await nativeParameterContexts({width:image.width,height:image.height,sourceSha256:image.sourceSha256,sourceRegionDomain:domain},{signal}))contexts.push({...context,imageId:image.id,imageName:image.name});
 }return contexts;
}
