import "../../runtime-context.js?v=0.30.0";
import {unknownOwner,configuredShas,stageCacheHit} from './useful-owner-facts.js';
import {usefulOperationMethod,usefulScientificParameters} from './useful-operation-method.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
import {PPOCR_MEDIUM} from './ppocr-recognition.js';
const M2=new Set(['cfa','trufor','rita','catnet','forgeryscope','composite']);
export function externalUsefulOwner(task,ctx={}){
 const m2=task?.operation?.startsWith('m2.')?task.operation.slice(3):null,pp=task?.operation==='various.ocr'&&(task.params?.algorithm??'ppocr-medium')==='ppocr-medium',automatic=['analysis.complete','analysis.clones'].includes(task?.operation);
 if(!M2.has(m2)&&!pp&&!automatic)return null;
 const method=usefulOperationMethod(task.operation,task.params).method,configuration=pp?PPOCR_MEDIUM:m2?ctx.m2Configuration:ctx.automaticResources;
 const modelShas=configuredShas(configuration),parameters=usefulScientificParameters(task.operation,task.params??{});
 parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??null};
 const gpu=!automatic&&(pp||m2==='cfa'||!!configuration?.runtimes?.webgpu)&&task.params?.prepareOnly!==true;
 return unknownOwner(task,{...ctx,method,parameters,precision:pp?'Official PP-OCRv6 Medium f32/BGR/CTC with Native text preprocessing':automatic?'Registered CPU automatic detector composition with Native complete groups':'Native M2 '+m2+' registered preprocessing/model/statistics protocol',modelShas,requiresModels:true,gpu,ownerClass:pp?'PP-OCR-Medium':automatic?'automatic-complete-CPU':'M2/'+m2,historicalBackend:'cpu',context:{codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256}});
}
// Only metadata created by completed execution paths is visited. Numeric
// outputs, model bytes, source pixels and requested-backend provenance are not.
export function actualExecutionFacts(answer){
 const current=answer?.metrics?.providerExecutions;if(current?.observed===true&&['wasm','webgpu','unknown'].every(k=>Number.isSafeInteger(current[k])&&current[k]>=0))return {gpu:current.webgpu>0,cpu:true,events:1+current.wasm+current.webgpu,...(current.unknown?{unknown:true}:{})};
 let gpu=false,cpu=false,events=0,nodes=0,unknown=false;const seen=new Set();
 const visit=(v,depth=0)=>{if(!v||typeof v!=='object'||ArrayBuffer.isView(v)||v instanceof ArrayBuffer||seen.has(v)||depth>12||++nodes>8192)return;seen.add(v);
  if(v.providerExecutions){const c=v.providerExecutions;if(c.observed===true&&c.unknown>0)unknown=true;if(c.observed===true&&c.wasm===0&&c.webgpu===0&&c.unknown===0){cpu=true;events++;}if(Number.isSafeInteger(c.wasm)&&c.wasm>0){cpu=true;events+=c.wasm;}if(Number.isSafeInteger(c.webgpu)&&c.webgpu>0){gpu=true;events+=c.webgpu;}}
  if(typeof v.provider==='string'){if(['cpu','wasm','onnxruntime-wasm','wasm-simd','wasm-workers'].includes(v.provider)){cpu=true;events++;}else if(v.provider==='webgpu'&&(v.actualGpuWork===true||v.gpuExecution?.actualGpuWork===true)){gpu=true;events++;}else if(v.provider==='webgpu'&&v.gpuExecution?.observed===true&&v.gpuExecution.dispatches===0){cpu=true;events++;}}
  if(v.automaticCpuOnly===true){cpu=true;events++;}
  for(const key of ['execution','executions','nativeExecution','metrics','tiles','runs','noiseprint','noiseprintExecutions','resources','stages']){const x=v[key];if(Array.isArray(x))for(const row of x)visit(row,depth+1);else visit(x,depth+1);}
 };
 visit(answer?.metrics);return {gpu,cpu,events,...(unknown?{unknown:true}:{})};
}
export function externalUsefulEvidence(owner,answer){
 if(!owner||answer?.status!=='ok'||answer.operation!==owner.operation)return null;
 const cached=stageCacheHit(answer),facts=actualExecutionFacts(answer);
 // A full result cache may carry old provider counters. Cache deliveries are
 // partial transport only; they never establish a fresh CPU/GPU speed pair.
 if(facts.unknown)return null;
 if(cached&&facts.gpu)return null;
 if(cached)return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualCpuWork:true,actualGpuWork:false,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 if(!facts.events||facts.gpu&&owner.numericAdmissible?.webgpu!==true)return null;
 return createUsefulOperationEvidence({...owner,actualBackend:facts.gpu?'hybrid':'cpu',actualCpuWork:true,actualGpuWork:facts.gpu,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
