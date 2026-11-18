import {runNative16Operation} from './native16-operations.js';
import {native16GradientRegionRequested} from './native16-gradient-region-contract.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {gradientParams} from './gradient-parameters.js';
import {gradientFieldSurface} from './gradient-field.js';
import {acquireSourceRegionRecompression} from './source-region-recompression.js';
import {createRecompressedSourceRegionView} from './source-region-recompressed-view.js';
import {checkAbort,requireValue} from './errors.js';
export async function sourceRegionGradientField({task,original,derived,view,domain,budget,signal,onProgress,publishResult,isSourceCurrent,sourceBindingImageId,cpuKernel}){
 const params=gradientParams(task.params),native=native16GradientRegionRequested(task,original,sourceRegionDomainShape(domain));let recompressed,record,published=false,failed=false,primary;const started=native?performance.now():0;
 try{
  if(params.recompression)recompressed=await acquireSourceRegionRecompression({params,original,derived,view,domain,budget,signal,onProgress});
  const input=recompressed?createRecompressedSourceRegionView(view,domain,recompressed.store,{budget,signal}):view;
  const hooks={budget,signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'source-region-gradient-field',fraction}),backend:task.backend??'auto',domain,cacheKey:task.imageId+'\0source-region/gradient-field/'+domain.fingerprint+'/'+(recompressed?.codecPlan.identity??'original')};
  if(native){
   const surface=original.nativeSurface,presentationSurface=original.surface,sha=original.sha256,d=surface.descriptor,sd=presentationSurface.descriptor;
   const sourceBinding={imageId:sourceBindingImageId??task.imageId,sourceSurfaceId:sd.id,sourceRevision:sd.revision,sourceSha256:sha,nativeSurfaceId:d.id,nativeRevision:d.revision,profileIdentity:JSON.stringify([d.color,d.provenance])};
   const current=()=>original.nativeSurface===surface&&original.surface===presentationSurface&&original.sha256===sha&&(isSourceCurrent?.()??true);
   const backend=cpuKernel==='reference'?'cpu':task.backend??'auto',intent=cpuKernel==='reference'?'cpu':task.native16PreviewIntent??backend;
   record=original.native16PreviewOwner?.takeExactSourceRegion?.('detail.gradient',task.params??{},intent,domain.fingerprint);const promoted=!!record;
   if(!record)record=await runNative16Operation('detail.gradient',params,{surface,...hooks,backend,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,presentationSurface,sourceSurface:surface,sourceBinding,isSourceCurrent:current});
   if(promoted)record.metrics={...record.metrics,originalCalculation:{...record.metrics},promotedPreview:true,nativeComputations:0,sourceReads:0,workerJobs:0,gpuJobs:0,backend:'cpu',renderBackend:'retained-proxy',derivativeBackend:'retained-proxy',totalMs:performance.now()-started};
   requireValue(current(),'Native gradient Original changed before regional publication.');
  }else record=await gradientFieldSurface(original,params,{...hooks,view:input});checkAbort(signal);
  const bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,semantics:record.semantics,metrics:{...record.metrics,sourceRegionPolicy:'gradient-field-omitted-taps-before-prefilter-derivative-and-tensor'},provenance:{...(native?{...record.provenance,precision:{...record.provenance,requestedWorkingDepth:16,effectiveWorkingDepth:16,scope:sourceRegionDomainShape(domain)}}:{}),params,gradientMethod:params.method,gradientView:params.view,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-prefilter-derivative-and-tensor',presentationOutsideAnalysedSupport:'original-unanalysed',originalEncodedBytesPreserved:true,...(recompressed?{recompression:recompressed.provenance}:{})}};
 }catch(error){failed=true;primary=error;throw error;}finally{if(native)await retireCompositeOwners([()=>record&&!published?record.dispose():undefined],failed?{primary,requireAck:true}:{requireAck:true});else{if(record&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.maskRecords??{}).map(r=>r.surface.dispose())]);await recompressed?.release();}}
}
