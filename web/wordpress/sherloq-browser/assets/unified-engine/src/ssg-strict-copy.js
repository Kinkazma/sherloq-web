import "../../runtime-context.js?v=0.25.0";
import {sparseStrictImageRecord,prepareSparseStrictNativeContext} from './sparse-strict-source.js';
import {createSsgStrictCompiledView} from './ssg-strict-compiled-view.js';
import {createSsgStrictEngine} from './ssg-strict-engine.js';
import {requireValue,checkAbort,EngineError} from './errors.js';

async function retire(actions,primary,failed=false){const errors=[];for(const action of actions)try{await action();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgWrapperCleanupErrors=errors;}else throw new AggregateError(errors,'SSG native source retirement failed.');}}
/** Additive public-engine owner. It does not replace an ordinary sparse engine
 * or publish capability changes. A caller may delegate ONLY algorithm SSG to
 * it after the source-region hook has been explicitly composed and qualified. */
export function createStrictSsgCopyEngine(initialRecord,budget,profile,options={}){
 const sourceOwners=new WeakMap();let nextSourceOwner=0;
 const binding=value=>{const original=value.originalSource??value,surface=original.surface,d=surface.descriptor;let token=sourceOwners.get(surface);if(!token){token=++nextSourceOwner;sourceOwners.set(surface,token);}return JSON.stringify([value.sha256,token,d.id??null,d.revision??null,d.width,d.height,value.sourceRegionDomain?.fingerprint??null,value.sourceRegionOrigin??[0,0]]);};
 let record=sparseStrictImageRecord(initialRecord,budget),sourceBinding=binding(record),active=false,closed=false,done=Promise.resolve(),holder=null,revision=0;const lifetime=new AbortController(),pending=new Set();
 const release=async value=>{if(!value)return;pending.add(value);await retire([()=>value.engine.dispose(),()=>value.view.dispose()]);pending.delete(value);};
 return{
  get image(){return record;},set image(value){requireValue(!active,'Cannot replace an active SSG Original owner.');if(value===null){record=null;return;}value=sparseStrictImageRecord(value,budget);requireValue(!record||value.sha256===record.sha256,'SSG cannot reuse a different Original source.');const nextBinding=binding(value);if(nextBinding!==sourceBinding)revision++;sourceBinding=nextBinding;record=value;},
  clearCheckpoint(){return holder?.engine.clearCheckpoint()??0;},
  async localizeRetained(input={},hooks={}){
   if(closed||active||!record||!holder||input.algorithm!=='SSG')return null;
   checkAbort(hooks.signal);active=true;let finish;done=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;let prepared,result,returned=false,primary,failed=false;
   try{
    if(record.sourceRegionDomain?.origin?.some(v=>v!==0)&&!hooks.sourceRegionTask)return null;
    const task={...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:input,...(hooks.scientificScope?{scientificScope:hooks.scientificScope}:{})};prepared=await prepareSparseStrictNativeContext(record,task,{budget,signal});checkAbort(signal);
    if(holder.key!==revision+'/'+prepared.fingerprint)return null;
    result=await holder.engine.localizeRetained(input,{...hooks,signal});checkAbort(signal);if(result&&!hooks.preview)result.metadata={...result.metadata,strictNativeContext:{fingerprint:prepared.fingerprint,sourceFingerprint:prepared.sourceDomain.fingerprint,candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,origin:[...prepared.origin],rgbContext:'true negatives removed before all native input; certified acquisition gaps may remain as envelope context'}};returned=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{try{await retire([()=>!returned&&result?.release(),()=>prepared?.release()],primary,failed);}finally{active=false;finish();}}
  },
  async analyze(input={},hooks={}){
   requireValue(!closed&&!active&&record&&input.algorithm==='SSG','Native strict SSG requires its actual source and method.');checkAbort(hooks.signal);active=true;let finish;done=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;let prepared,next,result,returned=false,primary,failed=false;
   try{
    if(record.sourceRegionDomain?.origin?.some(v=>v!==0)&&!hooks.sourceRegionTask)throw new EngineError('SOURCE_REGIONS_INVALID','Localized SSG requires its actual source task localization receipt.');
    const task={...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:input,...(hooks.scientificScope?{scientificScope:hooks.scientificScope}:{})};prepared=await prepareSparseStrictNativeContext(record,task,{budget,signal});checkAbort(signal);const key=revision+'/'+prepared.fingerprint;let current=holder;
    if(!current||current.key!==key){
     // The retained reader is tied only to its owner lifetime. Request signals
     // remain per-analysis; aborting a successful request cannot poison cache.
     const view=await createSsgStrictCompiledView(prepared,{budget,signal:lifetime.signal});try{checkAbort(signal);next={key,view,engine:createSsgStrictEngine(view.view,budget,profile,{...options,candidateDomain:view.candidateDomain})};current=next;}catch(error){await retire([()=>view.dispose()],error,true);throw error;}
    }
    result=await current.engine.analyze(input,{...hooks,signal});checkAbort(signal);result.metadata={...result.metadata,strictNativeContext:{fingerprint:prepared.fingerprint,sourceFingerprint:prepared.sourceDomain.fingerprint,candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,origin:[...prepared.origin],rgbContext:'true negatives removed before all native input; certified acquisition gaps may remain as envelope context'}};
    if(next){const old=holder;holder=next;next=null;await release(old);}returned=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{try{await retire([()=>!returned&&result?.release(),()=>release(next),()=>prepared?.release()],primary,failed);}finally{active=false;finish();}}
  },
  async dispose(){closed=true;lifetime.abort();await done;const old=holder;holder=null;await retire([...new Set([old,...pending])].filter(Boolean).map(value=>()=>release(value)));},
 };
}
