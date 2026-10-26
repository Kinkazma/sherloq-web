import "../../runtime-context.js?v=0.25.0";
import{createComparisonDomainOwner}from'./comparison-domain-owner.js';
import{comparisonParams}from'./comparison.js';
import{createSegmentedBytes}from'./segmented-bytes.js';
import{createMaskSurface}from'./rgb-surface.js';
import{requireValue,checkAbort,normalizeResourceError,controlCheckpoint}from'./errors.js';

/** Paired source owners are captured before either Original is cropped. The
 * caller owns admission and must retire this owner when either source unloads. */
export async function sourceRegionComparison({task,original,derived,domain,budget,signal,onProgress,profile={},cpuKernel,version,references=[],publishResult,releaseResult}){
 const params=comparisonParams(task.params),reference=references.find(r=>r.id===params.referenceImageId);requireValue(reference?.surface,'The actual imported comparison reference is required.');
 const previous=derived.comparisonDomainOwner,hit=previous?.matches(original,reference,domain);let owner=previous,record,mask,maskSurface,bundle,published=false,committed=false,primary;
 const cleanup=async actions=>{const failures=[];for(const action of actions)try{await action();}catch(error){failures.push(error);}return failures;};
 const rollback=async()=>{if(!bundle)return[];const ids=[bundle.surface?.id,...Object.values(bundle.maskSurfaces??{}).map(s=>s.id)].filter(Boolean);return cleanup(ids.map(id=>()=>releaseResult(id)));};
 try{
  if(!hit)owner=await createComparisonDomainOwner(original,reference,domain.descriptor,{budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},originalArithmetic:cpuKernel==='reference',sourceIds:[task.imageId,reference.id],signal});
  record=await owner.run(params,{signal,onProgress});checkAbort(signal);
  const width=domain.width,height=domain.height;mask=await createSegmentedBytes(width*height,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
  for(let y=0;y<height;y++){const admission=budget.reserve(width);try{const row=new Uint8Array(width);for(const[left,right]of domain.rowIntervals(y))row.fill(1,left,right);await mask.write(row,y*width);}finally{admission();}if((y&31)===31)await controlCheckpoint(signal);}await mask.flush();checkAbort(signal);
  maskSurface=createMaskSurface(mask,{width,height,budget,range:[0,1],semantics:'1=paired observation admitted before both native calculations;0=unanalysed evidence background.'});mask=null;
  record.pairedSourceIds=[reference.id];record.maskRecords={analysis_scope:{surface:maskSurface,pairedSourceIds:[reference.id]}};record.provenance={engine:version,operation:task.operation,params,backend:'cpu',originalSha256:original.sha256,referenceSha256:reference.sha256,sourceRegionFingerprint:domain.fingerprint,pairedDomain:structuredClone(record.data.pairedDomain),excludedParticipation:'omitted-before-both-native-inputs',presentationOutsideDomain:'original-unanalysed'};
  bundle=publishResult(task.imageId,record);published=true;derived.comparisonDomainOwner=owner;committed=true;
  if(previous&&previous!==owner)await previous.dispose();
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data:record.data,semantics:record.semantics,metrics:{...record.metrics,cache:{...record.metrics?.cache,pairedOwner:!!hit}},provenance:record.provenance};
 }catch(error){primary=normalizeResourceError(error);const failures=[];
  if(published){failures.push(...await rollback());if(committed&&derived.comparisonDomainOwner===owner)derived.comparisonDomainOwner=null;failures.push(...await cleanup([()=>owner?.dispose()]));}
  else{failures.push(...await cleanup([()=>record?.surface.dispose(),()=>maskSurface?.dispose(),()=>mask?.dispose(),()=>!hit&&owner?.dispose()]));}
  if(failures.length&&Object.isExtensible(primary))primary.details={...primary.details,cleanupErrors:failures.map(({name,code,message})=>({name,code,message}))};throw primary;
 }
}
