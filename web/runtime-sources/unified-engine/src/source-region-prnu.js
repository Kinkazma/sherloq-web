import "../../runtime-context.js?v=0.30.0";
import{createPrnuDomainOwner}from'./prnu-domain-owner.js';
import{prnuParams,prnuReferences}from'./prnu.js';
import{requireValue,checkAbort,normalizeResourceError}from'./errors.js';

/** Fingerprints remain owned by the loaded database. Only query-native Wiener
 * residuals are cached on the scoped query source; no camera values are cached. */
export async function sourceRegionPrnu({task,original,derived,domain,budget,signal,onProgress,profile={},cpuKernel,version,references=[],accountedPrnuHeapBytes=0}){
 const params=prnuParams(task.params);prnuReferences(params);const reference=references.find(r=>r.id===params.databaseId);requireValue(reference?.database,'The actual loaded PRNU database owner is required.');
 const previous=derived.prnuDomainOwner,hit=previous?.matches(original,domain);let owner=previous,committed=false,primary;
 try{
  if(!hit)owner=await createPrnuDomainOwner(original,domain.descriptor,{budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},signal});
  const result=await owner.identify(reference.database,params,{signal,onProgress,backend:task.backend??'auto',accountedHeapBytes:accountedPrnuHeapBytes});checkAbort(signal);derived.prnuDomainOwner=owner;committed=true;if(previous&&previous!==owner)await previous.dispose();
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...(result.metrics.nonEvaluableContexts?{warnings:[{code:'NATIVE_CONTEXT_NOT_EVALUABLE',count:result.metrics.nonEvaluableContexts,allContexts:result.data.residualObservationCount===0,reason:'native-prnu-three-rows-columns'}]}:{}),data:result.data,layers:[],semantics:result.data.semantics,metrics:{...result.metrics,cache:{nativeResidualOwner:!!hit,nativeResiduals:result.metrics.residualCached}},provenance:{engine:version,operation:task.operation,params,backend:result.metrics.backend??'cpu',originalSha256:original.sha256,sourceRegionFingerprint:domain.fingerprint,sourceRegionOrigin:[...domain.origin],referenceDatabaseId:reference.id,referenceDatabaseSha256:reference.sha256??null,excludedParticipation:'omitted-before-native-wiener-and-global-ncc',kernelParity:'Unchanged complete native Wiener contexts and one ordered native NumPy NCC; not a masked full-image residual or a mean of per-context scores.'}};
 }catch(error){primary=normalizeResourceError(error);if(!hit||committed){if(committed&&derived.prnuDomainOwner===owner)derived.prnuDomainOwner=null;try{await owner?.dispose();}catch(cleanup){if(Object.isExtensible(primary))primary.cleanupError=cleanup;}}throw primary;}
}
