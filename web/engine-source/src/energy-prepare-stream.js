import {rememberEnergyNativePreparation,tryEnergyNativeContextPreparation} from './energy-native-context-preparation.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {gray} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {summarizeEnergyValues} from './energy-statistics-stream.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {missingMigrationWorkspaceBytes,migrationWorkspaceBytes} from './migration-workspace.js';
const f=Math.fround,BLOCK=65536;
// A common phase envelope, independent of the encoded format or image size.
// No staging credit is held while panel statistics are being calculated.
export function energyScorePhasePlan({width,height,planeCount,panelCount,maximumPanelPixels,gpuCosts,migrationBytes=0}){
 const n=width*height,ownBytes=width*41+(5*BLOCK+8192)*4+8192,summaryBytes=panelCount*2048,storesBytes=13*n,stagingBytes=(12+planeCount*4)*n;
 requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(n)&&n>0&&[1,3].includes(planeCount)&&Number.isSafeInteger(panelCount)&&panelCount>0&&Number.isSafeInteger(maximumPanelPixels)&&maximumPanelPixels>=0&&maximumPanelPixels<=n&&Number.isSafeInteger(migrationBytes)&&migrationBytes>=0&&Number.isSafeInteger(gpuCosts?.minimumBytes)&&gpuCosts.minimumBytes>=0,'A complete native Energy phase plan is required.');
 const creationBytes=storesBytes+summaryBytes+ownBytes+6*1024**2+width*99+migrationBytes,
 statisticsBytes=storesBytes+summaryBytes+ownBytes+4*maximumPanelPixels+2*1024**2+migrationBytes,
 gpuBytes=storesBytes+summaryBytes+ownBytes+stagingBytes+gpuCosts.minimumBytes+migrationBytes+2*1024**2;
 return{schema:'energy-score-phases/1',storesBytes,stagingBytes,ownBytes,summaryBytes,migrationBytes,creationBytes,statisticsBytes,gpuBytes,requiredBytes:Math.max(creationBytes,statisticsBytes,gpuBytes),minimumGpuBytes:gpuCosts.minimumBytes};
}
export function reserveEnergyScoreStaging(budget,stagingBytes,gpuCosts,backend){
 const availableBytes=budget.limit-budget.total(),requiredBytes=stagingBytes+(gpuCosts?.minimumBytes??0)+2*1024**2,evidence={availableBytes,requiredBytes,...(gpuCosts?{providerCosts:gpuCosts}:{})};
 if(gpuCosts&&requiredBytes>availableBytes){
  if(backend!=='auto')throw new EngineError('MEMORY_LIMIT','Explicit WebGPU energy scores do not fit their live phase.',{details:{requestedBytes:requiredBytes,availableBytes}});
  return{refused:'live-phase-headroom',evidence};
 }
 try{return{reservation:budget.reserve(stagingBytes),evidence};}catch(error){
  // This direct Budget refusal owns no array yet. Unrelated primary errors or
  // any retirement debt cannot be treated as a numerical CPU fallback.
  let localRefusal=false;try{localRefusal=backend==='auto'&&error instanceof EngineError&&error.code==='MEMORY_LIMIT'&&error.details?.requestedBytes===stagingBytes&&error.details?.budgetBytes===budget.limit&&!error.cleanupOwner&&!error.cleanupError&&!error.cleanupErrors?.length;}catch{}
  if(!localRefusal)throw error;
  return{refused:'staging-admission',evidence};
 }
}
// Internal preparation for already detected native panels. An explicit empty
// detection requests the native whole-image fallback; missing geometry is invalid.
export async function prepareSegmentedEnergy(image,planes,quantiles,log,{polygons,budget,signal,onProgress,storage='auto',scoreGpu,scoreBackend='webgpu',planeCount=3,capturePreparationContext}={}){
 const cooperate=createCooperator(signal);
 const {width:w,height:h}=image.surface.descriptor,n=w*h;requireValue(image.surface.descriptor.format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31&&[1,3].includes(planeCount)&&Array.isArray(planes)&&planes.length===planeCount&&planes.every(p=>p?.byteLength===n*4)&&typeof log==='function','Complete declared energy planes and qualified logarithm required.');requireValue(Array.isArray(polygons),'Explicit native panel detection required.');requireValue(Array.isArray(quantiles)&&quantiles.length===2&&quantiles.every(Number.isFinite)&&quantiles[0]>=0&&quantiles[0]<=.5&&quantiles[1]>=.5&&quantiles[1]<=1,'Invalid energy quantiles.');
 if(!polygons.length)polygons=[[[0,0],[w-1,0],[w-1,h-1],[0,h-1]]];
 for(const p of polygons)requireValue(Array.isArray(p)&&p.length===4&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger))&&p[0][0]>=0&&p[0][1]>=0&&p[2][0]<w&&p[2][1]<h&&p[0][0]<=p[2][0]&&p[0][1]<=p[2][1]&&p[1][0]===p[2][0]&&p[1][1]===p[0][1]&&p[3][0]===p[0][0]&&p[3][1]===p[2][1],'Axis-aligned native panel bounds required.');
 const scoreProvider=scoreGpu;let scoreCpuMs=0;const selectedGpu=!!scoreGpu&&(!scoreGpu.selectBackend||scoreGpu.selectBackend(n,scoreBackend)==='webgpu'),legacyScoreWorkingBytes=n*(40+planeCount*4)+8*1024**2,scoreAvailableBytes=budget.limit-budget.total();
 let maximumPanelPixels=0;if(selectedGpu&&scoreGpu.admissionCosts)for(const p of polygons)maximumPanelPixels=Math.max(maximumPanelPixels,(p[2][0]-p[0][0]+1)*(p[2][1]-p[0][1]+1));
 const gpuCosts=selectedGpu&&scoreGpu.admissionCosts?.(planeCount,polygons.length),migrationBytes=(image.session||image.ensureTemporarySession)&&image.session?.backend!=='opfs'?missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(n*4,image.session)):0,phasePlan=gpuCosts?energyScorePhasePlan({width:w,height:h,planeCount,panelCount:polygons.length,maximumPanelPixels,gpuCosts,migrationBytes}):null,scoreWorkingBytes=phasePlan?.requiredBytes??legacyScoreWorkingBytes,admission={strategy:phasePlan?'native-phase-lifetimes':'legacy-provider-contract',providerSelection:selectedGpu?'webgpu':'cpu',availableBytes:scoreAvailableBytes,requiredBytes:scoreWorkingBytes,...(phasePlan?{phases:phasePlan,providerCosts:gpuCosts}:{})};
 if(selectedGpu&&scoreBackend==='webgpu'&&scoreWorkingBytes>scoreAvailableBytes)throw new EngineError('MEMORY_LIMIT','Explicit WebGPU energy scores do not fit their admitted workspace.',{details:{requestedBytes:scoreWorkingBytes,availableBytes:scoreAvailableBytes}});
 let useGpu=selectedGpu&&scoreWorkingBytes<=scoreAvailableBytes,scoreRuntime,scoreObservedMs;admission.selectedBackend=useGpu?'webgpu':'cpu';
 const reused=await tryEnergyNativeContextPreparation(image,planes,quantiles,log,{polygons,budget,signal,onProgress,storage,scoreGpu,scoreBackend,planeCount,capturePreparationContext,scoreWorkingBytes:scoreGpu?legacyScoreWorkingBytes:0});if(reused)return reused;
 const diagnosticStarted=performance.now(),diagnostic={schema:'energy-preparation-diagnostic/1',scope:'this cold preparation construction; retained with its preparation owner, not a warm access estimate',storeAndScratchCreationMs:0,planeValidationMs:0,validityRgbMs:0,panelCountingMs:0,scopeMs:0,valuesAllocationMs:0,selectionPackingMs:0,summarizeMs:0,valuesRetirementMs:0,captureBeginMs:0,captureSortingMs:0,captureFinishMs:0,capturePresent:false,captureInlineIncludedInOtherPhases:false,statistics:{calls:0,ranksMs:0,runtimeConstructionMs:0,reductionMs:0,retirementMs:0,totalMs:0,runtimeAttempts:0,runtimesCreated:0,runtimesBorrowed:0,ranksReused:0,wasmExecutions:0,unknownWasmCounters:0,backends:{}}};admission.preparationDiagnostics=diagnostic;
 const summarizeDiagnostic=value=>{const aggregate=diagnostic.statistics;aggregate.calls++;for(const key of['ranksMs','runtimeConstructionMs','reductionMs','retirementMs','totalMs'])if(Number.isFinite(value[key]))aggregate[key]+=value[key];aggregate.runtimeAttempts+=+value.runtimeAttempted;aggregate.runtimesCreated+=+value.runtimeCreated;aggregate.runtimesBorrowed+=+value.runtimeBorrowed;aggregate.ranksReused+=+value.ranksReused;if(Number.isSafeInteger(value.wasmExecutions))aggregate.wasmExecutions+=value.wasmExecutions;else aggregate.unknownWasmCounters++;const backend=String(value.backend??'unreported');if(Object.hasOwn(aggregate.backends,backend)||Object.keys(aggregate.backends).length<4)aggregate.backends[backend]=(aggregate.backends[backend]??0)+1;else aggregate.otherBackendCalls=(aggregate.otherBackendCalls??0)+1;};
 const ownBytes=w*41+(5*BLOCK+8192)*4+8192,stores=[],summaries=[];let planning,workRelease,summaryRelease,values,capture,success=false,failed=false,primary;
 try{
  const storesStarted=performance.now();summaryRelease=budget.reserve(polygons.length*2048);planning=budget.reserve(ownBytes+2*1024**2+w*99+4*1024**2);
  const options={budget,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal},make=async length=>{const s=await createSegmentedBytes(length,options);stores.push(s);return s;};
  const valid=await make(n),scope=await make(4*n),low=await make(4*n),high=await make(4*n),scores=[];if(!useGpu)for(let q=0;q<planeCount;q++)scores.push(await make(4*n));planning();planning=null;workRelease=budget.reserve(ownBytes);
  const rowValid=new Uint8Array(w),rowPlane=new Float32Array(w),rowScore=new Float32Array(w),buffers=Array.from({length:5},()=>new Float32Array(Math.min(BLOCK,n))),packed=buffers[1],validBand=new Uint8Array(w*Math.min(32,h));diagnostic.storeAndScratchCreationMs=performance.now()-storesStarted;diagnostic.packingBufferValues=packed.length;diagnostic.packingWriteCalls=0;diagnostic.packingBulkValues=0;
  async function writeCpuQuality(p,q,probe){
   const[x0,y0]=p[0],[x1,y1]=p[2],width=x1-x0+1,rv=rowValid.subarray(0,width),rp=rowPlane.subarray(0,width),rs=rowScore.subarray(0,width);
   for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);await planes[q].readInto(new Uint8Array(rp.buffer,0,width*4),(y*w+x0)*4);for(let x=0;x<width;x++)rs[x]=rv[x]?f(log(f(f(probe.central_mean+.25)/f(rp[x]+.25)))/f(.2)):0;await scores[q].write(new Uint8Array(rs.buffer,0,width*4),(y*w+x0)*4);}
  }
  async function finishCpuScores(){
   for(const score of scores)await score.flush();
   for(let at=0;at<n;at+=BLOCK){await cooperate();const length=Math.min(BLOCK,n-at);for(let q=0;q<planeCount;q++)await scores[q].readInto(new Uint8Array(buffers[q].buffer,0,length*4),at*4);for(let i=0;i<length;i++){const x=buffers[0][i],y=buffers[1][i],z=buffers[2][i],m=planeCount===1?x:x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));buffers[3][i]=Math.max(m,0);buffers[4][i]=Math.max(-m,0);}await low.write(new Uint8Array(buffers[3].buffer,0,length*4),at*4);await high.write(new Uint8Array(buffers[4].buffer,0,length*4),at*4);onProgress?.({phase:'energy-quality-median',fraction:(at+length)/n});}
  }
  if(capturePreparationContext){const captureStarted=performance.now();capture=await capturePreparationContext.owner.begin(capturePreparationContext.key,w,h,planeCount,polygons,{signal,minimumHeadroom:Math.max(n*(40+planeCount*4)+32*1024**2,phasePlan?phasePlan.requiredBytes-phasePlan.storesBytes-phasePlan.ownBytes-phasePlan.summaryBytes:0)});diagnostic.captureBeginMs=performance.now()-captureStarted;}diagnostic.capturePresent=!!capture;diagnostic.captureInlineIncludedInOtherPhases=!!capture;
  const validationStarted=performance.now();for(let q=0;q<planes.length;q++)for(let at=0;at<n;at+=BLOCK){const plane=planes[q];await cooperate();const length=Math.min(BLOCK,n-at);await plane.readInto(new Uint8Array(buffers[0].buffer,0,length*4),at*4);for(let i=0;i<length;i++)requireValue(Number.isFinite(buffers[0][i])&&buffers[0][i]>=0&&buffers[0][i]<=255,'Energy outside RGB8 residual domain.');capture?.planes(buffers[0].subarray(0,length),q*n+at);}diagnostic.planeValidationMs=performance.now()-validationStarted;
  const validityStarted=performance.now();for(let y=0;y<h;y+=32){await cooperate();const rows=Math.min(32,h-y),part=await image.surface.readWindow({x:0,y,width:w,height:rows},{signal});try{const rgb=part.pixels.data;for(let i=0;i<w*rows;i++){const g=gray(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);validBand[i]=g>3&&g<252?1:0;}await valid.write(validBand.subarray(0,w*rows),y*w);capture?.valid(validBand.subarray(0,w*rows),y*w);}finally{part.release();}onProgress?.({phase:'energy-valid',fraction:(y+rows)/h});}await valid.flush();diagnostic.validityRgbMs=performance.now()-validityStarted;
  for(let panel=0;panel<polygons.length;panel++){
   const p=polygons[panel],[x0,y0]=p[0],[x1,y1]=p[2],width=x1-x0+1,rv=rowValid.subarray(0,width),rp=rowPlane.subarray(0,width),rs=rowScore.subarray(0,width);let count=0;
   const countStarted=performance.now();for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);for(const v of rv)count+=v;}diagnostic.panelCountingMs+=performance.now()-countStarted;if(count<64)continue;capture?.panel(panel,count);
   const probes=[],scopeRow=new Int32Array(rowScore.buffer,0,width);
   for(let q=0;q<planeCount;q++){
    const allocationStarted=performance.now(),future=budget.reserve(2*1024**2);try{values=await createSegmentedBytes(count*4,options);}finally{future();}diagnostic.valuesAllocationMs+=performance.now()-allocationStarted;const packingStarted=performance.now();let used=0,written=0,scopeMs=0;
    const flush=async()=>{if(used){capture?.values(panel,q,packed.subarray(0,used),written);await values.write(new Uint8Array(packed.buffer,0,used*4),written*4);diagnostic.packingWriteCalls++;written+=used;used=0;}};
    for(let y=y0;y<=y1;y++){
     if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);
     // Scope uses these same validity bytes. Its rowScore alias is dead until
     // writeCpuQuality, after this first plane has been completely summarized.
     if(q===0){const scopeStarted=performance.now();for(let x=0;x<width;x++)scopeRow[x]=rv[x]?panel+1:0;await scope.write(new Uint8Array(scopeRow.buffer,0,width*4),(y*w+x0)*4);capture?.scope(scopeRow,y*w+x0);scopeMs+=performance.now()-scopeStarted;}
     await planes[q].readInto(new Uint8Array(rp.buffer,0,width*4),(y*w+x0)*4);
     // Validity is produced here as0/1. Bulk copies retain the same stable
     // selected order; short fragmented runs keep the original scalar body.
     let x=rv.indexOf(1);while(x>=0&&x<width){
      let end=rv.indexOf(0,x);if(end<0)end=width;
      if(end-x<16){for(;x<width;x++)if(rv[x]){packed[used++]=rp[x];if(used===packed.length)await flush();}break;}
      while(x<end){const take=Math.min(end-x,packed.length-used);packed.set(rp.subarray(x,x+take),used);diagnostic.packingBulkValues+=take;used+=take;x+=take;if(used===packed.length)await flush();}
      x=end<width?rv.indexOf(1,end):width;
     }
    }await flush();requireValue(written===count,'Energy selection count changed.');await values.flush();diagnostic.scopeMs+=scopeMs;diagnostic.selectionPackingMs+=performance.now()-packingStarted-scopeMs;const sortingStarted=capture?performance.now():0,ordered=await capture?.sorted(panel,q);if(capture)diagnostic.captureSortingMs+=performance.now()-sortingStarted;
    const rankEndpoints=ordered?Float32Array.from(quantiles.flatMap(value=>{const lo=Math.floor((count-1)*value);return[ordered[lo],ordered[Math.min(lo+1,count-1)]];})):undefined;
    const summarizeStarted=performance.now(),probe=await summarizeEnergyValues(values,count,quantiles,{budget,signal,rankEndpoints,statisticsRuntime:capture?.statisticsReducer,onProgress:e=>onProgress?.({...e,panel:panel+1,qualityIndex:q}),onDiagnostic:summarizeDiagnostic});diagnostic.summarizeMs+=performance.now()-summarizeStarted;probes.push(probe);const valuesRetirementStarted=performance.now();await values.dispose();diagnostic.valuesRetirementMs+=performance.now()-valuesRetirementStarted;values=null;
    const scoreStarted=performance.now();if(!useGpu)await writeCpuQuality(p,q,probe);
    scoreCpuMs+=performance.now()-scoreStarted;
   }
   summaries.push({id:panel+1,bbox:[x0,y0,x1+1,y1+1],probes});onProgress?.({phase:'energy-panel-scores',fraction:(panel+1)/polygons.length});
  }
  await scope.flush();const medianStarted=performance.now();if(!useGpu)await finishCpuScores();scoreCpuMs+=performance.now()-medianStarted;
  if(useGpu){
   const stagingBytes=n*(12+planeCount*4),currentCosts=scoreGpu.admissionCosts?.(planeCount,summaries.length),stage=reserveEnergyScoreStaging(budget,stagingBytes,currentCosts,scoreBackend);admission.beforeStaging=stage.evidence;
   if(stage.refused){
    useGpu=false;admission.selectedBackend='cpu';admission.lateRefusal=stage.refused;const scoreStarted=performance.now();
    for(let q=0;q<planeCount;q++)scores.push(await make(4*n));
    for(const panel of summaries)for(let q=0;q<planeCount;q++)await writeCpuQuality(polygons[panel.id-1],q,panel.probes[q]);
    await finishCpuScores();scoreCpuMs+=performance.now()-scoreStarted;
   }else{
    const scoreStarted=performance.now();let nativePlanes,nativeScope,nativeLow,nativeHigh;
    try{
     nativePlanes=new Float32Array(n*planeCount);nativeScope=new Int32Array(n);nativeLow=new Float32Array(n);nativeHigh=new Float32Array(n);
     for(let q=0;q<planeCount;q++){await cooperate();await planes[q].readInto(new Uint8Array(nativePlanes.buffer,q*n*4,n*4));}
     await scope.readInto(new Uint8Array(nativeScope.buffer));checkAbort(signal);
     scoreRuntime=await (scoreGpu.runScores??scoreGpu.run).call(scoreGpu,nativePlanes,nativeScope,summaries,{low:nativeLow,high:nativeHigh,log,signal,planeCount,backend:scoreBackend,onSubmitted:detail=>onProgress?.({phase:'energy-score-gpu-submitted',...detail})});
     for(let at=0;at<n;at+=BLOCK){await cooperate();const length=Math.min(BLOCK,n-at);await low.write(new Uint8Array(nativeLow.buffer,at*4,length*4),at*4);await high.write(new Uint8Array(nativeHigh.buffer,at*4,length*4),at*4);}
    }finally{nativePlanes=nativeScope=nativeLow=nativeHigh=null;stage.reservation();}
    scoreObservedMs=performance.now()-scoreStarted;
   }
  }
  if(!useGpu&&scoreProvider){scoreObservedMs=scoreCpuMs;scoreRuntime={backend:'cpu-native-energy-scores',totalMs:scoreCpuMs};}

  const finishStarted=performance.now();await low.flush();await high.flush();await valid.dispose();for(const score of scores)await score.dispose();checkAbort(signal);if(scoreProvider){scoreObservedMs+=performance.now()-finishStarted;scoreRuntime.scoreStageMs=scoreObservedMs;scoreProvider.observeScore?.(n,scoreRuntime.backend.startsWith('webgpu')?'webgpu':'cpu',scoreObservedMs);}let preparationContextIdentity;if(capture){const captureFinishStarted=performance.now(),handle=await capture.finish();rememberEnergyNativePreparation(handle,image,planes,polygons);diagnostic.captureFinishMs+=performance.now()-captureFinishStarted;capture=null;preparationContextIdentity=handle.identity;}else if(capturePreparationContext)preparationContextIdentity=capturePreparationContext.owner.lookup(capturePreparationContext.key)?.identity;diagnostic.totalBeforeReturnMs=performance.now()-diagnosticStarted;success=true;let disposed=false;const releaseSummary=summaryRelease;summaryRelease=null;
  return {width:w,height:h,energy_low_score:low,energy_high_score:high,energy_scope:scope,energy_summary:summaries,metrics:{energyScoreAdmission:admission,...(preparationContextIdentity?{preparationContextIdentity}:{}),preparationWorkingBytes:ownBytes+2*1024**2,...(scoreRuntime?{energyScoreGpu:scoreRuntime}:{}),panels:summaries.length,sourcePanels:polygons.length,lowStorage:low.storage,highStorage:high.storage,scopeStorage:scope.storage},dispose:async()=>{if(disposed)return;disposed=true;try{const results=await Promise.allSettled([low,high,scope].map(s=>s.dispose()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{releaseSummary();}}};
 }catch(error){failed=true;primary=error;throw error;}finally{planning?.();workRelease?.();summaryRelease?.();await retireCompositeOwners([()=>capture?.dispose(),...([values,...(!success?stores:[])].filter(Boolean).map(s=>()=>s.dispose()))],failed?{primary}:{});}
}
