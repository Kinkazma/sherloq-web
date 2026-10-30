import {assertBatchScientificScope} from './batch-catalog.js?v=0.30.0';
import {scopeFingerprint} from './batch-scientific-preparation.js?v=0.30.0';
import {batchBlobSha256} from './batch-run-resume.js?v=0.30.0';
import {compileOriginalSourceRegions,createOriginalSourceRegionsState} from './original-source-regions.js?v=0.30.0';
import {assertSourceRegionOperation,sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
export const LEGACY_BATCH_PIXEL_DOMAIN_VERSION='legacy-batch-pixel-domain/1';
const operations=new Set(['detail.wavelets','noise.blocking']),hashes=new WeakMap();
const failure=message=>Object.assign(Error(message),{code:'BATCH_SOURCE_REGIONS_INVALID'});
const check=signal=>signal?.throwIfAborted();
async function immutableBlobHash(blob,signal){
 const previous=hashes.get(blob);if(typeof previous==='string'){check(signal);return previous;}
 let pending=previous&&previous.signal===signal?previous.promise:null;
 if(!pending){pending=batchBlobSha256(blob,{signal});const record={signal,promise:pending};hashes.set(blob,record);pending.then(value=>hashes.set(blob,value),()=>{if(hashes.get(blob)===record)hashes.delete(blob);});}
 const answer=await pending;check(signal);return answer;
}
/** A prepared legacy scope is an input perimeter, never a human Original ceiling.
 * Only the two native-limit consumers are enabled here. No pixels are read by
 * this geometry bridge; the real ToolClient/Core still enforce the descriptor.
 */
export async function legacyBatchPixelDomain(image,operation,{signal,loadedSource,task,capabilities,admit=false}={}){
 if(!operations.has(operation))return null;
 if(image.originalSourceRegions||image.preparation?.originalSourceRegions||image.preparation?.sourceRegionDomain||image.preparation?.sourceRegionCeiling)throw failure('An announced Original source domain must be verified through its Original path.');
 check(signal);const owner=image.preparation,blob=image.blob,sha=image.sourceSha256,width=image.width,height=image.height;
 const scope=structuredClone(assertBatchScientificScope(image));
 const current=()=>{check(signal);if(image.preparation!==owner||image.blob!==blob||image.sourceSha256!==sha||image.width!==width||image.height!==height||owner.fingerprint!==scope.fingerprint)throw failure('The legacy source or scope changed while its input domain was prepared.');};
 if(!(blob instanceof Blob)||scope.sourceSha256!==sha||scope.width!==width||scope.height!==height)throw failure('The prepared scope and original encoded source identity differ.');
 if(await scopeFingerprint(scope)!==scope.fingerprint)throw failure('The legacy scientific scope fingerprint is stale.');current();
 if(await immutableBlobHash(blob,signal)!==sha)throw failure('The original encoded source bytes do not match the legacy scientific scope.');current();
 if(loadedSource){const grid=loadedSource.surface?.descriptor??loadedSource.surface??loadedSource;if(loadedSource.sha256!==sha||grid.width!==width||grid.height!==height)throw failure('The loaded native source grid does not match the legacy scientific scope.');}
 if(admit&&(!loadedSource||task?.operation!==operation||!capabilities))throw failure('Actual task, loaded source and native capabilities are required for scientific admission.');
 const zones=[...scope.regions.map((region,index)=>({...region,id:'legacy-acquisition-'+index,kind:'acquisition',enabled:true,origin:'legacy-batch-preparation'})),...scope.excluded.map((polygon,index)=>({id:'legacy-exclusion-'+index,kind:'exclusion',enabled:true,origin:'legacy-batch-preparation',polygon,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))}))];
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});current();
 const snapshot=await state.replaceZones(zones,{enabled:true,positiveMode:'selected'});current();
 const domain=await compileOriginalSourceRegions(snapshot);current();
 // Recheck the owner itself, not only the detached copy, after all awaits.
 if(await scopeFingerprint(owner)!==scope.fingerprint)throw failure('The legacy scientific scope changed during source-domain compilation.');current();
 if(admit)assertSourceRegionOperation(operation,{shape:sourceRegionDomainShape(domain),params:task.params,task,capabilities});
 return domain.descriptor;
}
