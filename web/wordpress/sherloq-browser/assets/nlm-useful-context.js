import {nlmCostGeometry} from './nlm-cost-geometry.js?v=0.30.0';
import {adaptiveIdentity} from './unified-engine/src/adaptive-runtime.js';

const SHA=/^[a-f0-9]{64}$/;
import {NLM_USEFUL_PRECISION as precision} from './unified-engine/src/nlm-useful-work-contract.js';
const stateValid=s=>s&&['cold','pending','ready'].includes(s.phase)&&Number.isSafeInteger(s.heapBytes)&&s.heapBytes>=0&&(s.phase==='ready'?s.heapBytes>0:s.heapBytes===0);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>0;
const sameState=(a,b)=>stateValid(a)&&stateValid(b)&&a.phase===b.phase&&a.heapBytes===b.heapBytes;

// This reads only already acquired source/domain/capability descriptors and
// passive browser properties. It never requests an adapter, source window,
// model, sample task or a second execution. Code identity is generated offline.
export async function describeUsefulNlm({task,source,domain,capabilities,codeIdentity,environment,crypto=globalThis.crypto}={}){
 const owner=capabilities?.usefulWork?.nlm;
 if(task?.operation!=='noise.separation'||task.params?.mode!==4||!['native-regions','membership'].includes(domain?.shape))return null;
 if(!source||!SHA.test(source.sha256)||!integer(source.width)||!integer(source.height)||!domain||domain.fingerprint!==task.sourceRegionDomain?.fingerprint||domain.sourceSha256!==source.sha256||!SHA.test(domain.fingerprint)||!integer(domain.countIncluded)||!integer(domain.width)||!integer(domain.height))return null;
 if(codeIdentity?.schema!=='sherloq.useful-work-code/1'||!SHA.test(codeIdentity.sha256)||!integer(codeIdentity.engineFiles)||!integer(codeIdentity.uiFiles))return null;
 if(owner?.schema!=='sherloq.nlm-owner-state/1'||owner.codeSha256!==codeIdentity.sha256||owner.route!=='native-observed-regions-v1'||owner.cpuThreads!==1||owner.providerLifetime!=='fresh-per-operation'||owner.precision!==precision||!stateValid(owner.native)||owner.native.phase==='pending')return null;
 if(!text(capabilities.version)||!text(capabilities.calculationProfile)||!text(owner.cpuKernel)||!integer(capabilities.memory?.budgetBytes))return null;
 if(!environment||!text(environment.userAgent)||typeof environment.crossOriginIsolated!=='boolean'||!integer(environment.hardwareConcurrency)||typeof environment.gpuApi!=='boolean'||!(environment.deviceMemory===null||Number.isFinite(environment.deviceMemory)&&environment.deviceMemory>0))return null;
 const backends=capabilities.operations?.find(v=>v.id==='noise.separation')?.backends;
 // The classical registry lists accelerated alternatives; run() always adds
 // CPU/Auto to that list. CPU qualification here comes from this route owner.
 if(!Array.isArray(backends))return null;
 const native={...owner.native},context={
  environment:await adaptiveIdentity({schema:'sherloq.passive-environment/1',userAgent:environment.userAgent,crossOriginIsolated:environment.crossOriginIsolated,hardwareConcurrency:environment.hardwareConcurrency,deviceMemory:environment.deviceMemory,gpuApi:environment.gpuApi},{crypto}),
  runtime:capabilities.version,profile:capabilities.calculationProfile,threads:owner.cpuThreads,
  resources:await adaptiveIdentity({schema:'sherloq.nlm-resources/1',budgetBytes:capabilities.memory.budgetBytes,cpuKernel:owner.cpuKernel,cpuThreads:owner.cpuThreads,providerLifetime:owner.providerLifetime},{crypto}),
 };
 return {
  codeShas:[codeIdentity.sha256],precision,context,regime:native.phase==='ready'?'warm':'cold',
  // A missing/oversized geometry keeps v1 exact-domain matching only.
  layout:domain.shape,shape:await nlmCostGeometry({descriptor:domain.costDescriptor,sourceStorage:domain.sourceStorage,layout:domain.shape,params:task.params,crypto})??domain.fingerprint,units:domain.countIncluded,
  // These are eligibility gates. Actual allocation/capability admission stays
  // in the existing requested engine transaction and can still refuse a run.
  admission:{cpu:true,webgpu:environment.gpuApi&&backends.includes('webgpu')&&owner.cpuKernel!=='reference'},numericAdmissible:{cpu:true,webgpu:owner.cpuKernel!=='reference'},
  verifyResult(result){
   const seen=result?.metrics?.nlmUsefulWork;
   return result?.operation==='noise.separation'&&result.status==='ok'&&seen?.schema==='sherloq.nlm-useful-work/1'&&seen.priorRetirementPending!==true&&seen.codeSha256===codeIdentity.sha256&&seen.route===owner.route&&seen.cpuThreads===owner.cpuThreads&&seen.providerLifetime===owner.providerLifetime&&seen.precision===precision&&sameState(native,seen.nativeBefore)&&seen.analysedPixels===domain.countIncluded;
  },
 };
}

export function passiveNlmEnvironment({navigator=globalThis.navigator,crossOriginIsolated=globalThis.crossOriginIsolated}={}){
 return {userAgent:navigator?.userAgent??null,hardwareConcurrency:navigator?.hardwareConcurrency??null,deviceMemory:navigator?.deviceMemory??null,crossOriginIsolated:crossOriginIsolated===true,gpuApi:!!navigator?.gpu};
}
