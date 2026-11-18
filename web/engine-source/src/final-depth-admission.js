import {colorSpaceResidentAdmissionPlan} from './segmented-color-spaces.js';
import {nativeColorSpaceParametersAdmitted} from './opencv-operations.js';
import {native16DefectsAdmissionPlan} from './native16-defects.js';
import {segmentedDefectsExecutionPlan} from './segmented-defects.js';
import {defectParams} from './defect-pixels.js';
import {blockingResidentAdmissionPlan} from './segmented-blocking.js';
import {native16BlockingParametersAdmitted,native16DefectsParametersAdmitted} from './native16-parameter-contract.js';
import {observedNlmGpuAdmissionPlan} from './observed-nlm-gpu.js';
import {native16EchoRectanglePlan} from './native16-echo-source.js';
import {native16EchoParams,native16EchoParametersAdmitted} from './native16-echo-contract.js';
import {echoExecutionPlan} from './echo-layout.js';
import {echoHeapBytes} from './echo-math.js';
import {echoRegionalExecutionPlan} from './source-region-general-derivatives.js';
import {native16GradientRegionRequested} from './native16-gradient-region-contract.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {pcaExecutionPlan} from './pca-execution-plan.js';
import {native16AdjustAdmissionPlan} from './native16-adjust.js';
import {separationHeapBytes,SEPARATION_HEAP_BYTES,separationHalo} from './separation-math.js';
import {payloadBytes} from './pixel-operations.js';
import {preparedMagnifierPlan,preparedMagnifierReadPlan} from './prepared-magnifier-surface.js';
import {native16DisplayPlan} from './native16-display-owner.js';
import {MAX_DISPLAY_PIXELS} from './display-sampling.js';
import {pcaStreamHeapBytes} from './pca-stream-math.js';
// Optional final-result residency must not change admission of useful work.
// All bounds use the real execution plans; none is a Budget or an allocation.
import {frequencyResidentAdmissionPlan} from './segmented-frequency.js';
import {waveletResidentAdmissionPlan} from './segmented-wavelet.js';
import {frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {native16OperationAdmissionPlan,native16ParametersAdmitted} from './native16-operations.js';
import {native16SeparationParams,native16SeparationAdmissionPlan} from './native16-separation.js';
import {separationExecutionPlan,separationResidentAdmissionPlan} from './segmented-separation.js';
import {separationCacheBytes} from './separation-cache.js';
import {gradientFieldHeadroom} from './gradient-field.js';
import {native16GradientColorAdmissionPlan,native16GradientRegionWindowPlan} from './native16-gradient.js';
import {isGradientField} from './gradient-field-parameters.js';
import {gradientParams} from './gradient-parameters.js';
import {minmaxAdmissionPlan} from './segmented-minmax.js';
import {externalPreviewNativeHeadroom,externalPreviewScopedGradientHeadroom} from './external-preview-admission.js';
import {externalPreviewParallelHeadroom} from './external-preview-parallel-admission.js';
import {equalizationPlan} from './equalization-settings.js';
import {native16CompositeEqualizationPlan} from './native16-equalization-contract.js';
import {nativeEqualizationSurfaceAdmissionPlan} from './equalization-native-admission.js';
import {equalizationAdmissionPlan} from './equalization-presentation.js';
import {migrationWorkspaceBytes,missingMigrationWorkspaceBytes} from './migration-workspace.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {native16DomainAdditionalBytes} from './native16-domain.js';
const MiB=1024**2,unknown=reason=>({known:false,reason});
function pcaNativePostDescriptor(task,image,w,h){const original=image.surface.descriptor,native=image.nativeSurface.descriptor,binding={imageId:task.imageId,sourceSurfaceId:original.id,sourceRevision:original.revision,sourceSha256:image.sha256,nativeSurfaceId:native.id,nativeRevision:native.revision,profileIdentity:JSON.stringify([native.color,native.provenance])};return{width:w,height:h,format:'rgb16',depth:16,sourceDepth:16,sourceWidth:w,sourceHeight:h,orientation:1,color:{primaries:'srgb',transfer:'srgb'},provenance:{role:'PCA-normalized-code-visualization',inputDepth:16,sourceBinding:binding}};}
export function finalDepthAdmissionPlan(task,image,{budget,runtimeBytes=0,profile={},cpuKernel='auto',contract,preparedSourceRegionDomain,preparedSourceRegionMetadataBytes=0,preparedEchoView,preparedEchoSourceOwner}={}){
 try{
  if(!image?.surface?.descriptor)return unknown('no-canonical-source');
  const regionShape=preparedSourceRegionDomain?sourceRegionDomainShape(preparedSourceRegionDomain):task.sourceRegionDomain?sourceRegionDomainShape(task.sourceRegionDomain):'identity',regional=regionShape!=='identity',domain=regional?preparedSourceRegionDomain:null;
  if(regional&&(!['detail.gradient','detail.echo'].includes(task.operation)||!domain||domain.sourceSha256!==image.sha256||domain.sourceWidth!==image.surface.descriptor.width||domain.sourceHeight!==image.surface.descriptor.height||domain.empty||!Array.isArray(domain.origin)||domain.origin.length!==2||![domain.width,domain.height,...domain.origin,domain.countIncluded].every(Number.isSafeInteger)||domain.width<1||domain.height<1||domain.origin.some(v=>v<0)||domain.origin[0]+domain.width>domain.sourceWidth||domain.origin[1]+domain.height>domain.sourceHeight||domain.countIncluded<1||domain.countIncluded>domain.width*domain.height))return unknown(task.operation==='detail.echo'?'unprepared-regional-echo':'unprepared-regional-gradient');
  const equalization=Object.hasOwn(task.params??{},'equalization')?equalizationPlan(task.operation,task.params):null,params=equalization?.base??task.params??{},backend=cpuKernel==='reference'?'cpu':task.backend??'auto',native=!!image.nativeSurface&&(task.workingDepth??image.workingDepth??16)===16&&native16ParametersAdmitted(task.operation,task.params),sourceDescriptor=(native?image.nativeSurface:image.surface).descriptor,descriptor=regional?{...sourceDescriptor,width:domain.width,height:domain.height}:sourceDescriptor,w=descriptor.width,h=descriptor.height,n=w*h;
  if(![w,h,n,runtimeBytes].every(Number.isSafeInteger)||w<1||h<1)return unknown('invalid-plan-input');
  // Finance the common tables and lazy input/returned-photo descriptors before
  // any branch chooses its existing high adaptive band/worker buffers.
  const nativeDomainBytes=native?native16DomainAdditionalBytes(task.operation,task.params,sourceDescriptor,{budget}):0;
  runtimeBytes+=nativeDomainBytes;if(!Number.isSafeInteger(runtimeBytes))return unknown('unsafe-native-domain-bound');
  const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*MiB:0,canMigrate=!!(image.session||image.ensureTemporarySession),storageOverheadBytes=4*MiB+(canMigrate?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(n*(native?6:3),image.session)):0),options={runtimeBytes,ioBytes,storageOverheadBytes};
  const composite=native?native16CompositeEqualizationPlan(task.operation,task.params):null;
  let plan;
  if(task.operation==='detail.echo'){
   if(!native16EchoParametersAdmitted(params,regionShape))return unknown('echo-parameters-not-admitted');
   if(backend!=='cpu'&&backend!=='auto')return unknown('echo-backend-not-admitted');
   const p=native16EchoParams(params),source=native?image.nativeSurface:image.surface;
   let regionMetadataBytes=0,metadataBytes=0,transportBytes=0,rectangleSourceBytes=0,rectangleSourcePlan;
   if(regional){
    const viewSource=preparedEchoView?.originalSource?.descriptor,viewDomain=preparedEchoView?.domain;
    if(!viewSource||viewSource.id!==source.descriptor.id||viewSource.revision!==source.descriptor.revision||viewSource.format!==source.descriptor.format||preparedEchoView.descriptor?.format!==source.descriptor.format||viewDomain?.fingerprint!==domain.fingerprint||viewDomain.sourceSha256!==image.sha256||viewDomain.width!==w||viewDomain.height!==h)return unknown('echo-regional-view-not-attested');
    transportBytes=sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true});metadataBytes=transportBytes*4+65536;
    if(!Number.isSafeInteger(preparedSourceRegionMetadataBytes)||![0,metadataBytes].includes(preparedSourceRegionMetadataBytes))return unknown('regional-metadata-credit-not-attested');
    regionMetadataBytes=metadataBytes-preparedSourceRegionMetadataBytes;
    if(native&&regionShape==='rectangle'){
     if(preparedEchoSourceOwner&&preparedEchoSourceOwner.budget!==budget)return unknown('echo-rectangle-owner-budget-mismatch');
     rectangleSourcePlan=preparedEchoSourceOwner?preparedEchoSourceOwner.plan(source,domain):native16EchoRectanglePlan(source,domain);
     if(rectangleSourcePlan?.known!==true||rectangleSourcePlan.inputSurfaceId!==source.descriptor.id||rectangleSourcePlan.inputRevision!==source.descriptor.revision||rectangleSourcePlan.domainFingerprint!==domain.fingerprint||rectangleSourcePlan.width!==w||rectangleSourcePlan.height!==h||rectangleSourcePlan.pixelStoreBytes!==0||rectangleSourcePlan.maskBytes!==0)return unknown('echo-rectangle-source-plan-not-attested');
     rectangleSourceBytes=rectangleSourcePlan.missingRetainedBytes??rectangleSourcePlan.retainedBytes;
     if(!Number.isSafeInteger(rectangleSourceBytes)||rectangleSourceBytes<0)return unknown('echo-rectangle-source-credit-not-attested');
    }
   }
   if(regional&&regionShape!=='rectangle'){
    // General reserves only missing capacity; its already-loaded heap stays
    // in NativeRun's resident credit. Whole/rectangle reserve the full heap.
    const loadedHeapBytes=echoHeapBytes(),execution=echoRegionalExecutionPlan(preparedEchoView,domain,p.radius,{loadedHeapBytes});
    if(!execution?.known||!execution.read?.known)return unknown('echo-regional-plan-not-attested');
    // The canonical RGB8 background is borrowed before derivative traversal.
    // Its actual window geometry is supplied by the same General plan.
    if(!Number.isSafeInteger(execution.presentationRows)||execution.presentationRows<1||!execution.presentationWindow||!Number.isSafeInteger(execution.presentationScopeStageBytes))return unknown('echo-regional-presentation-plan-pending');
    const canonical=image.surface,d=canonical.descriptor;let canonicalReadBytes=0;
    for(let y=0;y<h;y+=execution.presentationRows){
     const rect={...execution.presentationWindow,y:domain.origin[1]+y,height:Math.min(execution.presentationRows,h-y)},outputBytes=rect.width*rect.height*3,read=canonical.readWindowPlan?.(rect);
     if(read&&(read.known!==true||read.outputBytes!==outputBytes||!Number.isSafeInteger(read.additionalBytes)||read.additionalBytes<0))return unknown('echo-canonical-source-read-not-attested');
     canonicalReadBytes=Math.max(canonicalReadBytes,outputBytes+(read?.additionalBytes??Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*3));
    }
    const sourceReadBytes=Math.max(execution.read.additionalBytes,canonicalReadBytes,execution.presentationScopeStageBytes),rawAlternativeBytes=Math.max(execution.rawStoreBytes,execution.optionalRawCacheBytes),storeOverhead=4*MiB+(canMigrate?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(Math.max(execution.rawStoreBytes,execution.outputStoreBytes,execution.scopeStoreBytes),image.session)):0);
    const bytes=runtimeBytes+regionMetadataBytes+storeOverhead+execution.outputStoreBytes+execution.scopeStoreBytes+rawAlternativeBytes+execution.missingHeapBytes+execution.stagingBytes+sourceReadBytes+ioBytes;
    plan={bytes,completeResidentAlternative:true,parallelWorkers:0,retainedResultBytes:execution.outputStoreBytes+execution.scopeStoreBytes,echo:{depth:native?16:8,regional:true,shape:regionShape,heapBytes:loadedHeapBytes+execution.missingHeapBytes,loadedHeapBytesInRuntime:loadedHeapBytes,runtimeExcludesMainEchoHeap:false,transportBytes,metadataBytes,metadataPreparationAlreadyFinanced:preparedSourceRegionMetadataBytes,rawAlternativeBytes,canonicalReadBytes,sourceReadBytes,plan:execution}};
   }else{
   const sourceReadPlan=typeof source.readWindowPlan==='function'?rect=>source.readWindowPlan(regional?{...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]}:rect):undefined;
   const execution=echoExecutionPlan(descriptor,p,{maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1,mainHeapBytes:echoHeapBytes(),heldHeapBytes:0,ioBytes,readWindowPlan:sourceReadPlan,readWindowInto:typeof source.readWindowInto==='function'});
   if(!execution.known||!execution.selected)return unknown('echo-row-not-admitted');
   // The actual Echo producer uses either its segmented raw store or the
   // optional chunk cache, never two simultaneous arithmetic banks.
   const rawAlternativeBytes=Math.max(execution.rawStoreBytes,execution.optionalRawCacheBytes),storeOverhead=4*MiB+(canMigrate?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(execution.rawStoreBytes,image.session)):0),workingBytes=execution.selected.additionalWorkingBytes;
   plan={bytes:runtimeBytes+regionMetadataBytes+rectangleSourceBytes+storeOverhead+execution.outputStoreBytes+rawAlternativeBytes+workingBytes,completeResidentAlternative:true,rows:execution.rows,parallelWorkers:execution.workers,retainedResultBytes:execution.outputStoreBytes,echo:{depth:native?16:8,regional,shape:regionShape,transportBytes,metadataBytes,metadataPreparationAlreadyFinanced:preparedSourceRegionMetadataBytes,rectangleSourceBytes,rectangleSourcePlan,rawKind:execution.layout.rawKind,heapBytes:execution.selected.grossHeapBytes,runtimeExcludesMainEchoHeap:true,rawStoreBytes:execution.rawStoreBytes,optionalRawCacheBytes:execution.optionalRawCacheBytes,rawAlternativeBytes,outputStoreBytes:execution.outputStoreBytes,workingBytes,plan:execution}};
   }
  }else if(task.operation==='inspection.magnifier'){
   if(equalization?.post&&!composite)return unknown('magnifier-post-equalization-not-attested');
   // Only the common native-Source Loupe bridge has a prepared final owner.
   // Sources without a native bank keep the historical RGB8 admission policy.
   if(!image.nativeSurface)return unknown('legacy-magnifier-has-no-attested-final-plan');
   const source=native?image.nativeSurface:image.surface,original=image.surface.descriptor,nd=image.nativeSurface.descriptor;
   const sourceBinding={imageId:task.imageId,sourceSurfaceId:original.id,sourceRevision:original.revision,sourceSha256:image.sha256,nativeSurfaceId:nd.id,nativeRevision:nd.revision,profileIdentity:JSON.stringify([nd.color,nd.provenance])};
   const producer=preparedMagnifierPlan(descriptor,params,{budget,sourceBinding,cacheKey:task.imageId+(native?'\0native16/magnifier/':'\0segmented/magnifier/')});
   if(!producer.observations)return{known:true,bytes:runtimeBytes+payloadBytes({bounds:producer.bounds,empty:true}),completeResidentAlternative:true,magnifierProducer:'prepared-empty',retainedResultBytes:0,rows:0,parallelWorkers:0};
   if(composite?.kind==='post'){
    // Passive plan of the actual prepared ROI; no second Surface/pixel backing.
    const input=image.nativeSurface,baseDescriptor={width:producer.width,height:producer.height,format:'rgb16',depth:16,sourceDepth:descriptor.sourceDepth??16,sourceWidth:producer.width,sourceHeight:producer.height,orientation:1,color:descriptor.color,provenance:descriptor.provenance};
    const plannedInput={descriptor:baseDescriptor,readWindowPlan(rect){
     const read=preparedMagnifierReadPlan(descriptor,params,{rect,display:false},{sourceBinding,readWindowInto:typeof input.readWindowInto==='function'}),actualRect={x:producer.bounds[0]+(rect.x??0),y:producer.bounds[1]+(rect.y??0),width:rect.width,height:rect.height},inner=typeof input.readWindowPlan==='function'?input.readWindowPlan(actualRect):null;
     if(inner&&inner.known!==true)return{known:false};
     return{known:true,outputBytes:read.outputBytes,additionalBytes:read.sourceLoanBytes+Math.max(read.sourceRowScratchBytes,inner?.additionalBytes??0)};
    }};
    const postStorage=4*MiB+(canMigrate?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(producer.observations*6,image.session)):0),post=nativeEqualizationSurfaceAdmissionPlan(plannedInput,composite,{budget,backend,runtimeBytes:0,storageOverheadBytes:postStorage,colorBackend:cpuKernel==='reference'?'cpu':'auto',displayAssumption:image.provenance?.displayProjection});
    if(!post?.known||!post.completeResidentAlternative)return unknown(post?.reason??'magnifier-native-post-plan-unknown');
    const bytes=runtimeBytes+Math.max(ioBytes+producer.additionalPreparationBytes,producer.retainedBytes+ioBytes+post.bytes);
    return Number.isSafeInteger(bytes)?{known:true,bytes,completeResidentAlternative:true,magnifierProducer:'prepared-source-lut/native16-equalization',retainedResultBytes:post.retainedResultBytes,rows:post.rows,parallelWorkers:post.parallelWorkers,nativeEqualization:post.nativeEqualization}:unknown('unsafe-composite-bound');
   }
   const color=native?native16DisplayPlan(descriptor,{displayAssumption:image.provenance?.displayProjection,backend:cpuKernel==='reference'?'cpu':'auto',totalPixels:producer.observations}):null;
   if(color&&!color.known)return unknown(color.limitation?.code??'magnifier-color-plan-unknown');
   const read=preparedMagnifierReadPlan(descriptor,params,{maximumPixels:MAX_DISPLAY_PIXELS,display:native},{sourceBinding,readWindowInto:typeof source.readWindowInto==='function',nativeSampler:typeof source.readNativeSampledWindow==='function',sampler:typeof source.readSampledWindow==='function'});
   // Original may still need its disk read workspace. The derived result owns
   // only LUT/metadata: it has no full output bank, migration or output IO.
   const bytes=runtimeBytes+Math.max(ioBytes+producer.additionalPreparationBytes,producer.retainedBytes+(color?.bytes??0)+ioBytes+read.additionalBytes);
   plan={bytes,completeResidentAlternative:true,magnifierProducer:'prepared-source-lut',retainedResultBytes:producer.retainedBytes,rows:producer.rows,parallelWorkers:1};
  }else if(task.operation==='inspection.adjust'){
   plan=native?native16AdjustAdmissionPlan({...image,surface:image.nativeSurface},task.params??{},{budget,runtimeBytes:Math.max(0,runtimeBytes-separationHeapBytes()),backend,colorBackend:cpuKernel==='reference'?'cpu':'auto',maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1}):externalPreviewParallelHeadroom(task.operation,image,contract?.validate(params)??params,{runtimeBytes,profile,cpuKernel,backend,contract});
  }else if(task.operation==='colors.pca'){
   plan=pcaExecutionPlan({width:w,height:h,inputDepth:native?16:8,retainedTables:!!image.nativeSurface,params,maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1,heapBytes:pcaStreamHeapBytes(),publicOutputCopyBytes:!native&&!image.segmented&&(cpuKernel==='reference'||n<1024*1024)?n*3:0,...options});
   if(composite?.kind==='post'){
    // Actual normalized PCA RGB16 colour domain, never the Original ICC.
    const intermediate=pcaNativePostDescriptor(task,image,w,h),post=nativeEqualizationSurfaceAdmissionPlan(intermediate,composite,{budget,backend,runtimeBytes:0,storageOverheadBytes,colorBackend:cpuKernel==='reference'?'cpu':'auto'});
    if(!plan?.completeResidentAlternative||!post?.known||!post.completeResidentAlternative)return unknown(post?.reason??'pca-native-post-plan-unknown');
    const bytes=Math.max(plan.bytes,plan.phases.publication+ioBytes+post.bytes);plan={...plan,bytes,retainedResultBytes:post.retainedResultBytes+plan.retainedResultBytes-n*6,nativeEqualization:post.nativeEqualization};
   }
  }
  else if(task.operation==='colors.space'){
   if(!nativeColorSpaceParametersAdmitted(task.params??{}))return unknown('color-space-parameters-not-admitted');
   if(backend!=='cpu'&&backend!=='auto')return unknown('color-space-backend-not-admitted');
   if(native&&(image.originalSource||[image.sourceRegionDomain,image.surface.descriptor.sourceRegionDomain].some(domain=>domain&&sourceRegionDomainShape(domain)!=='identity')))return unknown('color-space-native-source-domain-not-admitted');
   plan=colorSpaceResidentAdmissionPlan(image,params,{native,budget,profile,cpuKernel,contract,...options});
   if(plan?.known===false)return unknown(plan.reason??'color-space-residency-not-attested');
  }
  else if(task.operation==='pixels.defects'){
   if(!native16DefectsParametersAdmitted(task.params,regionShape))return unknown('defects-parameters-not-admitted');
   if(backend!=='cpu'&&backend!=='auto')return unknown('defects-scientific-backend-not-admitted');
   const p=defectParams(params);let execution;
   if(native){
    plan=native16DefectsAdmissionPlan(image.nativeSurface,p,{runtimeBytes,ioBytes,storageOverheadBytes:0,sourceSurface:image.nativeSurface,presentationSurface:image.surface,presentationGrid:{step:1},colorBackend:cpuKernel==='reference'?'cpu':'auto',displayAssumption:image.provenance?.displayProjection});
    if(!plan?.known||!plan.completeResidentAlternative)return unknown(plan?.reason??'defects-native-plan-unavailable');
    execution=plan.execution;
   }else{
    // Only the real segmented byte producer has these band/store extents.
    // A legacy contiguous caller keeps its opaque optional-retention policy.
    const d=image.surface.descriptor,sw=d.sourceWidth??d.width,sh=d.sourceHeight??d.height;
    if(image.segmented!==true||!image.store||image.store.byteLength!==sw*sh*3||typeof image.store.readInto!=='function')return unknown('legacy-contiguous-defects-plan-unavailable');
    execution=segmentedDefectsExecutionPlan({width:sw,height:sh,params:p,sampleDepth:8,orientation:d.orientation??1,ioBytes});
    if(!execution?.known||!execution.completeResidentAlternative)return unknown('defects-byte-band-plan-unavailable');
    plan={known:true,bytes:runtimeBytes+execution.residentBytes,completeResidentAlternative:true,execution,scientificInputPrecision:8,outputPrecision:8};
   }
   // The exact runtime table uses its classified count. A cold resident
   // alternative may bound every candidate, without allocating that table or
   // imposing RAM on the producer's automatic temporary-storage route.
   const largestStoreBytes=Math.max(execution.maskStoreBytes,execution.flagStoreBytes,execution.outputStoreBytes,execution.candidateStoreBytes),overhead=4*MiB+(canMigrate?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(largestStoreBytes,image.session)):0);
   plan={...plan,bytes:plan.bytes+overhead,parallelWorkers:0,retainedResultBytes:execution.resultStoreBytes,defectsStoreOverheadBytes:overhead,retentionOnly:true};
  }
  else if(task.operation==='noise.blocking'){
   if(!native16BlockingParametersAdmitted(task.params,regionShape))return unknown('blocking-parameters-not-admitted');
   // Both depths use this blocking stage graph. The Original's private
   // decoded metadata attests file-gray8; typed16 never reopens that file.
   const input=native?{surface:image.nativeSurface}:image;
   plan=blockingResidentAdmissionPlan(input,task.params,{budget,sampleDepth:native?16:8,runtimeBytes:Math.max(0,runtimeBytes-waveletStreamHeapBytes()),ioBytes,storageOverheadBytes,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1},backend});
   if(!plan?.known)return unknown(plan?.reason??'blocking-resident-plan-not-attested');
  }
  else if(task.operation==='detail.frequency'||task.operation==='detail.wavelets'){
   plan=(task.operation==='detail.frequency'?frequencyResidentAdmissionPlan:waveletResidentAdmissionPlan)(descriptor,params,{...options,...(native?{runtimeBytes:Math.max(0,runtimeBytes-(task.operation==='detail.frequency'?frequencyStreamHeapBytes():waveletStreamHeapBytes()))}:{}),profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1},backend});
  }else if(task.operation==='detail.gradient'){
   const p=gradientParams(params);if(p.recompression)return unknown('recompressed-gradient');
    const transportBytes=regional?sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true}):0,effectiveBackend=backend!=='cpu'&&globalThis.navigator?.gpu?'webgpu':'cpu';
    if(regional&&native&&!native16GradientRegionRequested(task,image,regionShape))return unknown('native-gradient-region-not-admitted');
    const color=native&&p.luma==='linear709'?native16GradientColorAdmissionPlan(image.nativeSurface,p,{budget,effectiveBackend,maxReadPixels:1024*1024,...(regional?{domain}:{})}):null;if(color&&!color.known)return unknown(color.reason);
    if(native||isGradientField(p))plan=gradientFieldHeadroom(w,h,p,{runtimeBytes,transportBytes,effectiveBackend,maxReadPixels:1024*1024});
    else if(regional&&regionShape==='rectangle')plan=externalPreviewParallelHeadroom(task.operation,image,p,{runtimeBytes,transportBytes,profile,cpuKernel,backend,contract,domainShape:'rectangle',domain});
    else if(regional)plan=externalPreviewScopedGradientHeadroom(task.operation,domain,{runtimeBytes,transportBytes,image,params:p});
    else plan=externalPreviewParallelHeadroom(task.operation,image,p,{runtimeBytes,profile,cpuKernel,backend,contract});
    if(regional&&plan?.completeResidentAlternative){
     const window=native?native16GradientRegionWindowPlan(image.nativeSurface,p,{domain,effectiveBackend,maxReadPixels:1024*1024}):null;if(window&&!window.known)return unknown(window.reason);
     // The common regional runtime holds input metadata and borrows
     // its canonical source. Exact metadata already financed by the current
     // preparation remains that role alone, never pixel scratch credit.
     const metadataBytes=transportBytes*4+65536;
     if(!Number.isSafeInteger(preparedSourceRegionMetadataBytes)||![0,metadataBytes].includes(preparedSourceRegionMetadataBytes))return unknown('regional-metadata-credit-not-attested');
     const source=image.surface.descriptor,canonicalReadBytes=window?domain.width*Math.min(domain.height,window.rows)*3+Math.max(source.sourceWidth??source.width,source.sourceHeight??source.height)*3:0;
     // The regional record is a borrowed rectangle view, not an RGB8 bank.
     // Native collection and canonical background reads occur in separate
     // phases. Only their largest additional source loan is needed.
     const readBytes=window?Math.max(window.additionalBytes,canonicalReadBytes):0,regionBytes=metadataBytes-preparedSourceRegionMetadataBytes+ioBytes+4*MiB+readBytes;
     plan={...plan,bytes:plan.bytes+regionBytes,regionalGradient:{shape:regionShape,width:w,height:h,sourceWidth:sourceDescriptor.width,sourceHeight:sourceDescriptor.height,transportBytes,metadataBytes,metadataPreparationAlreadyFinanced:preparedSourceRegionMetadataBytes,canonicalEnvelopeBytes:0,canonicalReadBytes,additionalSourceReadBytes:readBytes,additionalBytes:regionBytes,nativeWindow:window}};
    }
    if(color&&plan?.completeResidentAlternative)plan={...plan,bytes:color.missingResidentBytes+Math.max(color.setupTransientBytes,plan.bytes+color.bandBytes),nativeColorAdmission:color};
  }else if(task.operation==='noise.separation'){
   const p=native?native16SeparationParams(params):contract?.validate(params)??params,maximum=cpuKernel==='auto'?profile.maxWorkers??1:1;
   if(native){
    // The producer funds its own complete arithmetic heap in filtering and
    // rendering, including cache hits. Keep only the other loaded runtimes.
    const nativeRuntimeBytes=Math.max(0,runtimeBytes-separationHeapBytes());
    plan=native16SeparationAdmissionPlan(image.nativeSurface,p,{budget,backend,maxWorkers:maximum,...options,runtimeBytes:nativeRuntimeBytes});
    if(!plan?.known||!plan.completeResidentAlternative)return unknown(plan?.reason??'separation-native-admission-not-attested');
    if(p.denoised){
     const color=native16DisplayPlan(image.nativeSurface.descriptor,{totalPixels:n,backend:cpuKernel==='reference'?'cpu':'auto',displayAssumption:image.provenance?.displayProjection});
     if(!color.known)return unknown(color.limitation?.code??'separation-color-plan-unknown');
     // Filter and presentation peaks are separate phases. The live typed
     // cache and final are real6N stores; histogram is a conservative bound.
     const retainedNativeBytes=n*12+3*65536*8,displayReadBytes=Math.min(n,MAX_DISPLAY_PIXELS)*9+Math.max(w,h)*6,presentationBytes=nativeRuntimeBytes+SEPARATION_HEAP_BYTES+storageOverheadBytes+ioBytes+retainedNativeBytes+color.bytes+displayReadBytes;
     plan={...plan,bytes:Math.max(plan.bytes,presentationBytes),retainedResultBytes:n*6,nativeColorAdmission:color,nativeSeparation:{inputDepth:16,outputDepth:16,cacheBytes:n*6,histogramBytes:3*65536*8,displayReadBytes,presentationBytes,runtimeExcludesSeparationHeap:true}};
    }
   }else{
    // Existing RGB8 producers already implement modes0..3 and both output
    // forms. NLM uses its own real CPU/observed-GPU alternatives below.
    if(![0,1,2,3,4].includes(p.mode))return unknown('unqualified-separation-parameters');
    if(p.mode===4){
     // This is a CPU alternative plan, not a change to the requested backend.
     // The actual whole-band NLM GPU owner is observed-nlm, not generic GPU.
     plan=separationResidentAdmissionPlan(image,p,{budget,backend:'cpu',maxWorkers:maximum,cacheKey:task.imageId+'\0segmented/'+task.operation+'/',...options});
     if(!plan?.known||!plan.completeResidentAlternative)return unknown(plan?.reason??'nlm8-cpu-alternative-uninspectable');
     if(!plan.filterCache&&backend!=='cpu'&&globalThis.navigator?.gpu){
      const choice=separationExecutionPlan({width:w,height:h,params:p,maxWorkers:maximum,gpuAvailable:true,ioBytes}),rows=Math.min(choice.targetRows,choice.heapRows);
      if(rows<1)return unknown('nlm8-observed-band-not-admitted');
      const observed=observedNlmGpuAdmissionPlan(w,Math.min(h,rows+2*separationHalo(p)),rows,p,{backend});
      if(!observed.known||!observed.completeResidentAlternative)return unknown(observed.reason??'nlm8-observed-provider-uninspectable');
      const gpuBytes=runtimeBytes+storageOverheadBytes+n*3+separationCacheBytes(n,p.denoised)+choice.batchBytes(choice.maximum,rows)+observed.bytes;
      plan={...plan,bytes:Math.max(plan.bytes,gpuBytes),nlm8ObservedGpuAdmission:observed,nlm8ObservedGpuAlternativeBytes:gpuBytes};
     }
    }else if(backend!=='cpu'&&globalThis.navigator?.gpu){plan=separationResidentAdmissionPlan(image,p,{budget,backend,maxWorkers:maximum,cacheKey:task.imageId+'\0segmented/'+task.operation+'/',...options});if(!plan?.known)return unknown(plan?.reason??'separation-gpu-admission-not-attested');}
    else{const choice=separationExecutionPlan({width:w,height:h,params:p,maxWorkers:maximum,ioBytes}),rows=Math.min(choice.targetRows,choice.heapRows);if(rows<1)return unknown('separation-row-not-admitted');
     const cacheBytes=separationCacheBytes(n,p.denoised),renderBytes=4*MiB,bytes=runtimeBytes+storageOverheadBytes+n*3+cacheBytes+Math.max(choice.batchBytes(choice.maximum,rows),renderBytes)+ioBytes;
     plan=Number.isSafeInteger(bytes)&&bytes>0?{bytes,completeResidentAlternative:true,parallelWorkers:choice.maximum}:null;}
   }
  }else if(native)plan=native16OperationAdmissionPlan(task.operation,params,descriptor,options);
  else if(['colors.stats','noise.planes'].includes(task.operation))plan=externalPreviewNativeHeadroom(task.operation,image,contract?.validate(params)??params,{runtimeBytes});
  else if(task.operation==='noise.minmax')plan=minmaxAdmissionPlan(descriptor,contract?.validate(params)??params,options);
  if(!plan?.completeResidentAlternative)return unknown('no-complete-resident-plan');
  if(!composite&&equalization?.post){const presentation=equalizationAdmissionPlan({width:w,height:h},equalization,{backend,storageOverheadBytes});if(!presentation?.completeResidentAlternative)return unknown('post-equalization-not-attested');plan={...plan,bytes:plan.bytes+presentation.bytes};}
  return Number.isSafeInteger(plan.bytes)&&plan.bytes>=0?{...plan,known:true,native16DomainAdditionalBytes:nativeDomainBytes}:unknown('unsafe-bound');
 }catch{return unknown('uninspectable-plan');}
}
