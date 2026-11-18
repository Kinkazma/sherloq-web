import "../../runtime-context.js?v=0.33.2";
import {getNative16EchoSourceOwner} from './native16-echo-source.js';
import {echoHeapBytes} from './echo-math.js';
import {runNative16Operation} from './native16-operations.js';
import {native16EchoParams,native16EchoRegionRequested} from './native16-echo-contract.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,requireValue} from './errors.js';

/** The literal Original owns both native observations and canonical background.
 * The runtime alone publishes under it and retains the derived presentation. */
export async function sourceRegionEcho({task,original,domain,budget,signal,onProgress,publishResult,isSourceCurrent,sourceBindingImageId,cpuKernel,profile}){
 const shape=sourceRegionDomainShape(domain),params=native16EchoParams(task.params);
 requireValue(native16EchoRegionRequested(task,original,shape),'This regional Echo request needs genuine admitted UInt16 observations.');
 const surface=original.nativeSurface,presentationSurface=original.surface,sha=original.sha256,d=surface.descriptor,sd=presentationSurface.descriptor;
 const sourceBinding={imageId:sourceBindingImageId??task.imageId,sourceSurfaceId:sd.id,sourceRevision:sd.revision,sourceSha256:sha,nativeSurfaceId:d.id,nativeRevision:d.revision,profileIdentity:JSON.stringify([d.color,d.provenance])};
 const current=()=>original.nativeSurface===surface&&original.surface===presentationSurface&&original.sha256===sha&&(isSourceCurrent?.()??true);
 const backend=cpuKernel==='reference'?'cpu':task.backend??'auto',intent=cpuKernel==='reference'?'cpu':task.native16PreviewIntent??backend,started=performance.now();
 let record,promotedHeap,published=false,failed=false,primary;
 try{
  checkAbort(signal);requireValue(current(),'Native Echo Original changed before regional execution.');
  record=original.native16PreviewOwner?.takeExactSourceRegion?.('detail.echo',task.params??{},intent,domain.fingerprint);const promoted=!!record;
  if(promoted&&shape==='rectangle')promotedHeap=budget.reserve(echoHeapBytes());
  if(!record)record=await runNative16Operation('detail.echo',params,{surface,
   budget,signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'source-region-echo',fraction}),backend,
   temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,maxWorkers:cpuKernel==='auto'?profile?.maxWorkers??1:1,
   sourceSurface:surface,sourceBinding,isSourceCurrent:current,domain,presentationSurface,echoSourceOwner:getNative16EchoSourceOwner(original,{budget}),
   cacheKey:sourceBinding.imageId+'\0native16/echo/region/'+domain.fingerprint+'/'
  });
  if(promoted)record.metrics={...record.metrics,originalCalculation:{...record.metrics},cache:{...record.metrics?.cache,result:true},promotedPreview:true,nativeComputations:0,sourceReads:0,workerJobs:0,gpuJobs:0,backend:'cpu',renderBackend:'retained-proxy',derivativeBackend:'retained-proxy',totalMs:performance.now()-started};
  checkAbort(signal);requireValue(current(),'Native Echo Original changed before regional publication.');
  const bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,semantics:record.semantics,
   metrics:{...record.metrics,sourceRegionPolicy:'native-echo-observed-boundaries-global-admitted-reduction'},
   provenance:{...record.provenance,precision:{...record.provenance,requestedWorkingDepth:16,effectiveWorkingDepth:16,scope:shape},params,
    sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-native-derivatives-and-union-global-channel-extrema',
    presentationOutsideAnalysedSupport:'original-unanalysed',originalEncodedBytesPreserved:true}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{await retireCompositeOwners([async()=>{if(record&&!published){const reply=await record.dispose();requireValue(reply!==false&&reply!==0,'Regional Echo record retirement was not acknowledged.');record=null;}promotedHeap?.();promotedHeap=null;}],failed?{primary,requireAck:true}:{requireAck:true});}
}
