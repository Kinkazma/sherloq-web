import "../../runtime-context.js?v=0.25.0";
import {SparseCopyEngine} from './sparse-copy.js';
import {rgbRowSource} from './rgb-row-source.js';
import {sparseStrictImageRecord,prepareSparseStrictNativeContext} from './sparse-strict-source.js';
import {createCompiledStrictDenseSource} from './dense-strict-source.js';
import {extractXfeatStrictNative} from './xfeat-strict-native-features.js';
import {requireValue,checkAbort,EngineError} from './errors.js';

export const STRICT_XFEAT_ALGORITHMS=Object.freeze(['XFeat','XFeat + LighterGlue']);
const rows=r=>r.pixels??{format:'rgb8',...rgbRowSource(r.surface),temporarySession:r.session,getTemporarySession:r.ensureTemporarySession};
async function retire(actions,primary,failed=false){const errors=[];for(const action of actions)try{await action();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.xfeatOwnerCleanupErrors=errors;}else throw new AggregateError(errors,'Native XFeat source owner retirement failed.');}}

/** The XFeat encoder is shared by the plain and LighterGlue variants. Strict
 * contexts change feature production only; the actual global matcher/attention,
 * private SIMD distances, biome
 * grouping, native geometry and self-copy rejection remain SparseCopyEngine.
 * Temporary readers never survive a request. A detach/rebind cannot invalidate
 * its independently owned cached descriptors merely by setting image=null. */
export function createStrictXfeatCopyEngine(initialRecord,budget,profile,options={}){
 const sourceOwners=new WeakMap();let nextSourceOwner=0;
 const identity=r=>{const original=r.originalSource??r,source=original.pixels??original.surface,d=original.surface.descriptor;let token=sourceOwners.get(source);if(!token){token=++nextSourceOwner;sourceOwners.set(source,token);}return JSON.stringify([r.sha256,token,d.id??null,d.revision??null,d.width,d.height,r.sourceRegionDomain?.fingerprint??null,r.surface.descriptor.width,r.surface.descriptor.height,r.sourceRegionOrigin??[0,0]]);};
 const factories=Object.fromEntries(['poolFactory','postFactory','preparationFactory','maskFactory','storage'].filter(key=>options[key]!==undefined).map(key=>[key,options[key]]));
 const derivedOwners=new Set(),captureDerived=owner=>derivedOwners.add(owner),dropDerived=async owner=>{if(!owner)return;await owner.dispose();derivedOwners.delete(owner);};
 const compiledOwners=new Set(),captureCompiled=owner=>compiledOwners.add(owner),dropCompiled=async owner=>{if(!owner)return;await owner.dispose();compiledOwners.delete(owner);};
 let record=sparseStrictImageRecord(initialRecord,budget),binding=identity(record),context,active=false,closed=false,done=Promise.resolve(),featureController;
 const engine=new SparseCopyEngine(rows(record),budget,profile),ordinary=engine.learned;
 engine.learned={
  async extract(image,settings){
   if(!context)return ordinary.extract(image,settings);requireValue(settings.family==='XFeat','This strict owner requires the native XFeat encoder.');const controller=new AbortController();featureController=controller;const signal=settings.signal?AbortSignal.any([settings.signal,controller.signal]):controller.signal;let compiled,derived,result,returned=false,primary,failed=false;
   try{compiled=await createCompiledStrictDenseSource(context,{excluded:settings.excluded,budget,signal,original:record.originalSource??record,onOwner:captureCompiled});checkAbort(signal);result=await extractXfeatStrictNative(compiled.source,{...settings,...factories,budget,profile,signal,candidateDomain:context.candidateDomain,onOwner:owner=>{derived=owner;captureDerived(owner);}});checkAbort(signal);await dropDerived(derived);derived=null;await dropCompiled(compiled);compiled=null;checkAbort(signal);returned=true;return result;}
   catch(error){failed=true;primary=error;throw error;}finally{try{await retire([()=>!returned&&result?.release(),()=>dropDerived(derived),()=>dropCompiled(compiled)],primary,failed);}finally{featureController=null;}}
  },
  dispose(){featureController?.abort();ordinary.dispose();}
 };
 return{
  get image(){return record;},set image(value){requireValue(!active,'Cannot rebind an active XFeat source.');if(value===null){record=null;engine.image=null;return;}value=sparseStrictImageRecord(value,budget);requireValue(identity(value)===binding,'XFeat source ownership, native grid or scope changed.');record=value;engine.image=rows(value);},
  get counts(){return{...engine.counts};},
  clearCheckpoint:key=>engine.clearCheckpoint(key),
  async analyze(input={},hooks={}){
   requireValue(!closed&&!active&&record&&STRICT_XFEAT_ALGORITHMS.includes(input.algorithm),'The strict learned adapter supports XFeat and XFeat + LighterGlue only.');checkAbort(hooks.signal);active=true;let finish;done=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,engine.lifetime.signal]):engine.lifetime.signal;let prepared,result,returned=false,primary,failed=false;
   try{
    await retire([...derivedOwners].map(owner=>()=>dropDerived(owner)));checkAbort(signal);
    await retire([...compiledOwners].map(owner=>()=>dropCompiled(owner)));checkAbort(signal);
    if(record.sourceRegionDomain?.origin?.some(v=>v!==0)&&!hooks.sourceRegionTask)throw new EngineError('SOURCE_REGIONS_INVALID','Localized XFeat needs its verified native task localization receipt.');
    prepared=await prepareSparseStrictNativeContext(record,{...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:input,...(hooks.scientificScope?{scientificScope:hooks.scientificScope}:{})},{budget,signal});checkAbort(signal);context=prepared;
    result=await engine.analyze(input,{...hooks,signal,sourceContextFingerprint:prepared.fingerprint});checkAbort(signal);result.metadata={...result.metadata,strictNativeXfeatContext:{fingerprint:prepared.fingerprint,candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,sourceSha256:prepared.sourceDomain.sourceSha256,origin:[...prepared.origin],rgbContext:'native admitted contexts; true negatives omitted before bilinear/InstanceNorm/CNN; certified gaps may remain envelope context',oneGlobalMatcher:true,algorithm:input.algorithm,learnedAssignment:input.algorithm==='XFeat + LighterGlue',matching:'unchanged global SparseCopyEngine; full native candidate-edge attention for LighterGlue'}};returned=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{context=null;try{await retire([()=>!returned&&result?.release(),()=>prepared?.release()],primary,failed);}finally{active=false;finish();}}
  },
  async dispose(){closed=true;engine.lifetime.abort();featureController?.abort();await retire([()=>engine.dispose(),()=>done,...[...derivedOwners].map(owner=>()=>dropDerived(owner)),...[...compiledOwners].map(owner=>()=>dropCompiled(owner))]);}
 };
}
