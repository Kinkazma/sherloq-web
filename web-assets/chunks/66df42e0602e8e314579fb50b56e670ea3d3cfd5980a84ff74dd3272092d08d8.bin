import "../../runtime-context.js?v=0.30.0";
import{SEGMENTATION_MODELS}from'../experiments/segmentation/models.js';
import{D2PRL_MODEL_IDENTITY}from'./d2prl-model-identity.js';
import{d2prlInputSide}from'../experiments/d2prl/input-side.js';
import{usefulOperationMethod,usefulScientificParameters}from'./useful-operation-method.js';
import{configuredShas,unknownOwner,stageCacheHit}from'./useful-owner-facts.js';
import{createUsefulOperationEvidence}from'./useful-operation-evidence.js';
import{USEFUL_WORK_CODE_IDENTITY}from'./useful-work-code-identity.js';
function executions(answer){
 const out=[],seen=new Set();let count=0;
 const visit=(x,depth=0)=>{if(!x||typeof x!=='object'||ArrayBuffer.isView(x)||seen.has(x)||depth>8||++count>2048)return;seen.add(x);if(Object.hasOwn(x,'convolution')||Object.hasOwn(x,'patchmatch')||Object.hasOwn(x,'roleRuntime')||Object.hasOwn(x,'provider')||Object.hasOwn(x,'backend'))out.push(x);for(const k of['execution','inference','nativePipelines','pipelines','stages','windows','windowResults','runtime']){const v=x[k];if(Array.isArray(v)){for(const i of v)visit(i,depth+1);}else visit(v,depth+1);}};visit(answer.metrics);visit(answer.data?.metadata);return out;
}
const backend=v=>typeof v==='string'?v:v?.backend??v?.provider;
export function neuralUsefulOwner(task,ctx={}){
 let model,parameters={...task.params},method,gpu=true,numeric=true,ownerClass;
 if(task.operation==='ai.clones.d2prl'){
  const side=d2prlInputSide(parameters.inputSide);parameters={inputSide:side,minimum:500,exclusions:[],...parameters};method='d2prl';ownerClass='D2PRL-Native-roles-and-matcher';model={...D2PRL_MODEL_IDENTITY,checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36'};
  // A visible experimental size is not a numerical admission. Native supplies
  // additional qualified sides separately after its complete NN reception.
  numeric=(ctx.d2Admission?.cpuSides??[448]).includes(side);gpu=(ctx.d2Admission?.gpuSides??[448]).includes(side);
 }else if(task.operation==='ai.clones.segmentation'){
  method=parameters.variant;model=SEGMENTATION_MODELS[method];if(!model)return null;ownerClass='Native-segmentation/'+method;gpu=!!model.gpu;
 }else return null;
 parameters=usefulScientificParameters(task.operation,parameters);parameters.nativeTask={regions:structuredClone(task.regions??null),scientificScope:structuredClone(task.scientificScope??null),cloneWindowMode:task.cloneWindowMode??'independent'};
 const owner=unknownOwner(task,{...ctx,method,parameters,precision:'Native '+method+' registered numerical protocol',modelShas:configuredShas(model),requiresModels:true,gpu,ownerClass,historicalBackend:gpu?'webgpu':'cpu',context:{codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,sourceDomain:task.sourceRegionDomain?.fingerprint?'scoped':'Original'}});
 if(owner){owner.admission.cpu=numeric;owner.numericAdmissible.cpu=numeric;owner.numericAdmissible.webgpu=gpu;}return owner;
}
export function neuralUsefulEvidence(owner,answer){
 if(!owner||answer?.operation!==owner.operation||answer.status!=='ok')return null;
 const m=answer.metrics??{},cached=stageCacheHit(answer)||m.inferences===0||m.inferenceCalls===0||m.nativeInferenceCalls===0||m.nativeAnalysisCalls===0;
 if(cached)return createUsefulOperationEvidence({...owner,actualBackend:'cpu',actualCpuWork:true,actualGpuWork:false,completedAfterAck:true,numericAdmissible:true,cache:'partial'});
 const rows=executions(answer),providers=rows.flatMap(x=>[backend(x),backend(x.convolution),backend(x.patchmatch),backend(x.random),backend(x.dlf)]).filter(x=>typeof x==='string');
 const gpu=providers.some(x=>x==='webgpu'||x.startsWith('webgpu-'))||rows.some(x=>x.actualGpuWork===true);
 const cpu=providers.some(x=>x==='cpu'||x==='wasm'||x.startsWith('wasm-'))||rows.some(x=>x.roles==='onnxruntime-wasm'||x.roleRuntime?.provider==='wasm');
 if(!gpu&&!cpu||gpu&&owner.numericAdmissible.webgpu!==true||!gpu&&owner.numericAdmissible.cpu!==true)return null;
 // These models retain Native CPU roles/normalization/heads on their GPU route.
 return createUsefulOperationEvidence({...owner,actualBackend:gpu?'hybrid':'cpu',actualCpuWork:true,actualGpuWork:gpu,completedAfterAck:true,numericAdmissible:true,cache:'miss'});
}
