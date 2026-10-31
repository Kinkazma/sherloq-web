import {usefulOperationWork} from './useful-operation-work.js?v=0.31.0';
import {usefulOperationMethod,usefulScientificParameters} from './unified-engine/src/useful-operation-method.js';
import {adaptiveIdentity,analysisComparisonIdentity,backendScope} from './unified-engine/src/adaptive-runtime.js';
import {USEFUL_WORK_CODE_IDENTITY} from './unified-engine/src/useful-work-code-identity.js';
const SHA=/^[a-f0-9]{64}$/,modes=new Set(['auto','cpu','webgpu']);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v),same=(a,b)=>Object.is(a,b)||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]))||a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
function parameters(value,depth=0){if(depth>12)throw Error('Parameters too deep');if(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=4096||typeof value==='number'&&Number.isFinite(value))return value;if(Array.isArray(value)){if(value.length>4096)throw Error('Too many parameters');return value.map(v=>parameters(v,depth+1));}if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Unidentified non-scalar scientific parameter');const keys=Object.keys(value).sort();if(keys.length>256||keys.some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('Invalid parameter fields');return Object.fromEntries(keys.map(k=>[k,parameters(value[k],depth+1)]));}
const sourceSha=result=>result?.provenance?.originalSha256??result?.sourceRegionDomain?.snapshot?.sourceSha256;
const scope=result=>result?.provenance?.sourceRegionDomain??result?.sourceRegionDomain;
const decline=reason=>({recorded:false,reason});
const completionClasses=new Set(['ui-core-transaction','public-api-ack']);
const operationEnvironment=(environment,completionClass)=>{if(!completionClasses.has(completionClass))throw Error('Unknown useful completion protocol');return{...structuredClone(environment),completionClass};};
// Shared by before-owner recommendation and after-ACK observation. Only
// acquired metadata enters this identity; no image/model is read or hashed.
export async function usefulOperationIdentity({task,source,method='default',owner,environment,completionClass='public-api-ack',codeIdentity=USEFUL_WORK_CODE_IDENTITY},{crypto=globalThis.crypto}={}){
 owner=structuredClone(owner);environment=operationEnvironment(environment,completionClass);
 if(!task||!text(task.operation)||!text(method)||!source||source.identityVerified===false||!SHA.test(source.sha256)||!Number.isSafeInteger(source.width)||source.width<1||!Number.isSafeInteger(source.height)||source.height<1||owner?.operation!==task.operation||owner.method!==method||owner.codeSha256!==codeIdentity.sha256||codeIdentity.schema!=='sherloq.useful-work-code/1'||!SHA.test(codeIdentity.sha256)||!text(owner.precision)||!text(owner.profile)||!text(owner.runtime)||!Number.isInteger(owner.threads)||owner.threads<1||owner.threads>1024||!Number.isSafeInteger(owner.budgetBytes)||owner.budgetBytes<1)throw Error('Owned identity incomplete');
 const validated=parameters(usefulScientificParameters(task.operation,owner.parameters)),requested=parameters(usefulScientificParameters(task.operation,task.params??{}));for(const[k,v]of Object.entries(requested))if(!Object.hasOwn(validated,k)||!same(v,validated[k]))throw Error('Validated parameters differ');
 if(!Array.isArray(owner.modelShas)||owner.modelShas.length>128||!owner.modelShas.every(x=>SHA.test(x))||(task.operation==='various.ocr'||owner.requiresModels===true)&&!owner.modelShas.length)throw Error('Model identity incomplete');
 const inputs=owner.inputContract==='single-original'?[source.sha256]:owner.inputContract==='ordered-original-and-references'?owner.sourceShas:null;if(!Array.isArray(inputs)||inputs[0]!==source.sha256||inputs.length>64||inputs.some(x=>!SHA.test(x)))throw Error('Ordered input identity incomplete');
 const domain=task.sourceRegionDomain;if(domain&&(!SHA.test(domain.fingerprint)||domain.snapshot?.sourceSha256!==source.sha256))throw Error('Domain identity differs');
 const domainSha=domain?.fingerprint??await adaptiveIdentity({contract:'Original-whole-frame-v1',sourceSha256:source.sha256,width:source.width,height:source.height},{crypto}),implementation=await adaptiveIdentity({contract:'owned-useful-operation-v1',operation:task.operation,method,code:codeIdentity.sha256,precision:owner.precision,modelShas:owner.modelShas},{crypto});
 const context={environment:await adaptiveIdentity({schema:'passive-environment/1',...environment},{crypto}),runtime:owner.runtime,implementation,precision:owner.precision,profile:owner.profile,threads:owner.threads,resources:await adaptiveIdentity({schema:'owned-useful-resources/1',budgetBytes:owner.budgetBytes,resourceContext:owner.resourceContext??null},{crypto})};
 const analysis=await analysisComparisonIdentity({sources:inputs,domainSha256:domainSha,operation:task.operation,method,parameters:validated,modelShas:owner.modelShas,codeShas:[codeIdentity.sha256],precision:owner.precision,profile:context.profile,threads:context.threads},{crypto});return{analysis,algorithm:task.operation+'/'+method,context,work:await usefulOperationWork({owner,task,source,parameters:validated,crypto})};
}

// One observer, the existing shared store, and the SAME requested Promise.
// The owner supplies an attestation; requested GPU is never evidence of GPU.
// Missing before-owner state keeps historical routing. It can still journal
// truthful completed evidence afterwards with an unknown phase and a weak prior.
export function createUsefulOperationRuntime({store,clock=()=>performance.now(),crypto=globalThis.crypto,codeIdentity=USEFUL_WORK_CODE_IDENTITY,environment=()=>({userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,gpuApi:!!navigator.gpu,crossOriginIsolated:globalThis.crossOriginIsolated===true})}={}){
 return{
  prepare(task,source,{method='default',signal,startedAt,isCurrent=()=>true,expectedIdentity,completionClass='public-api-ack'}={}){
   const started=Number.isFinite(startedAt)?startedAt:clock();let request,original,env,pending;
   try{if(!task||!text(task.operation)||!text(method)||!modes.has(task.backend??'auto')||!source||source.identityVerified===false||!SHA.test(source.sha256)||!Number.isSafeInteger(source.width)||source.width<1||!Number.isSafeInteger(source.height)||source.height<1)throw Error();request={id:task.id,operation:task.operation,method,requested:task.backend??'auto',completionClass,parameters:parameters(usefulScientificParameters(task.operation,task.params??{})),domain:structuredClone(task.sourceRegionDomain??null)};original={...source};if(request.domain&&(!SHA.test(request.domain.fingerprint)||request.domain.snapshot?.sourceSha256!==source.sha256))throw Error();env=operationEnvironment(environment(),completionClass);if(!env||typeof env.userAgent!=='string'||!env.userAgent||typeof env.gpuApi!=='boolean'||typeof env.crossOriginIsolated!=='boolean'||!Number.isInteger(env.hardwareConcurrency)||env.hardwareConcurrency<1)throw Error();}catch{return{task,decision:{routed:false,adaptive:false,basis:'useful-input-identity-incomplete',historicalFallback:true},complete:async()=>decline('useful-input-identity-incomplete')};}
   return{task,decision:{routed:false,adaptive:false,basis:'historical-fallback-without-before-owner',historicalFallback:true},
    complete(completion){if(pending)return pending;pending=(async()=>{
     if(!completion||typeof completion.then!=='function')return decline('actual-request-completion-required');let result;try{result=await completion;}catch{return decline('requested-operation-failed');}const ended=clock();if(signal?.aborted||isCurrent()!==true)return decline('cancelled-or-owner-changed');if(!result||result.status!=='ok'||result.operation!==request.operation||result.id!==undefined&&result.id!==request.id||result.metrics?.retainedCleanup?.pending===true)return decline('incomplete-or-unacknowledged-result');
     if(sourceSha(result)!==original.sha256)return decline('completed-source-differs');const seenScope=scope(result);if(request.domain?seenScope?.fingerprint!==request.domain.fingerprint:seenScope!=null)return decline('completed-domain-differs');if(result.sourceRegionDomain&&result.sourceRegionDomain.fingerprint!==seenScope?.fingerprint)return decline('conflicting-result-domains');
     const active=result.metrics?.usefulWork;if(active?.schema!=='sherloq.useful-operation/1'||active.completedAfterAck!==true||active.numericAdmissible!==true||active.operation!==request.operation||active.method!==request.method)return decline('missing-owned-evidence');const cache=active.cache;if(!['miss','hit','partial'].includes(cache))return decline('unknown-cache-origin');const e=cache==='hit'?active.origin:active;
     if(e?.schema!=='sherloq.useful-operation/1'||e.completedAfterAck!==true||e.numericAdmissible!==true||e.operation!==request.operation||e.method!==request.method||e.codeSha256!==codeIdentity.sha256||active.codeSha256!==codeIdentity.sha256||codeIdentity.schema!=='sherloq.useful-work-code/1'||!SHA.test(codeIdentity.sha256))return decline('producer-code-or-origin-differs');
     if(!['cpu','webgpu','hybrid'].includes(e.actualBackend)||!['cold','warm','unknown'].includes(active.regime)||!text(e.precision)||!text(active.profile)||!text(active.runtime)||!Number.isInteger(active.threads)||active.threads<1||active.threads>1024||!Number.isSafeInteger(active.budgetBytes)||active.budgetBytes<1)return decline('producer-context-incomplete');
     if(cache==='miss'&&e.actualBackend==='hybrid'&&!(e.actualGpuWork===true&&e.actualCpuWork===true)||cache==='miss'&&e.actualBackend==='webgpu'&&e.actualGpuWork!==true)return decline('no-actual-gpu-core-work');
     if(!Array.isArray(e.modelShas)||e.modelShas.length>128||!e.modelShas.every(x=>SHA.test(x))||(request.operation==='various.ocr'||e.requiresModels===true)&&!e.modelShas.length)return decline('model-identity-incomplete');
     let validated;try{validated=parameters(usefulScientificParameters(request.operation,e.parameters));for(const[k,v]of Object.entries(request.parameters))if(!Object.hasOwn(validated,k)||!same(parameters(v),validated[k]))return decline('completed-parameters-differ');}catch{return decline('validated-parameters-incomplete');}
     const inputs=e.inputContract==='single-original'?[original.sha256]:e.inputContract==='ordered-original-and-references'?e.sourceShas:null;if(!inputs||inputs[0]!==original.sha256||inputs.length>64||inputs.some(x=>!SHA.test(x)))return decline('ordered-input-identity-incomplete');
     try{
      const {analysis,context,work}=await usefulOperationIdentity({task:{id:request.id,operation:request.operation,params:request.parameters,sourceRegionDomain:request.domain},source:original,method:request.method,owner:{...e,profile:active.profile,threads:active.threads,runtime:active.runtime,budgetBytes:active.budgetBytes,resourceContext:active.resourceContext},environment:env,completionClass:request.completionClass,codeIdentity},{crypto});
      if(expectedIdentity?.value&&(expectedIdentity.value.analysis!==analysis||!same(expectedIdentity.value.context,context)||expectedIdentity.value.regime!=='unknown'&&expectedIdentity.value.regime!==active.regime))return decline('completed-before-owner-differs');
      // Cancellation/currentness was captured at the actual ACK above. A later
      // image change cannot retroactively cancel completed useful work.
      if(!Number.isFinite(ended)||ended<started)return decline('invalid-useful-clock');
      return store.observe({observation:'completed-useful-operation',actualBackendAttested:true,analysis,algorithm:request.operation+'/'+request.method,requested:request.requested,backend:e.actualBackend,context,regime:active.regime,cache,work,cost:{totalMs:ended-started,preparationMs:0,computeMs:0,transferMs:0,ackMs:0,otherMs:ended-started},numericAdmissible:true,actualGpuWork:cache==='miss'&&e.actualGpuWork===true,actualCpuWork:cache==='miss'&&e.actualCpuWork===true,completedAfterAck:true});
     }catch{return decline('optional-observation-declined');}
    })();return pending;}
   };
  },
  async prepareWithOwner(task,source,{owner,...options}={}){
   const binding={value:null},observer=this.prepare(task,source,{...options,expectedIdentity:binding});if(!owner)return observer;
   try{
    if(owner.schema!=='sherloq.useful-operation-owner/1'||!['cold','warm','unknown'].includes(owner.regime)||!['cpu','webgpu'].every(k=>typeof owner.admission?.[k]==='boolean'&&typeof owner.numericAdmissible?.[k]==='boolean'))return observer;
    const method=options.method??'default';
    if(owner.operation!==task.operation||owner.method!==method)return observer;
    const admission=Object.fromEntries(['cpu','webgpu'].map(k=>[k,owner.admission[k]===true&&owner.numericAdmissible[k]===true]));
    // Admission and human preferences do not depend on optional telemetry hashes.
    // Keep their decision even when a full performance identity is unavailable.
    let manual=task.backend??'auto';if(manual==='auto')try{manual=store.mode(backendScope(usefulOperationMethod(task.operation,task.params).tool,method));}catch{manual='auto';}
    if(manual!=='auto'){
     const allowed=admission[manual]===true,decision={requested:manual,backend:allowed?manual:null,basis:(task.backend??'auto')==='auto'?(allowed?'human-preference':'human-preference-not-admitted'):(allowed?'explicit-task':'explicit-task-not-admitted'),adaptive:false,blocked:!allowed,routed:allowed&&(task.backend??'auto')==='auto',historicalFallback:false};
     observer.task=decision.routed?{...task,backend:manual}:task;observer.decision=decision;
     if(!allowed)return observer;
    }else if(!admission.cpu&&!admission.webgpu)return{...observer,decision:{requested:'auto',backend:null,basis:'no-admitted-backend',adaptive:false,blocked:true,routed:false,historicalFallback:false}};
    if(owner.performanceIdentityComplete===false)throw Error('Required useful input identity is not configured yet');
    const identity=await usefulOperationIdentity({task,source,method,owner,environment:structuredClone(environment()),completionClass:options.completionClass??'public-api-ack',codeIdentity},{crypto});if(options.signal?.aborted)return observer;
    let decision;
    if((task.backend??'auto')==='auto')decision=store.recommend({scope:backendScope(usefulOperationMethod(task.operation,task.params).tool,method),...identity,regime:owner.regime,admission});else{const backend=task.backend;decision={requested:backend,backend:admission[backend]?backend:null,basis:admission[backend]?'explicit-task':'explicit-task-not-admitted',adaptive:false};}
    if(decision.requested==='auto'&&decision.backend===null&&['cpu','webgpu'].includes(owner.historicalBackend)&&admission[owner.historicalBackend])decision={...decision,backend:owner.historicalBackend,basis:'owner-qualified-historical-fallback',adaptive:false,historicalFallback:true};
    binding.value={...identity,regime:owner.regime};const blocked=decision.backend===null&&(decision.requested!=='auto'||!admission.cpu&&!admission.webgpu),routed=(task.backend??'auto')==='auto'&&decision.backend!==null,next=routed?{...task,backend:decision.backend}:task;
    return{...observer,task:next,decision:{...decision,blocked,routed,historicalFallback:decision.historicalFallback===true||decision.backend===null&&!blocked}};
   }catch{
    // A required model/reference may be loaded by the real operation later.
    // Missing performance identity does not erase admission or human choice,
    // and must not leave a legacy per-page exploration in control of Auto.
    if(observer.decision?.blocked||observer.decision?.routed||(task.backend??'auto')!=='auto')return observer;
    let preferred='auto';try{preferred=store.mode(backendScope(usefulOperationMethod(task.operation,task.params).tool,options.method??'default'));}catch{}
    const candidate=preferred!=='auto'?preferred:owner?.historicalBackend;
    if(['cpu','webgpu'].includes(candidate)&&owner?.admission?.[candidate]===true&&owner?.numericAdmissible?.[candidate]===true)return{...observer,task:{...task,backend:candidate},decision:{requested:preferred,backend:candidate,basis:preferred==='auto'?'owner-fallback-incomplete-performance-identity':'human-preference',adaptive:false,blocked:false,routed:true,historicalFallback:preferred==='auto'}};
    return observer;
   }
  },
 };
}
