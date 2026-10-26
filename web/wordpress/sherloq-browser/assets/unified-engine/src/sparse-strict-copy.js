import "../../runtime-context.js?v=0.25.0";
import {SparseCopyEngine} from './sparse-copy.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createStrictSsgCopyEngine} from './ssg-strict-copy.js';
import {rgbRowSource} from './rgb-row-source.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {createStrictSparseNativeFeatures} from './sparse-strict-native-features.js';
import {prepareSparseStrictNativeContext,sparseStrictImageRecord} from './sparse-strict-source.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
export const STRICT_SPARSE_CLASSICAL_ALGORITHMS=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB','SIFT + G2NN + RANSAC']);
const CLASSIC='SIFT + G2NN + RANSAC',PANELS=CLASSIC+' + Panels + Text';
const identity=r=>JSON.stringify([r.sha256,r.sourceRegionDomain?.fingerprint??null,r.surface.descriptor.width,r.surface.descriptor.height,r.sourceRegionOrigin??[0,0]]);
const rows=r=>r.pixels??({format:'rgb8',...rgbRowSource(r.surface),temporarySession:r.session,getTemporarySession:r.ensureTemporarySession});
/** Only feature production changes under a strict context. The actual sparse
 * cache, normalization, matching, G2NN, biome grouping and geometry remain in
 * SparseCopyEngine; they receive one correctly projected global feature bank. */
export function createStrictSparseCopyEngine(initialRecord,budget,profile,{nativeFactory}={}){
 let record=sparseStrictImageRecord(initialRecord,budget),key=identity(record),context=null,active=false,closed=false,finished=Promise.resolve(),disposal;const preparedOwners=new Set(),unreturnedOwners=new Set();const engine=new SparseCopyEngine(rows(record),budget,profile),ordinary=engine.features,native=createStrictSparseNativeFeatures({budget,profile,...(nativeFactory?{nativeFactory}:{})});
 const strictSsg=createStrictSsgCopyEngine(record,budget,profile);
 const releaseUnreturned=()=>retireCompositeOwners([...unreturnedOwners].map(result=>async()=>{await result.release();unreturnedOwners.delete(result);}));
 const releasePrepared=async()=>{if(unreturnedOwners.size)return;await native.retirePending();await retireCompositeOwners([...preparedOwners].map(prepared=>async()=>{await prepared.release();preparedOwners.delete(prepared);}));};
 const retryOwners=()=>retireCompositeOwners([releaseUnreturned,releasePrepared]);
 engine.features={
  extract(image,options){if(!context)return ordinary.extract(image,options);const shift=polys=>polys.map(poly=>poly.map(([x,y])=>[x+context.origin[0],y+context.origin[1]]));return native.extract(context,{...options,regions:shift(options.regions),excluded:shift(options.excluded)});},
  clearCheckpoint:key=>ordinary.clearCheckpoint(key),
  async dispose(){const settled=await Promise.allSettled([native.dispose(),ordinary.dispose()]);const bad=settled.find(v=>v.status==='rejected');if(bad)throw bad.reason;}
 };
 return{
  get image(){return record;},set image(value){if(value===null){requireValue(!active,'Cannot detach an active Sparse reader.');record=null;engine.image=null;strictSsg.image=null;return;}value=sparseStrictImageRecord(value,budget);requireValue(!active&&identity(value)===key,'The strict sparse engine cannot reuse another source owner or domain.');record=value;engine.image=rows(value);strictSsg.image=value;},
  clearCheckpoint:key=>engine.clearCheckpoint(key),
  async localizeRetained(input={},hooks={}){
   if(closed||active||!record||input.algorithm!=='SSG')return null;
   checkAbort(hooks.signal);active=true;let finish;finished=new Promise(resolve=>finish=resolve);const signal=hooks.signal?AbortSignal.any([hooks.signal,engine.lifetime.signal]):engine.lifetime.signal;
   try{if(preparedOwners.size||unreturnedOwners.size){await retryOwners();checkAbort(signal);}return await(record.sourceRegionDomain||input.excluded?.length||hooks.scientificScope?strictSsg:engine).localizeRetained(input,{...hooks,signal});}finally{active=false;finish();}
  },
  async analyze(input={},hooks={}){
   requireValue(!closed&&!active&&record,'Strict sparse analysis is busy, detached or disposed.');checkAbort(hooks.signal);active=true;let finish;finished=new Promise(resolve=>finish=resolve);let prepared,result,returned=false,failed=false,primary;const signal=hooks.signal?AbortSignal.any([hooks.signal,engine.lifetime.signal]):engine.lifetime.signal;
   try{
    if(preparedOwners.size||unreturnedOwners.size){await retryOwners();checkAbort(signal);}
    if(input.algorithm==='SSG'&&(record.sourceRegionDomain||input.excluded?.length||hooks.scientificScope)){result=await strictSsg.analyze(input,{...hooks,signal});checkAbort(signal);returned=true;return result;}
    if(!record.sourceRegionDomain&&!input.excluded?.length&&!hooks.scientificScope?.excluded?.length){result=await engine.analyze(input,{...hooks,signal});checkAbort(signal);returned=true;return result;}
    const task={...(hooks.sourceRegionTask??{operation:'tampering.copyMove.sparse'}),params:input,...(hooks.scientificScope?{scientificScope:hooks.scientificScope}:{})};
    if(record.sourceRegionDomain?.origin?.some(v=>v!==0)&&!hooks.sourceRegionTask)throw new EngineError('SOURCE_REGIONS_INVALID','A localized sparse source needs its actual task localization receipt.');
    prepared=await prepareSparseStrictNativeContext(record,task,{budget,signal});preparedOwners.add(prepared);checkAbort(signal);
    const shape=sourceRegionDomainShape(prepared.sourceDomain),requiresStrict=prepared.contextRequired||shape==='membership',algorithm=input.algorithm??CLASSIC;
    if(requiresStrict){if(!STRICT_SPARSE_CLASSICAL_ALGORITHMS.includes(algorithm))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','This sparse variant needs its own qualified upstream strict-context adapter.',{details:{algorithm,strictSourceRegions:true,featureInput:'excluded RGB must be absent before model/descriptor input',qualifiedClassical:[...STRICT_SPARSE_CLASSICAL_ALGORITHMS]}});context=prepared;}
    result=await engine.analyze(input,{...hooks,signal,sourceContextFingerprint:prepared.fingerprint});checkAbort(signal);
    if(context)result.metadata={...result.metadata,strictSourceRegions:{fingerprint:prepared.fingerprint,candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,sourceSha256:prepared.sourceDomain.sourceSha256,coordinates:'source-region-native',origin:[...prepared.origin],excludedParticipation:'absent before native feature/descriptor input; only admitted features enter the unchanged global matcher'}};
    returned=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{
    if(!returned&&result)unreturnedOwners.add(result);
    try{if(preparedOwners.size||unreturnedOwners.size)await retireCompositeOwners([releaseUnreturned,releasePrepared],failed?{primary}:{});}
    catch(error){if(returned&&result){unreturnedOwners.add(result);await retireCompositeOwners([releaseUnreturned],{primary:error});}throw error;}
    finally{context=null;active=false;finish();}
   }
  },
  dispose(){closed=true;engine.lifetime.abort();if(disposal)return disposal;const task=(async()=>{const settled=await Promise.allSettled([engine.dispose(),strictSsg.dispose()]);await finished;await retireCompositeOwners([...settled.map(value=>()=>{if(value.status==='rejected')throw value.reason;}),releaseUnreturned,releasePrepared]);})().finally(()=>{disposal=undefined;});disposal=task;return task;},
  get counts(){return{...engine.counts};}
 };
}
