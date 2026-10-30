import{PIXEL_OPERATIONS}from'./pixel-operations.js';
import{validateParams as elaParams}from'./ela.js';
import{sourceRegionDomainShape}from'./source-region-capabilities.js';
import{usefulOperationMethod,usefulScientificParameters}from'./useful-operation-method.js';
import{createUsefulOperationEvidence}from'./useful-operation-evidence.js';
import{USEFUL_WORK_CODE_IDENTITY}from'./useful-work-code-identity.js';
const SHA=/^[a-f0-9]{64}$/;
const GPU_OPS=new Set(['ela.classic','ela.biomes','ela.energy','tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','tampering.resampling','tampering.resampling.fourier','various.median','noise.noisesniffer','noise.prnu','comparison.image','detail.frequency','noise.blocking','detail.wavelets','various.stereogram','jpeg.zero','jpeg.ghosts','jpeg.recompression','jpeg.quality']);
const MODEL_REFS=new Set(['various.median','jpeg.quality']);
const REQUIRED_MODELS=new Set(['various.median']);
const NATIVE_CPU=new Set(['subimages.detect','colors.plots','file.digest','file.hex','metadata.structure','metadata.location','metadata.thumbnail','metadata.exiftool','metadata.c2pa','inspection.magnifier','inspection.histogram','various.illuminant','tampering.contrast','jpeg.multiple','colors.pca','colors.space','detail.gradient','inspection.adjust','detail.echo','colors.stats','noise.planes','noise.minmax','pixels.defects']);
const positive=v=>Number.isFinite(v)&&v>0;
function referencesFor(task,p,getReference){
 const operation=PIXEL_OPERATIONS[task.operation];let ids;try{ids=operation?.references?.(p)??[];}catch{ids=[''];}const references=[];
 for(const id of ids){let r;try{r=getReference?.(id);}catch{}references.push(r??null);}return references;
}
export function pixelUsefulOwner(task,{version,profile,budget,cpuKernel,image,getReference}={}){
 const op=PIXEL_OPERATIONS[task?.operation];if(!op&&task?.operation!=='ela.classic'||image?.provenance?.decoder==='caller')return null;
 const p=task.operation==='ela.classic'?elaParams(task.params):op.validate(task.params),refs=referencesFor(task,p,getReference),modelRefs=MODEL_REFS.has(task.operation),modelShas=modelRefs?refs.map(r=>r?.sha256).filter(s=>SHA.test(s??'')):[],sourceRefs=modelRefs?[]:refs;
 const parameters=usefulScientificParameters(task.operation,p),method=usefulOperationMethod(task.operation,p).method;
 // Non-ID scientific task inputs remain in the comparison material.
 parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??null};
 let shape=task.sourceRegionDomain?sourceRegionDomainShape(task.sourceRegionDomain):'identity',gpu=GPU_OPS.has(task.operation);
 if(task.operation==='noise.separation')gpu=p.mode===4||p.mode===0&&['native-regions','membership'].includes(shape);
 if(cpuKernel==='reference')gpu=false;
 const threads=cpuKernel==='reference'?1:Math.min(32,profile?.maxWorkers??1);if(!Number.isSafeInteger(threads)||threads<1)return null;
 const trustRequired=task.operation==='metadata.c2pa'&&p.trustAnchors!=null;const inputs=sourceRefs.length?[image?.sha256,...sourceRefs.map(r=>r?.sha256)]:trustRequired?[image?.sha256,null]:[];
 parameters.referenceDomains=sourceRefs.map(r=>r?.sourceRegionDomain?.fingerprint??r?.provenance?.sourceRegionDomain?.fingerprint??null);
 if(task.usefulExecutionRoute)parameters.executionRoute=task.usefulExecutionRoute;
 if(task.operation==='file.digest')parameters.sourceProperties=Object.fromEntries(['name','size','lastModified','type'].filter(k=>image.sourceFile?.[k]!==undefined).map(k=>[k,image.sourceFile[k]]));
 const allInputs=(!inputs.length||inputs.every(s=>SHA.test(s??'')))&&(!REQUIRED_MODELS.has(task.operation)||modelShas.length>0);
 return{schema:'sherloq.useful-operation-owner/1',operation:task.operation,method,parameters,precision:'Native '+task.operation+' registered CPU/GPU arithmetic v1',modelShas,requiresModels:REQUIRED_MODELS.has(task.operation),codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,regime:'unknown',threads,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:inputs.length?'ordered-original-and-references':'single-original',sourceShas:inputs,performanceIdentityComplete:allInputs,resourceContext:{ownerClass:'registered-native-pixel/'+task.operation,threadSemantics:'configured maximum arithmetic actors; actual actors remain in completed metrics',cpuKernel,sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??image.surface?.storage??image.store?.storage??image.session?.backend??'unknown',sourceDomainClass:shape,trustRequired,providerPhase:'unknown',workCategory:task.operation+'/'+method,workContract:'registered-complete-operation-v1'},work:null,historicalBackend:'cpu',admission:{cpu:true,webgpu:gpu&&!!globalThis.navigator?.gpu},numericAdmissible:{cpu:true,webgpu:gpu}};
}
export function pixelUsefulCached(answer){
 const m=answer?.metrics??{},c=m.cache??{};
 return c.result===true||c.analysis===true||m.analysisCacheHit===true||m.analysisCached===true||m.filterCacheHit===true||m.statisticsCached===true||m.coefficientsCached===true||m.residualCached===true||m.displayCached===true||m.maskCached===true||m.baseCached===true||m.searchCached===true||m.flowCached===true||m.grayCached===true||m.qualityCurveCached===true||Object.values(c.stages??{}).some(v=>v===true);
}
// Every predicate refers to a committed result/counter from an actual provider,
// never a requested backend, elapsed time, or mere existence of navigator.gpu.
export function pixelUsefulBackend(owner,answer){
 const m=answer?.metrics??{},op=owner.operation;
 if(NATIVE_CPU.has(op))return{backend:'cpu',cpu:true,gpu:false};
 const acceptedGpuResult=m.kernel==='frequency-gpu-mask+cpu-dft'&&m.gpu?.accountedGpuBufferBytes>0||m.numericBackend==='webgpu-native-gray-islow'&&positive(m.bands)&&positive(m.qualities)||['native-RGB-ghost-shared-FDCT-integer-reduction','native-ISLOW420-GPU-and-native-coefficient-entropy'].includes(m.kernel)&&positive(m.gpu?.blocks);
 const currentGpu=acceptedGpuResult||positive(m.gpuForwardCalls)||positive(m.fourierFftGpuCalls)||positive(m.fourierMagnitudeGpuCalls)||positive(m.fourierPresentationGpuCalls)||positive(m.gpuRenderCalls)||positive(m.gpuJobs)||positive(m.gpuCalls)||positive(m.gpuReconstructionCalls)||positive(m.gpuForwardLevels)||positive(m.gpuDctCalls)||positive(m.gpu?.calls)||positive(m.gpu?.callBlocks)||positive(m.energyScoreGpu?.bands)||positive(m.gpu?.gpuJobs)||positive(m.gpuScoreCalls)||Array.isArray(m.gpuStages)&&m.gpuStages.length>0||positive(m.gpuSearch?.calls)||positive(m.flowGpu?.calls)||positive(m.flowGpu?.gpuCalls)||positive(m.flowMetrics?.gpuCalls)||positive(m.hammingGpuCalls);
 if(currentGpu)return{backend:'hybrid',cpu:true,gpu:true};
 const tags=[m.backend,m.numericBackend,m.hammingBackend].filter(x=>typeof x==='string');if(tags.some(x=>x==='webgpu'||x==='hybrid'||x.startsWith('webgpu-')))return null;
 if(tags.includes('cpu')||tags.includes('wasm')||typeof m.kernel==='string'&&(/^(cpu-|resampling-numpy-fft-cpu|ela-energy-reference|ela-energy-segmented|zero-native-|zero-reference-|jpeg-recompression-(pool|serial)|jpeg-quality-cached|copy-move-)/.test(m.kernel)))return{backend:'cpu',cpu:true,gpu:false};
 return null;
}
export function pixelUsefulEvidence(owner,answer){
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 if(owner.resourceContext?.trustRequired){const trust=answer.data?.metadata?.trust_sha256??answer.provenance?.params?.trustSha256;if(!SHA.test(trust??''))return null;owner={...owner,sourceShas:[owner.sourceShas[0],trust],performanceIdentityComplete:true};}
 if(answer.metrics?.memory?.budgetBytes!==undefined&&answer.metrics.memory.budgetBytes!==owner.budgetBytes)return null;
 const cached=pixelUsefulCached(answer);
 // Old counters may accompany a retained analysis. The current cache delivery
 // is CPU composition/transport only and cannot enter a speed pair.
 if(cached)return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualCpuWork:true,actualGpuWork:false,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 const facts=pixelUsefulBackend(owner,answer);if(!facts)return null;
 if(facts.gpu&&owner.numericAdmissible?.webgpu!==true)return null;
 return createUsefulOperationEvidence({...owner,actualBackend:facts.backend,actualCpuWork:facts.cpu,actualGpuWork:facts.gpu,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
