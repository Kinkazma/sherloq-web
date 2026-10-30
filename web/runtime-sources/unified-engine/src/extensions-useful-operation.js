import "../../runtime-context.js?v=0.30.0";
import{unknownOwner,configuredShas,stageCacheHit}from'./useful-owner-facts.js';
import{usefulScientificParameters}from'./useful-operation-method.js';
import{createUsefulOperationEvidence}from'./useful-operation-evidence.js';
import{USEFUL_WORK_CODE_IDENTITY}from'./useful-work-code-identity.js';
const METHODS=Object.freeze({'ai.generation.bfree':'bfree','ai.generation.spai':'spai','ai.text.doctamper':'doctamper','jpeg.comprint':'comprint'});
export function extensionUsefulOwner(task,ctx={}){
 const method=METHODS[task?.operation];if(!method)return null;const state=ctx.extensionResources?.models?.[method],shas=configuredShas(state);
 const parameters=usefulScientificParameters(task.operation,task.params??{});parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??null};
 return unknownOwner(task,{...ctx,method:'default',parameters,precision:'Native '+method+' registered model/preprocessing/CPU-statistics protocol',modelShas:shas,requiresModels:true,gpu:state?.gpuAvailable!==false,ownerClass:'extension/'+method,historicalBackend:state?.gpuAvailable===true?'webgpu':'cpu',context:{codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256}});
}
export function extensionUsefulEvidence(owner,answer){
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 const m=answer.metrics??{},events=Array.isArray(m.execution)?m.execution:[];
 if(stageCacheHit(answer)||m.cache?.stages===true)return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualGpuWork:false,actualCpuWork:true,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 if(!events.length)return null;const providers=events.map(x=>x.provider==='webgpu'&&x.gpuExecution?.observed===true&&x.gpuExecution.dispatches===0?'cpu':x.provider);if(providers.some(x=>!['cpu','wasm','webgpu'].includes(x)))return null;
 const gpu=events.some(x=>x.provider==='webgpu'&&x.actualGpuWork===true);if(providers.includes('webgpu')&&!gpu)return null;if(gpu&&owner.numericAdmissible.webgpu!==true)return null;
 return createUsefulOperationEvidence({...owner,actualBackend:gpu?'hybrid':'cpu',actualGpuWork:gpu,actualCpuWork:true,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
