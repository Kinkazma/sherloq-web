import "../../runtime-context.js?v=0.33.3";
import {NATIVE16_ALGEBRAIC_COLOR_SPACES} from './opencv-operations.js';
import {native16ProxyParametersAdmitted} from './native16-parameter-contract.js';
import {native16EchoParams,native16EchoParametersAdmitted} from './native16-echo-contract.js';
import {native16GradientRegionParametersAdmitted} from './native16-gradient-region-contract.js';
import {sherloq7cUsefulEvidence,sherloq7cUsefulFacts} from './sherloq7c-useful-evidence.js';
import{PIXEL_OPERATIONS}from'./pixel-operations.js';
import{validateParams as elaParams}from'./ela.js';
import{sourceRegionDomainShape}from'./source-region-capabilities.js';
import{gradientGpuAdmitted}from'./gradient-gpu-admission.js';
import{native16MagnifierParametersAdmitted}from'./native16-magnifier-contract.js';
import{native16AdjustParams,native16AdjustParametersAdmitted}from'./native16-adjust-contract.js';
import{native16CompositeEqualizationPlan}from'./native16-equalization-contract.js';
import{usefulOperationMethod,usefulScientificParameters}from'./useful-operation-method.js';
import{createUsefulOperationEvidence}from'./useful-operation-evidence.js';
import{USEFUL_WORK_CODE_IDENTITY}from'./useful-work-code-identity.js';
const SHA=/^[a-f0-9]{64}$/;
const GPU_OPS=new Set(['inspection.sherloq7c','detail.gradient','inspection.adjust','ela.classic','ela.biomes','ela.energy','ela.bitrate','tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','tampering.resampling','tampering.resampling.fourier','various.median','noise.noisesniffer','noise.prnu','comparison.image','detail.frequency','noise.blocking','detail.wavelets','various.stereogram','jpeg.zero','jpeg.ghosts','jpeg.recompression','jpeg.quality']);
const MODEL_REFS=new Set(['various.median','jpeg.quality']);
const REQUIRED_MODELS=new Set(['various.median']);
const NATIVE_CPU=new Set(['subimages.detect','colors.plots','file.digest','file.hex','metadata.structure','metadata.location','metadata.thumbnail','metadata.exiftool','metadata.c2pa','inspection.magnifier','inspection.histogram','various.illuminant','tampering.contrast','jpeg.multiple','colors.pca','colors.space','detail.echo','colors.stats','noise.planes','noise.minmax','pixels.defects']);
const positive=v=>Number.isFinite(v)&&v>0;
function referencesFor(task,p,getReference){
 const operation=PIXEL_OPERATIONS[task.operation];let ids;try{ids=operation?.references?.(p)??[];}catch{ids=[''];}const references=[];
 for(const id of ids){let r;try{r=getReference?.(id);}catch{}references.push(r??null);}return references;
}
export function pixelUsefulOwner(task,{version,profile,budget,cpuKernel,image,getReference}={}){
 const op=PIXEL_OPERATIONS[task?.operation];if(!op&&task?.operation!=='ela.classic'||image?.provenance?.decoder==='caller')return null;
 const shape=task.sourceRegionDomain?sourceRegionDomainShape(task.sourceRegionDomain):'identity',nativeDepth=!!image?.nativeSurface&&(task.workingDepth??image.workingDepth??16)===16;
 const composite=nativeDepth&&(shape==='identity'||task.operation==='inspection.magnifier'&&shape==='rectangle')?native16CompositeEqualizationPlan(task.operation,task.params):null;
 const p=task.operation==='ela.classic'?elaParams(task.params):task.operation==='detail.echo'&&nativeDepth&&native16EchoParametersAdmitted(task.params,shape)?native16EchoParams(task.params):task.operation==='inspection.adjust'&&nativeDepth&&shape==='identity'&&native16AdjustParametersAdmitted(task.params)?native16AdjustParams(task.params):op.validate(composite?.base??task.params),refs=referencesFor(task,p,getReference),modelRefs=MODEL_REFS.has(task.operation),modelShas=modelRefs?refs.map(r=>r?.sha256).filter(s=>SHA.test(s??'')):[],sourceRefs=modelRefs?[]:refs;
 const parameters=usefulScientificParameters(task.operation,p),method=usefulOperationMethod(task.operation,p).method;
 // Non-ID scientific task inputs remain in the comparison material.
 parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??null};
 let gpu=GPU_OPS.has(task.operation);
 if(task.operation==='ela.bitrate'){parameters.nativeTask.workingDepth=8;parameters.nativeTask.outputDepth=8;parameters.analysisDomain='canonical-sdr-rgb8';}
 const nativeEqualization=!!composite&&(shape==='identity'||task.operation==='inspection.magnifier'&&shape==='rectangle');
 if(nativeEqualization){parameters.equalization=structuredClone(composite.state);parameters.nativeEqualization={method:composite.method.id,value:composite.value,channels:composite.channels?'RGB':'HSV-V',workingDepth:16};parameters.nativeTask.workingDepth=16;gpu=true;}
 // The existing regional provider mixes GPU cores and native CPU boundaries.
 // Gaussian observed boundaries retain binary64 inside that provider.
 if(task.operation==='noise.separation'){gpu=['identity','rectangle','native-regions','membership'].includes(shape);const native=nativeDepth&&native16ProxyParametersAdmitted(task.operation,p,shape);parameters.nativeTask.workingDepth=native?16:8;if(native){parameters.nativeTask.outputDepth=p.denoised?16:8;if(p.mode===4)parameters.nativeNlm={contract:'native16-nlm-l2/1',representation:p.grayscale?'UInt16GrayL2':'coded-nominal-Lab-D65',norm:'L2',patch:7,search:21,halo:13};}}
 if(task.operation==='noise.blocking'&&nativeDepth&&native16ProxyParametersAdmitted(task.operation,p,shape)){parameters.nativeTask.workingDepth=16;parameters.nativeTask.outputDepth=8;}
 if(task.operation==='colors.space'&&nativeDepth&&image.nativeSurface.descriptor?.format==='rgb16'&&image.nativeSurface.descriptor.depth===16&&native16ProxyParametersAdmitted(task.operation,p,shape)){parameters.nativeTask.workingDepth=16;parameters.nativeTask.outputDepth=16;}
 if(task.operation==='pixels.defects'&&nativeDepth&&image.nativeSurface.descriptor?.format==='rgb16'&&image.nativeSurface.descriptor.depth===16&&native16ProxyParametersAdmitted(task.operation,p,shape)){parameters.nativeTask.workingDepth=16;parameters.nativeTask.outputDepth=p.mode===2?16:8;}
 if(task.operation==='inspection.adjust'){const native=!!image?.nativeSurface&&(task.workingDepth??image.workingDepth??16)===16&&shape==='identity'&&native16AdjustParametersAdmitted(task.params);parameters.nativeTask.workingDepth=native?16:8;gpu=native||!image?.segmented&&shape==='identity';}
 if(task.operation==='inspection.magnifier')parameters.nativeTask.workingDepth=image?.nativeSurface&&(task.workingDepth??image.workingDepth??16)===16&&native16MagnifierParametersAdmitted(task.params)&&['identity','rectangle'].includes(shape)?16:8;
 if(task.operation==='detail.echo'&&nativeDepth&&native16EchoParametersAdmitted(task.params,shape))parameters.nativeTask.workingDepth=16;
 if(task.operation==='detail.gradient'){gpu=gradientGpuAdmitted(image,p,{cpuKernel,shape,workingDepth:task.workingDepth});parameters.nativeTask.workingDepth=image?.nativeSurface&&(task.workingDepth??image.workingDepth??16)===16&&native16GradientRegionParametersAdmitted(p,shape)?16:8;}
 if(cpuKernel==='reference'&&task.operation!=='inspection.sherloq7c')gpu=false;
 const threads=task.operation==='inspection.sherloq7c'||cpuKernel==='reference'?1:Math.min(32,profile?.maxWorkers??1);if(!Number.isSafeInteger(threads)||threads<1)return null;
 const trustRequired=task.operation==='metadata.c2pa'&&p.trustAnchors!=null;const inputs=sourceRefs.length?[image?.sha256,...sourceRefs.map(r=>r?.sha256)]:trustRequired?[image?.sha256,null]:[];
 parameters.referenceDomains=sourceRefs.map(r=>r?.sourceRegionDomain?.fingerprint??r?.provenance?.sourceRegionDomain?.fingerprint??null);
 if(task.usefulExecutionRoute)parameters.executionRoute=task.usefulExecutionRoute;
 if(task.operation==='file.digest')parameters.sourceProperties=Object.fromEntries(['name','size','lastModified','type'].filter(k=>image.sourceFile?.[k]!==undefined).map(k=>[k,image.sourceFile[k]]));
 const allInputs=(!inputs.length||inputs.every(s=>SHA.test(s??'')))&&(!REQUIRED_MODELS.has(task.operation)||modelShas.length>0);
 const owner={schema:'sherloq.useful-operation-owner/1',operation:task.operation,method,parameters,precision:'Native '+task.operation+' registered CPU/GPU arithmetic v1',modelShas,requiresModels:REQUIRED_MODELS.has(task.operation),codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,regime:'unknown',threads,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:inputs.length?'ordered-original-and-references':'single-original',sourceShas:inputs,performanceIdentityComplete:allInputs,resourceContext:{ownerClass:'registered-native-pixel/'+task.operation,threadSemantics:'configured maximum arithmetic actors; actual actors remain in completed metrics',cpuKernel,sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??image.surface?.storage??image.store?.storage??image.session?.backend??'unknown',sourceDomainClass:shape,trustRequired,providerPhase:'unknown',workCategory:task.operation+'/'+method,workContract:'registered-complete-operation-v1'},work:null,historicalBackend:'cpu',admission:{cpu:true,webgpu:gpu&&!!globalThis.navigator?.gpu},numericAdmissible:{cpu:true,webgpu:gpu}};
 // Gradient and transform owners select their admitted GPU/CPU route at
 // either depth; absent comparable history must not force a CPU warm-up.
 // Native16 separation and adjustments defer fresh Auto to their qualified
 // owner; byte adjustments retain their historical CPU-first routing.
 if((nativeEqualization||task.operation==='detail.gradient'||(['detail.frequency','detail.wavelets'].includes(task.operation)||task.operation==='noise.blocking'&&parameters.nativeTask.workingDepth===16)&&shape==='identity'||['noise.separation','inspection.adjust'].includes(task.operation)&&parameters.nativeTask.workingDepth===16)&&gpu&&(!task.regions||Array.isArray(task.regions)&&task.regions.length===0))owner.historicalBackend='auto';
 if(task.operation==='noise.separation'&&p.mode===4&&parameters.nativeTask.workingDepth===16)owner.precision=p.grayscale?'Native NLM UInt16GrayL2; historical7x7/21x21 fixed-point weights and scaled native-code distances':'Native NLM coded-nominal-Lab-D65/L2; retained RGB16 codes,Lab32F nominal intermediates; no scientific ICC/TRC conversion';
 if(task.operation==='noise.blocking'&&parameters.nativeTask.workingDepth===16)owner.precision='Native UInt16 code-value grayscale into existing binary64 global db8/MAD; RGB8 is diagnostic presentation, no scientific ICC/TRC conversion';
 if(task.operation==='colors.space'&&parameters.nativeTask.workingDepth===16)owner.precision=NATIVE16_ALGEBRAIC_COLOR_SPACES.includes(p.space)?'Native UInt16 working RGB code values/65535 in the shared Float32 algebraic color formulas; fixed normalized RGB16 channel visualization; derived CMYK, no physical ICC conversion':'Native UInt16 source through common profiled XYZ D50 Float32/CIE1976; fixed declared channel mapping to RGB16, no SDR8 or inverse CMM intermediate';
 if(task.operation==='pixels.defects'&&parameters.nativeTask.workingDepth===16)owner.precision='Native UInt16 encoded-channel candidate comparisons; threshold/spread UI8 scaled by257, existing norm/radius; mode2 retains corrected RGB16, modes0/1 are RGB8 diagnostic presentations; not sensor RAW diagnosis';
 if(task.operation==='inspection.sherloq7c'){
  owner.precision=p.precision==='reference'?'Sherloq7C nativeRGB16/f64; target RMS2e-4; projection eps1e-11+polish':'Sherloq7C nativeRGB16/f64; maxabs-before-quantization '+p.precision;
  owner.resourceContext={...owner.resourceContext,ownerClass:'sherloq7c-native16-f64-certified',threadSemantics:'one serialized main-worker CPU actor; initializer owns its GPU scheduler slot',workingBitDepth:16,scalarPrecision:'float64',quantizationExtra:0.5/65535,originalSha256:image.sha256,autoPolicy:'Sherloq fixed component-size policy; no scientific preflight'};
  // The component graph and certified-cache phase do not exist before the
  // requested run. Keep explicit/human admission, and leave fresh Auto to the
  // actual Sherloq owner instead of selecting GPU from a generic weak prior.
  owner.performanceIdentityComplete=false;owner.historicalBackend='auto';
 }
 return owner;
}
export function pixelUsefulCached(answer){
 const m=answer?.metrics??{},c=m.cache??{};
 return c.result===true||c.analysis===true||m.analysisCacheHit===true||m.analysisCached===true||m.filterCacheHit===true||m.statisticsCached===true||m.coefficientsCached===true||m.residualCached===true||m.displayCached===true||m.maskCached===true||m.baseCached===true||m.searchCached===true||m.flowCached===true||m.grayCached===true||m.qualityCurveCached===true||Object.values(c.stages??{}).some(v=>v===true);
}
// Every predicate refers to a committed result/counter from an actual provider,
// never a requested backend, elapsed time, or mere existence of navigator.gpu.
export function pixelUsefulBackend(owner,answer){
 if(owner?.operation==='inspection.sherloq7c'){const facts=sherloq7cUsefulFacts(owner,answer);return facts?{backend:facts.backend,cpu:facts.cpu,gpu:facts.gpu}:null;}
 const m=answer?.metrics??{},op=owner.operation;
 if(NATIVE_CPU.has(op)&&!owner.parameters?.nativeEqualization)return{backend:'cpu',cpu:true,gpu:false};
 const acceptedGpuResult=op==='ela.bitrate'&&m.gpuArithmetic==='integer-byte-lookup'&&positive(m.gpuLookupCalls)&&positive(m.gpuUploadedBytes)||m.kernel==='frequency-gpu-mask+cpu-dft'&&m.gpu?.accountedGpuBufferBytes>0||m.numericBackend==='webgpu-native-gray-islow'&&positive(m.bands)&&positive(m.qualities)||['native-RGB-ghost-shared-FDCT-integer-reduction','native-ISLOW420-GPU-and-native-coefficient-entropy'].includes(m.kernel)&&positive(m.gpu?.blocks);
 const currentGpu=op==='inspection.adjust'&&(m.kernel==='native-adjustment-prefix-and-exact-display-LUT'&&positive(m.gpuBatches)||m.kernel==='native16-adjustment-pipeline'&&m.inputDepth===16&&owner.parameters?.nativeTask?.workingDepth===16&&positive(m.gpuJobs))||acceptedGpuResult||positive(m.gpuForwardCalls)||positive(m.fourierFftGpuCalls)||positive(m.fourierMagnitudeGpuCalls)||positive(m.fourierPresentationGpuCalls)||positive(m.gpuRenderCalls)||positive(m.gpuJobs)||positive(m.gpuCalls)||positive(m.gpuReconstructionCalls)||positive(m.gpuForwardLevels)||positive(m.gpuDctCalls)||positive(m.gpu?.calls)||positive(m.gpu?.callBlocks)||positive(m.energyScoreGpu?.bands)||positive(m.gpu?.gpuJobs)||positive(m.gpuScoreCalls)||Array.isArray(m.gpuStages)&&m.gpuStages.length>0||positive(m.gpuSearch?.calls)||positive(m.flowGpu?.calls)||positive(m.flowGpu?.gpuCalls)||positive(m.flowMetrics?.gpuCalls)||positive(m.hammingGpuCalls);
 if(currentGpu)return{backend:'hybrid',cpu:true,gpu:true};
 const tags=[m.backend,m.numericBackend,m.hammingBackend].filter(x=>typeof x==='string');if(tags.some(x=>x==='webgpu'||x==='hybrid'||x.startsWith('webgpu-')))return null;
 if(tags.includes('cpu')||tags.includes('wasm')||typeof m.kernel==='string'&&(/^(cpu-|resampling-numpy-fft-cpu|ela-energy-reference|ela-energy-segmented|zero-native-|zero-reference-|jpeg-recompression-(pool|serial)|jpeg-quality-cached|copy-move-)/.test(m.kernel)))return{backend:'cpu',cpu:true,gpu:false};
 return null;
}
export function pixelUsefulEvidence(owner,answer){
 if(owner?.operation==='inspection.sherloq7c')return sherloq7cUsefulEvidence(owner,answer);
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 if(owner.resourceContext?.trustRequired){const trust=answer.data?.metadata?.trust_sha256??answer.provenance?.params?.trustSha256;if(!SHA.test(trust??''))return null;owner={...owner,sourceShas:[owner.sourceShas[0],trust],performanceIdentityComplete:true};}
 if(answer.metrics?.memory?.budgetBytes!==undefined&&answer.metrics.memory.budgetBytes!==owner.budgetBytes)return null;
 const cached=pixelUsefulCached(answer);
 // Old counters may accompany a retained analysis. The current cache delivery
 // is CPU composition/transport only and cannot enter a speed pair.
 if(cached){
  // A retained native adjustment prefix can still feed a new, committed GPU
  // display lookup. A whole-result hit carries old counters and is excluded.
  const m=answer.metrics,adjustGpu=owner.operation==='inspection.adjust'&&m.cache?.result!==true&&(m.kernel==='native-adjustment-prefix-and-exact-display-LUT'&&positive(m.gpuBatches)||m.kernel==='native16-adjustment-pipeline'&&m.inputDepth===16&&owner.parameters?.nativeTask?.workingDepth===16&&positive(m.gpuJobs))&&owner.numericAdmissible?.webgpu===true,gradientGpu=owner.operation==='detail.gradient'&&m.cache?.result!==true&&m.kernel==='native-Sobel-byte-lookup-GPU'&&positive(m.gpuJobs)&&owner.numericAdmissible?.webgpu===true,currentGpu=adjustGpu||gradientGpu;
  return createUsefulOperationEvidence({...owner,actualBackend:currentGpu?'hybrid':'cpu',actualCpuWork:true,actualGpuWork:currentGpu,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 }
 const facts=pixelUsefulBackend(owner,answer);if(!facts)return null;
 if(facts.gpu&&owner.numericAdmissible?.webgpu!==true)return null;
 return createUsefulOperationEvidence({...owner,actualBackend:facts.backend,actualCpuWork:facts.cpu,actualGpuWork:facts.gpu,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
