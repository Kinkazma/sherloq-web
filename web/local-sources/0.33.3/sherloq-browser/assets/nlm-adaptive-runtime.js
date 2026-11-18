import {adaptiveIdentity,analysisComparisonIdentity,backendScope} from './unified-engine/src/adaptive-runtime.js';
import {beginUsefulWorkObservation} from './unified-engine/src/useful-work-observer.js';

const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const modes=new Set(['auto','cpu','webgpu']);
const parameters=raw=>{
 if(!raw||raw.mode!==4||!Number.isInteger(raw.radius)||raw.radius<1||raw.radius>10||!Number.isInteger(raw.sigma)||raw.sigma<1||raw.sigma>200||typeof raw.grayscale!=='boolean'||typeof raw.denoised!=='boolean'||!Number.isInteger(raw.levels)||raw.levels<0||raw.levels>255)throw new TypeError('Complete validated Native NLM parameters required');
 return Object.fromEntries(['mode','radius','sigma','grayscale','denoised','levels'].map(key=>[key,raw[key]]));
};
const cached=result=>{
 const m=result?.metrics??{};
 if(m.cache?.result===true||m.analysisCacheHit===true||m.filterCacheHit===true||m.cache?.analysis===true)return'hit';
 return Object.values(m.cache?.stages??{}).some(v=>v===true)?'partial':'miss';
};
const actualBackend=(result,cache)=>{
 const m=result?.metrics??{},name=m.backend??result?.provenance?.backend;
 if(cache==='hit')return m.filterOriginBackend==='webgpu-native-nlm-acknowledged'?'webgpu':m.filterOriginBackend==='cpu'?'cpu':null;
 if(name==='cpu')return'cpu';
 if(name==='webgpu-native-nlm-acknowledged')return'webgpu';
 if(cache!=='miss'&&name==='cached-native-separation-filter')return m.filterOriginBackend==='webgpu-native-nlm-acknowledged'?'webgpu':m.filterOriginBackend==='cpu'?'cpu':null;
 return null;
};
const declined=reason=>({task:null,decision:{routed:false,adaptive:false,basis:reason,historicalFallback:true},complete:async()=>({recorded:false,reason})});

// This bridge has no history, Worker, adapter, timer or computation of its own.
// The caller supplies the common store and a passive, qualified description.
// complete() receives the SAME Promise returned by the requested engine.run.
export function createNlmAdaptiveRuntime({store,describe,clock=()=>performance.now(),crypto=globalThis.crypto}={}){
 return{
  async prepare(task,source,{signal,startedAt}={}){
   const started=Number.isFinite(startedAt)&&startedAt>=0?startedAt:clock(),requested=task?.backend??'auto';
   const decline=reason=>({...declined(reason),task});
   if(signal?.aborted)return decline('cancelled-before-request');
   if(task?.operation!=='noise.separation'||task.params?.mode!==4)return decline('not-NLM4');
   if(!modes.has(requested)||typeof describe!=='function'||!store?.recommend||!store?.observe)return decline('central-service-or-qualified-description-missing');
   let description,p,sourceSha,domainSha,identity,work,context,admission,domainFingerprint;
   try{
    if(!sha(source?.sha256)||![source.width,source.height].every(v=>Number.isSafeInteger(v)&&v>0))return decline('source-identity-incomplete');
    sourceSha=source.sha256;p=parameters(task.params);
    description=await describe({task,source:{sha256:sourceSha,width:source.width,height:source.height}});
    if(!description||!['cold','warm'].includes(description.regime)||!description.context||typeof description.layout!=='string'||!description.layout||typeof description.shape!=='string'||!description.shape||!Number.isSafeInteger(description.units)||description.units<1)return decline('qualified-context-incomplete');
    if(!Array.isArray(description.codeShas)||!description.codeShas.length||!description.codeShas.every(sha)||typeof description.precision!=='string'||!description.precision)return decline('code-or-precision-incomplete');
    if(!['cpu','webgpu'].every(b=>typeof description.admission?.[b]==='boolean'&&typeof description.numericAdmissible?.[b]==='boolean'))return decline('numeric-or-resource-admission-incomplete');
    admission=Object.fromEntries(['cpu','webgpu'].map(backend=>[backend,description.admission?.[backend]===true&&description.numericAdmissible?.[backend]===true]));
    if(task.sourceRegionDomain){
     const d=task.sourceRegionDomain;
     if(!sha(d.fingerprint)||d.snapshot?.sourceSha256!==sourceSha)return decline('domain-identity-incomplete');
     domainSha=domainFingerprint=d.fingerprint;
    }else domainSha=await adaptiveIdentity({contract:'Original-whole-frame-v1',sourceSha256:sourceSha,width:source.width,height:source.height},{crypto});
    const code=await adaptiveIdentity({contract:'Native-NLM7x7-21x21-RGB8-v1',codeShas:description.codeShas,precision:description.precision},{crypto});
    context={...description.context,implementation:code,precision:description.precision};
    work={category:'native-nlm-rgb8',contract:'Native-NLM7x7-21x21-v1',unit:'centres',layout:description.layout,shape:description.shape,units:description.units,code,coverage:'complete-operation'};
    identity=await analysisComparisonIdentity({sources:[sourceSha],domainSha256:domainSha,operation:task.operation,method:'4',parameters:p,codeShas:description.codeShas,precision:description.precision,profile:context.profile,threads:context.threads},{crypto});
   }catch{return decline('identity-or-qualified-context-invalid');}
   if(signal?.aborted)return decline('cancelled-during-preparation');
   let decision={requested,backend:requested==='auto'?null:requested,basis:requested==='auto'?'historical-fallback-no-central-indication':'explicit-task',adaptive:false};
   if(requested==='auto')try{decision=store.recommend({scope:backendScope(task.operation,'4'),algorithm:'native-NLM4',analysis:identity,context,regime:description.regime,work,admission});}catch{return decline('central-recommendation-declined');}
   const selected=decision.backend;
   if(['cpu','webgpu'].includes(decision.requested)&&selected===null)return{...decline('stored-human-backend-not-admitted'),decision:{...decision,blocked:true,routed:false}};
   if(!admission.cpu&&!admission.webgpu)return{...decline('no-qualified-backend-admitted'),decision:{...decision,blocked:true,routed:false}};
   if(selected!==null&&(!['cpu','webgpu'].includes(selected)||!admission[selected]))return{...decline('requested-backend-not-admitted'),decision:{...decision,blocked:true,routed:false}};
   const routed=requested==='auto'&&selected!==null,nextTask=routed?{...task,backend:selected}:task;
   let firstClock=true,completion;
   const observer=beginUsefulWorkObservation(store,{analysis:identity,algorithm:'native-NLM4',requested,context,regime:description.regime,work},{clock:()=>{if(firstClock){firstClock=false;return started;}return clock();}});
   return{
    task:nextTask,decision:{...decision,routed,historicalFallback:requested==='auto'&&!routed},
    complete(promise){
     if(completion)return completion;
     completion=(async()=>{
      if(!promise||typeof promise.then!=='function')return{recorded:false,reason:'requested-work-completion-required'};
      let result;try{result=await promise;}catch{return observer.finish({completion:promise,failed:true});}
      if(signal?.aborted)return observer.finish({completion:promise,cancelled:true});
      const provenance=result?.provenance??{},seenDescriptor=provenance.sourceRegionDomain??result?.sourceRegionDomain,seenSha=provenance.originalSha256??seenDescriptor?.snapshot?.sourceSha256,seenDomain=seenDescriptor?.fingerprint;
      if(seenSha!==sourceSha||(domainFingerprint?seenDomain!==domainFingerprint:seenDescriptor!=null)||result?.sourceRegionDomain&&result.sourceRegionDomain.fingerprint!==seenDomain)return{recorded:false,reason:'completed-source-or-domain-differs'};
      if(result?.metrics?.retainedCleanup?.pending===true)return{recorded:false,reason:'previous-result-retirement-pending'};
      if(typeof description.verifyResult==='function'&&description.verifyResult(result)!==true)return{recorded:false,reason:'completed-runtime-state-differs'};
      try{if(JSON.stringify(parameters(provenance.params))!==JSON.stringify(p))return{recorded:false,reason:'completed-Native-parameters-differ'};}catch{return{recorded:false,reason:'completed-Native-parameters-missing'};}
      const cache=cached(result),backend=actualBackend(result,cache),g=result?.metrics?.gpu,actualGpuWork=cache!=='hit'&&backend==='webgpu'&&Number.isSafeInteger(g?.calls)&&g.calls>0;
      if(!backend||!admission[backend])return{recorded:false,reason:'completed-backend-not-admitted'};
      if(cache==='miss'&&backend==='webgpu'&&(!actualGpuWork||g.residentGpuBytes!==0||g.nativeHeapBytes!==0||g.pipelineBytes!==0||g.tableBytes!==0))return{recorded:false,reason:'GPU-retirement-or-work-not-acknowledged'};
      return observer.finish({completion:promise,backend,cache,numericAdmissible:true,actualGpuWork});
     })();return completion;
    },
   };
  },
 };
}
