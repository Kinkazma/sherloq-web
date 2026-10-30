import "../../runtime-context.js?v=0.30.0";
import{neuralWindowBridgeAvailable}from'./neural-window-engine-link.js';
import{sparseCopyParams,SPARSE_COPY_ALGORITHMS}from'./sparse-copy.js';
import{denseCopyParams}from'./dense-adapter.js';
import{DENSE_PROFILES}from'./dense-profiles.js';
import{SAFIRE_MODEL,safireParams}from'./safire.js';
import{FOCAL_MODEL}from'./focal-assets.js';
import{ADAIFL_MODEL}from'./adaifl-assets.js';
import{EFFICIENT_LOFTR_ASSET}from'./efficient-loftr-assets.js';
import{XFEAT_MODEL}from'./learned-feature.js';
import{XFEAT_PAGED_MODEL}from'./xfeat-paged-assets.js';
import{ALIKED_MODELS}from'./aliked-assets.js';
import{SPARSE_GLUE_PAGED_MODELS}from'./sparse-glue-paged-assets.js';
import{SPARSE_GLUE_MODELS}from'./sparse-glue.js';
import{usefulOperationMethod,usefulScientificParameters}from'./useful-operation-method.js';
import{configuredShas,unknownOwner,stageCacheHit}from'./useful-owner-facts.js';
import{createUsefulOperationEvidence}from'./useful-operation-evidence.js';
import{USEFUL_WORK_CODE_IDENTITY}from'./useful-work-code-identity.js';
const RESEARCH={ 'ai.sources.safire':SAFIRE_MODEL,'ai.localization.focal':FOCAL_MODEL,'ai.localization.adaifl':ADAIFL_MODEL};
const positive=v=>Number.isFinite(v)&&v>0;
const nativeWindowGpu=(owner,value)=>value?.provider==='webgpu'&&value.completedAfterNativeAck===true&&value.actualGpuWork===true&&value.gpuExecution?.observed===true&&positive(value.gpuExecution.dispatches)&&positive(value.gpuExecution.submissions)&&owner.modelShas.includes(value.modelSha256);
export function researchUsefulOwner(task,ctx={}){
 const {m3Resources={}}=ctx;let p,shas=[],required=false,gpu=true,method,ownerClass,complete=true,windowRoute=false;
 if(task.operation==='tampering.copyMove.sparse'){
  p=sparseCopyParams(task.params);method=p.algorithm;
  ownerClass='native-sparse/'+method;
  windowRoute=['XFeat','XFeat + LighterGlue','EfficientLoFTR'].includes(method)&&neuralWindowBridgeAvailable(ctx.budget);gpu=windowRoute||!['XFeat','EfficientLoFTR','SSG'].includes(method);
  if(method.startsWith('XFeat')){required=true;shas=configuredShas(m3Resources.models?.['xfeat-paged']??m3Resources.models?.xfeat);complete=shas.length>0;}
  if(method.startsWith('ALIKED')){required=true;shas.push(...configuredShas(ALIKED_MODELS[method.includes('rotation')?'aliked-n16rot':'aliked-n16']));}
  if(method.includes('Glue')){const kind=method.startsWith('XFeat')?'xfeat':method.startsWith('SIFT')?'sift':'aliked';required=true;const pins=configuredShas(m3Resources.models?.[kind+'-glue-paged']??m3Resources.models?.[kind+'-glue']);shas.push(...pins);complete=complete&&pins.length>0;}
  if(method==='SSG'){required=true;shas=configuredShas(m3Resources.models?.['ssg-edges']);complete=shas.length>0;}
  if(method==='EfficientLoFTR'){required=true;shas=configuredShas(ctx.efficientModelIdentity??EFFICIENT_LOFTR_ASSET);}
  if(method.endsWith('Panels + Text')){required=true;const pins=configuredShas(m3Resources.language);shas.push(...pins);complete=complete&&pins.length>0;}
 }else if(task.operation==='tampering.copyMove.dense'){
  p=denseCopyParams(task.params);method=p.profile;ownerClass='native-dense/'+method;
 }else if(RESEARCH[task.operation]){
  p=task.operation==='ai.sources.safire'?safireParams(task.params):{...task.params};method='default';ownerClass='native-research/'+task.operation;required=true;shas=configuredShas(RESEARCH[task.operation]);
 }else return null;
 const parameters=usefulScientificParameters(task.operation,p);parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??null,efficientLoFtrComparison:structuredClone(task.efficientLoFtrComparison??null)};
 const owner=unknownOwner(task,{...ctx,method,parameters,precision:method?.startsWith('XFeat')?'XFeat author arithmetic; human-accepted order 1e-3, 2026-10-29':'Native '+method+' registered arithmetic v1',modelShas:shas,requiresModels:required,gpu,ownerClass,context:{codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,sourceDomain:task.sourceRegionDomain?.fingerprint?'scoped':'Original'}});if(owner){owner.performanceIdentityComplete=owner.performanceIdentityComplete&&complete;if(windowRoute)owner.admission.webgpu=true;}return owner;
}
function facts(owner,answer){
 const d=answer.data?.globalResult?.dataNatif??answer.data??{},meta=d.metadata??{},m=answer.metrics??{};
 if(owner.method==='SSG')return{backend:'cpu',cpu:true,gpu:false};
 if(owner.method==='EfficientLoFTR'){
  const matching=Array.isArray(meta.matching)?meta.matching:[];
  if(d.backend==='hybrid'&&meta.variant==='full'&&matching.some(run=>run.cacheHit!==true&&run.cleanupAck===true&&run.windowExecution?.modelSha256===meta.graphSha256&&nativeWindowGpu(owner,run.windowExecution)))return{backend:'hybrid',cpu:true,gpu:true};
  return d.backend==='cpu'?{backend:'cpu',cpu:true,gpu:false}:null;
 }
 if(owner.operation==='tampering.copyMove.dense'){
  const x=d.metrics??meta.metrics??m;const jobs=x.fieldExecutions??[];const gpu=positive(x.completedGpuJobs)||jobs.some(j=>j.reusedField!==true&&typeof j.matching?.backend==='string'&&j.matching.backend.startsWith('webgpu'));
  if(gpu)return{backend:'hybrid',cpu:true,gpu:true};
  if(x.cache?.field===true)return{backend:'cpu',cpu:true,gpu:false};
  if(jobs.length&&jobs.every(j=>j.matching?.backend==='native-paged'||j.matching?.backend==='native-cpu'||j.matching?.backend==='cpu'||j.matching?.backend==='wasm'))return{backend:'cpu',cpu:true,gpu:false};return null;
 }
 if(owner.operation==='tampering.copyMove.sparse'){
  const matching=meta.matching??{},extract=meta.extraction??{};
  const window=extract.windows?.windowExecution??extract.windowExecution;
  const windowGpu=nativeWindowGpu(owner,window);
  const matchedGpu=Array.isArray(matching.runs)&&matching.runs.some(run=>run.cleanupAck===true&&run.actualGpuWork===true);
  const gaussianGpu=extract.provider==='webgpu'&&Array.isArray(extract.jobs)&&extract.jobs.some(job=>Array.isArray(job.stages)&&job.stages.some(stage=>stage.gaussianProvider==='webgpu'));
  const gpu=windowGpu||matchedGpu||gaussianGpu||positive(matching.gpu?.calls)||positive(matching.gpuBatches)||matching.actualGpuWork===true||matching.gpuExecution?.actualGpuWork===true||extract.actualGpuWork===true||extract.gpuExecution?.actualGpuWork===true;
  if(gpu&&d.backend==='hybrid')return{backend:'hybrid',cpu:true,gpu:true};
  if(d.backend==='cpu'&&['wasm','cpu','wasm-simd','native-cpu'].includes(extract.provider))return{backend:'cpu',cpu:true,gpu:false};return null;
 }
 const events=[meta,meta.inference,...(meta.inference?.stages??[]),...(meta.stages??[]),...(meta.runs??[])].filter(x=>x&&typeof x==='object');
 if(events.some(x=>x.actualGpuWork===true||x.gpuExecution?.actualGpuWork===true))return{backend:'hybrid',cpu:true,gpu:true};
 if(events.some(x=>x.provider==='wasm'||x.provider==='cpu'||x.provider==='webgpu'&&x.gpuExecution?.observed===true&&x.gpuExecution.dispatches===0))return{backend:'cpu',cpu:true,gpu:false};return null;
}
export function researchUsefulEvidence(owner,answer){
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 // Reused stage metadata can contain old GPU counters. Without a per-operation
 // fresh stage receipt, decline optional hybrid partial accounting rather than
 // call real GPU work CPU or call old counters new work. The analysis/cache stay.
 const nativeData=answer.data?.globalResult?.dataNatif??answer.data,nativeAnswer=nativeData===answer.data?answer:{...answer,data:nativeData};
 if(owner.method==='EfficientLoFTR'&&(positive(nativeData?.metadata?.rawCacheHits)||Array.isArray(nativeData?.metadata?.matching)&&nativeData.metadata.matching.some(run=>run.cacheHit===true)))return null;
 if(stageCacheHit(nativeAnswer)&&nativeData?.backend==='hybrid')return null;
 if(stageCacheHit(nativeAnswer))return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualCpuWork:true,actualGpuWork:false,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 const f=facts(owner,answer);if(!f||f.gpu&&owner.numericAdmissible.webgpu!==true)return null;
 return createUsefulOperationEvidence({...owner,actualBackend:f.backend,actualCpuWork:f.cpu,actualGpuWork:f.gpu,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
