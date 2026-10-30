import "../../runtime-context.js?v=0.30.0";
import {externalUsefulOwner,externalUsefulEvidence} from './external-useful-operation.js';
import {extensionUsefulOwner,extensionUsefulEvidence} from './extensions-useful-operation.js';
import {usefulOwnerWorkContract} from './useful-owner-facts.js';
import {pixelUsefulOwner,pixelUsefulEvidence} from './pixel-useful-operation.js';
import {researchUsefulOwner,researchUsefulEvidence} from './research-useful-operation.js';
import {neuralUsefulOwner,neuralUsefulEvidence} from './neural-useful-operation.js';
import {alikedOperationOwner,alikedOperationEvidence} from './aliked-operation-evidence.js';
import {nlmOperationOwner,nlmOperationEvidence} from './nlm-operation-evidence.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
// These four existing complete CPU contracts have no GPU core path. Other
// tools need their own real owner evidence; requested backend is never enough.
const CONTRACTS=Object.freeze({'colors.stats':'Native pixel statistics CPU scalar output','noise.planes':'Native RGB8 bit-plane CPU scalar output','noise.minmax':'Native RGB8 neighbourhood extrema CPU scalar output','pixels.defects':'Native defect-pixel CPU scalar output'});
export const supportsNativeUsefulOperation=operation=>['various.ocr','analysis.complete','analysis.clones'].includes(operation)||operation==='noise.separation'||operation==='tampering.copyMove.sparse'||operation==='tampering.copyMove.dense'||operation==='ela.classic'||Object.hasOwn(PIXEL_OPERATIONS,operation)||['ai.clones.d2prl','ai.clones.segmentation','ai.sources.safire','ai.localization.focal','ai.localization.adaifl','ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'].includes(operation);
function rawNativeUsefulOwner(task,context={}){
 const{version,profile,budget,cpuKernel,image}=context;
 if(['various.ocr','analysis.complete','analysis.clones'].includes(task?.operation))return externalUsefulOwner(task,context);
 if(['ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'].includes(task?.operation))return extensionUsefulOwner(task,context);
 if(task?.operation==='tampering.copyMove.sparse')return alikedOperationOwner(task,context)??researchUsefulOwner(task,context);
 if(task?.operation==='noise.separation')return nlmOperationOwner(task,context)??pixelUsefulOwner(task,context);
 if(['tampering.copyMove.dense','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(task?.operation))return researchUsefulOwner(task,context);
 if(['ai.clones.d2prl','ai.clones.segmentation'].includes(task?.operation))return neuralUsefulOwner(task,context);
 if(!CONTRACTS[task?.operation])return pixelUsefulOwner(task,context);
 const precision=CONTRACTS[task?.operation];if(!precision||image?.provenance?.decoder==='caller')return null;
 const parameters=PIXEL_OPERATIONS[task.operation].validate(task.params),scoped=task.sourceRegionDomain&&task.sourceRegionDomain.countIncluded!==task.sourceRegionDomain.snapshot.width*task.sourceRegionDomain.snapshot.height;
 return{schema:'sherloq.useful-operation-owner/1',operation:task.operation,method:'default',precision,parameters,modelShas:[],requiresModels:false,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,regime:'unknown',threads:1,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:'single-original',sourceShas:[],resourceContext:{ownerClass:scoped?'native-domain-main-CPU-scalar':'original-main-CPU-scalar',threadSemantics:'actual single arithmetic owner',sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??'memory',cpuKernel},work:null,admission:{cpu:true,webgpu:false},numericAdmissible:{cpu:true,webgpu:false}};
}
export function nativeUsefulOwner(task,context={}){return usefulOwnerWorkContract(rawNativeUsefulOwner(task,context));}
export function nativeUsefulCacheKey(task,answer){
 const op=PIXEL_OPERATIONS[task.operation];if(!CONTRACTS[task.operation]||!op)return null;const p=op.validate(task.params),imageId=answer?.metrics?.sourceRegion?.cacheIdentity??task.imageId;return imageId+'\0op/'+task.operation+'/'+JSON.stringify(op.cacheParams?.(p)??p);
}
export function nativeUsefulEvidence(owner,answer,{cacheAcknowledged=false}={}){
 if(['various.ocr','analysis.complete','analysis.clones'].includes(owner?.operation))return externalUsefulEvidence(owner,answer);
 if(['ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'].includes(owner?.operation))return extensionUsefulEvidence(owner,answer);
 if(owner?.operation==='tampering.copyMove.sparse')return ['ALIKED','ALIKED rotation'].includes(owner.method)?alikedOperationEvidence(owner,answer):researchUsefulEvidence(owner,answer);
 if(owner?.operation==='noise.separation')return owner.method==='4'?nlmOperationEvidence(owner,answer):pixelUsefulEvidence(owner,answer);
 if(['tampering.copyMove.dense','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(owner?.operation))return researchUsefulEvidence(owner,answer);
 if(['ai.clones.d2prl','ai.clones.segmentation'].includes(owner?.operation))return neuralUsefulEvidence(owner,answer);
 if(!CONTRACTS[owner?.operation])return pixelUsefulEvidence(owner,answer);
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 const hit=answer.metrics?.cache?.result===true||answer.metrics?.analysisCacheHit===true;
 // A cached object is not proof that the producer's final cleanup succeeded.
 // The engine's weak ACK marker is set only after the public run resolved.
 if(hit&&!cacheAcknowledged)return null;
 const origin=hit?{schema:'sherloq.useful-operation/1',operation:owner.operation,method:owner.method,precision:owner.precision,parameters:owner.parameters,modelShas:[],requiresModels:false,codeSha256:owner.codeSha256,actualBackend:'cpu',actualGpuWork:false,actualCpuWork:true,regime:'unknown',inputContract:'single-original',sourceShas:[],completedAfterAck:true,numericAdmissible:true}:undefined;
 return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualGpuWork:false,actualCpuWork:!hit,completedAfterAck:true,numericAdmissible:true,cache:hit?'hit':'miss',...(origin?{origin}:{})});
}
