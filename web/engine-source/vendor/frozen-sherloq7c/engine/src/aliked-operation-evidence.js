import {sparseCopyParams} from './sparse-copy.js';
import {ALIKED_MODELS} from './aliked-assets.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
const families=new Set(['ALIKED','ALIKED rotation']);
export function alikedOperationOwner(task,{image,version,profile,budget,cpuKernel}={}){
 if(task?.operation!=='tampering.copyMove.sparse'||!families.has(task.params?.algorithm)||image?.provenance?.decoder==='caller'||task.sourceRegionDomain&&sourceRegionDomainShape(task.sourceRegionDomain)!=='identity')return null;
 const p=sparseCopyParams(task.params);if(p.compare)return null;
 const model=ALIKED_MODELS[p.algorithm==='ALIKED rotation'?'aliked-n16rot':'aliked-n16'],threads=globalThis.crossOriginIsolated===true?Math.min(8,profile.maxWorkers):1;
 if(!Number.isInteger(threads)||threads<1)return null;
 const parameters={...p,legacyTask:{regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??'independent'}};
 return{schema:'sherloq.useful-operation-owner/1',operation:task.operation,method:p.algorithm,parameters,precision:'Native ALIKED CPU features and NumPy8lane f32 distance/sqrt; qualified pairs/RGB',modelShas:Object.entries(model.graphs).sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>g.sha256),requiresModels:true,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,regime:'unknown',threads,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:'single-original',sourceShas:[],resourceContext:{ownerClass:'original-ALIKED-CPU-features-qualified-float-matcher',threadSemantics:'configured Native CPU feature grant; CPU geometry and optional GPU distance',sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??'memory',cpuKernel,providerLifetime:'feature worker and distance owner scoped by actual pipeline',phase:'unknown'},work:null,historicalBackend:'cpu',admission:{cpu:true,webgpu:!!globalThis.navigator?.gpu},numericAdmissible:{cpu:true,webgpu:true}};
}
export function alikedOperationEvidence(owner,answer){
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 const out=answer.data,m=out?.metadata,e=m?.extraction,c=m?.stageCache;
 if(!out||out.params?.algorithm!==owner.method||e?.family!==owner.method||e.provider!=='wasm'||e.threads!==owner.threads||!c||!['features','matches','groups','fits'].every(k=>typeof c[k]==='boolean'))return null;
 const cached=Object.values(c).some(v=>v===true),freshMatching=c.matches===false,calls=m.matching?.gpu?.calls;
 let backend;
 if(freshMatching&&Number.isSafeInteger(calls)&&calls>0&&out.backend==='hybrid')backend='hybrid';
 else if(freshMatching){if(out.backend!=='cpu'||calls!==undefined&&calls!==0)return null;backend='cpu';}
 else backend='cpu'; // Current rendering/CPU assembly only; old GPU counters ignored.
 return createUsefulOperationEvidence({...owner,actualBackend:backend,actualCpuWork:true,actualGpuWork:backend==='hybrid',completedAfterAck:true,numericAdmissible:true,cache:cached?'partial':'miss'});
}
