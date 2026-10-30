import "../../runtime-context.js?v=0.30.0";
import {StrictDenseCopyEngine} from './dense-strict-copy.js';
import {createCompiledStrictDenseSource} from './dense-strict-source.js';
import {requireValue,checkAbort} from './errors.js';
import {retireForgeryscopeOwners} from './forgeryscope-source-analyzer.js';

/** Same native Dense passes and geometry as automatic clone search. A compiled
 * source separates permissible RGB context from source/target candidates. The
 * active view is borrowed only during a request; retained fields own no reader
 * or request AbortSignal. No operation admission is changed by this owner. */
export function createAutomaticPreparedDense(image,budget,{geometry,profile,getContext}={}){
 requireValue(image?.surface?.descriptor&&typeof getContext==='function','Prepared automatic Dense requires its source and verified context getter.');
 const compiledOwners=new Set(),captureCompiled=owner=>compiledOwners.add(owner),dropCompiled=async owner=>{if(!owner)return;await owner.dispose();compiledOwners.delete(owner);};
 let activeSource,active=false,closed=false,finished=Promise.resolve();const lifetime=new AbortController(),engine=new StrictDenseCopyEngine(image,budget,{geometry,profile,getSource:()=>activeSource});
 return{
  clearCheckpoint:key=>engine.clearCheckpoint(key),
  async analyze(params,hooks={}){
   requireValue(!closed&&!active,'Prepared automatic Dense is busy or disposed.');checkAbort(hooks.signal);active=true;let finish,source,result,returned=false,failed=false,failure;finished=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;
   try{
    await retireForgeryscopeOwners([...compiledOwners].map(owner=>()=>dropCompiled(owner)));checkAbort(signal);
    const prepared=await getContext({...hooks,signal});checkAbort(signal);const d=image.surface.descriptor;
    requireValue(prepared?.width===d.width&&prepared.height===d.height&&prepared.sourceDomain?.sourceSha256===image.sha256&&prepared.origin[0]===(image.sourceRegionOrigin?.[0]??0)&&prepared.origin[1]===(image.sourceRegionOrigin?.[1]??0),'Prepared Dense context differs from its source grid.');
    source=await createCompiledStrictDenseSource(prepared,{excluded:params.excluded??[],budget,signal,original:image.originalSource??image,onOwner:captureCompiled});checkAbort(signal);activeSource=source.source;
    result=await engine.analyze(params,{...hooks,signal});checkAbort(signal);
    result.strictAutomaticContext={fingerprint:prepared.fingerprint,candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,origin:[...prepared.origin],excludedParticipation:'true negatives absent before descriptors, texture, highpass and NCC; acquisition gaps may remain as declared envelope context'};
    await dropCompiled(source);source=null;activeSource=null;checkAbort(signal);
    returned=true;return result;
   }catch(error){failed=true;failure=error;throw error;}finally{activeSource=null;try{await retireForgeryscopeOwners([()=>!returned?result?.release():undefined,()=>dropCompiled(source)],failed?{primary:failure}:{});}finally{active=false;finish();}}
  },
  async dispose(){closed=true;lifetime.abort();await retireForgeryscopeOwners([()=>engine.dispose(),()=>finished,...[...compiledOwners].map(owner=>()=>dropCompiled(owner))]);}
 };
}
