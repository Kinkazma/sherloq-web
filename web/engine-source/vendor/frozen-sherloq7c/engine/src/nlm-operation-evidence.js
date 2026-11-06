import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
// This description uses the configured arithmetic-actor ceiling. It does not
// claim that all actors ran, or infer a module's cold/warm state from timings.
export function nlmOperationOwner(task,{image,version,profile,budget,cpuKernel}={}){
 if(task?.operation!=='noise.separation'||task.params?.mode!==4||image?.provenance?.decoder==='caller')return null;
 const shape=task.sourceRegionDomain?sourceRegionDomainShape(task.sourceRegionDomain):'identity';if(!['identity','rectangle','native-regions','membership'].includes(shape))return null;
 const parameters=PIXEL_OPERATIONS['noise.separation'].validate(task.params),configuredActors=['native-regions','membership'].includes(shape)?1:cpuKernel==='auto'?Math.min(32,profile.maxWorkers):1;
 if(!Number.isInteger(configuredActors)||configuredActors<1)return null;
 return{schema:'sherloq.useful-operation-owner/1',operation:task.operation,method:'4',precision:'Native NLM7x7-21x21 complete original/derived grid RGB8; qualified GPU <=1e-4 before native pack',parameters,modelShas:[],requiresModels:false,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,regime:'unknown',threads:configuredActors,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:'single-original',sourceShas:[],resourceContext:{ownerClass:['native-regions','membership'].includes(shape)?'observed-original-main-native-grid':shape==='rectangle'?'derived-native-rectangle-grid':image.segmented?'segmented-original-grid':'contiguous-original-grid',sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??'memory',cpuKernel,threadSemantics:'configured maximum independent arithmetic actors, each single threaded; actual actors remain in completed metrics',modulePhase:'unknown',gpuProviderLifetime:'fresh-per-useful-session'},work:null,historicalBackend:'cpu',admission:{cpu:true,webgpu:!!globalThis.navigator?.gpu},numericAdmissible:{cpu:true,webgpu:true}};
}
export function nlmOperationEvidence(owner,result){
 if(!owner||result?.status!=='ok'||result.operation!==owner.operation)return null;
 const m=result.metrics??{};
 // A scientific cache is retained. Only the new CPU rendering is observed as
 // partial work; no filter producer/backend is invented and it cannot pair.
 const cached=m.cache?.result===true||m.analysisCacheHit===true||m.filterCacheHit===true||m.backend==='cached-native-separation-filter';
 if(cached)return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualGpuWork:false,actualCpuWork:true,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 const gpuCalls=m.gpu?.calls??0,actualActors=m.workers??1;
 if(!Number.isInteger(actualActors)||actualActors<1||actualActors>owner.threads||!Number.isInteger(gpuCalls)||gpuCalls<0)return null;
 if(gpuCalls===0&&m.backend!=='cpu')return null;
 const actualBackend=gpuCalls>0?'webgpu':'cpu';
 if(actualBackend==='webgpu'&&m.backend!=='webgpu-native-nlm-acknowledged')return null;
 return createUsefulOperationEvidence({...owner,actualBackend,actualGpuWork:gpuCalls>0,actualCpuWork:true,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
