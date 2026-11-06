import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
export const USEFUL_OPERATION_SCHEMA='sherloq.useful-operation/1';
const text=(v,max=128)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// Metadata only, called by the actual runtime owner AFTER its existing ACK.
// This never retires resources or substitutes for the owner's cleanup Promise.
export function createUsefulOperationEvidence(value){
 try{
  if(!value||value.completedAfterAck!==true||value.numericAdmissible!==true||!text(value.operation)||!text(value.method)||!text(value.precision)||!['cpu','webgpu','hybrid'].includes(value.actualBackend)||!['cold','warm','unknown'].includes(value.regime??'unknown')||!['miss','hit','partial'].includes(value.cache??'miss'))return null;
  const cache=value.cache??'miss',modelShas=value.modelShas??[];
  if(!Array.isArray(modelShas)||modelShas.length>128||!modelShas.every(sha)||value.requiresModels===true&&!modelShas.length||value.actualBackend==='hybrid'&&cache==='miss'&&!(value.actualCpuWork===true&&value.actualGpuWork===true)||value.actualBackend==='webgpu'&&cache==='miss'&&value.actualGpuWork!==true)return null;
  if(!Number.isInteger(value.threads)||value.threads<1||value.threads>1024||!text(value.profile)||!text(value.runtime)||!Number.isSafeInteger(value.budgetBytes)||value.budgetBytes<1)return null;
  const codeSha256=value.codeSha256??USEFUL_WORK_CODE_IDENTITY.sha256;if(codeSha256!==USEFUL_WORK_CODE_IDENTITY.sha256)return null;
  const parameters=structuredClone(value.parameters);if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))return null;
  const inputContract=value.inputContract??'single-original',sourceShas=value.sourceShas??[];
  if(!['single-original','ordered-original-and-references'].includes(inputContract)||!Array.isArray(sourceShas)||sourceShas.length>64||!sourceShas.every(sha)||inputContract==='ordered-original-and-references'&&sourceShas.length<2)return null;
  const out={schema:USEFUL_OPERATION_SCHEMA,operation:value.operation,method:value.method,actualBackend:value.actualBackend,actualGpuWork:value.actualGpuWork===true,actualCpuWork:value.actualCpuWork===true,regime:value.regime??'unknown',precision:value.precision,modelShas:[...modelShas],requiresModels:value.requiresModels===true,parameters,codeSha256,completedAfterAck:true,numericAdmissible:true,cache,inputContract,sourceShas:[...sourceShas],threads:value.threads,profile:value.profile,runtime:value.runtime,budgetBytes:value.budgetBytes,resourceContext:structuredClone(value.resourceContext??null),work:structuredClone(value.work??null)};
  if(cache==='hit'){if(!value.origin||value.origin.schema!==USEFUL_OPERATION_SCHEMA||value.origin.completedAfterAck!==true)return null;out.origin=structuredClone(value.origin);}
  if(new TextEncoder().encode(JSON.stringify(out)).byteLength>64*1024)return null;return Object.freeze(out);
 }catch{return null;}
}
