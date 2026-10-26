import {createSsgStrictResult} from './ssg-strict-result.js';
import {createSsgRetainedLocalizer} from './ssg-retained-localization.js';
import {createSsgStrictSource} from './ssg-strict-source.js';
import {createSsgStrictWordBank,matchSsgStrictWords} from './ssg-strict-word-bank.js';
import {createSsgStrictFields} from './ssg-strict-fields.js';
import {ssgStrictSalience,ssgStrictLocalize} from './ssg-strict-localization.js';
import {ssgFastPhrases} from './ssg-full-localization.js';
import {ssgFullParams,ssgInside} from './ssg-full-input.js';
import {ssgFullFilterMatches} from './ssg-full-filter.js';
import {ssgMlesac} from './ssg-full-geometry.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {copyPalette} from './copy-subbiomes.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,EngineError,controlCheckpoint} from './errors.js';

const presentation=new Set(['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius','limit']);
async function retire(actions,primary,failed=false){const errors=[];for(const action of actions)try{await action();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgCleanupErrors=errors;}else throw new AggregateError(errors,'Strict SSG owner retirement failed.');}}

/** Complete native SSG orchestration with an upstream certified context view.
 * The caller must compile ALL true tool/OCR exclusions into this view, using
 * prepareSparseStrictNativeContext. Candidate-only acquisition complements may
 * stay in candidateDomain; they are not made into synthetic RGB observations.
 * No entry point in this module opens the product capability gate. */
export function createSsgStrictEngine(view,budget,profile,{candidateDomain=view?.domain,edgesFactory,vlfeatFactory,moduleFactory}={}){
 requireValue(view?.domain&&candidateDomain?.sourceSha256===view.domain.sourceSha256&&budget&&profile?.maxWorkers>0,'SSG needs certified context/candidate domains and the unchanged shared profile.');
 const lifetime=new AbortController();let active=false,closed=false,done=Promise.resolve(),cached=null;
 const retiring=new Set(),releaseCheckpoint=value=>{if(!value)return;retiring.add(value);value.release();retiring.delete(value);};
 const clear=()=>{if(active)return 0;const previous=cached;cached=null;const before=budget.total(),failures=[];for(const value of new Set([previous,...retiring]))if(value)try{releaseCheckpoint(value);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'SSG checkpoints are still retiring.');return Math.max(0,before-budget.total());},unregister=budget.registerReclaimer?.(clear,{owner:'ssg-strict-native-checkpoint',label:'idle native global SSG stages',allocationKind:'array-buffer'});
 const localizerFor=async(checkpoint,signal)=>{
  if(checkpoint.localizer)return checkpoint.localizer;
  const fallback=(p,hooks)=>ssgStrictLocalize(checkpoint.fields,checkpoint.features,checkpoint.pairs,checkpoint.groups,checkpoint.models,p,{budget,profile,domain:candidateDomain,...hooks,...(moduleFactory?{moduleFactory}:{})});
  const localizer=await createSsgRetainedLocalizer(checkpoint,{budget,profile,sourceSha256:view.domain.sourceSha256,contextFingerprint:view.domain.fingerprint,candidateFingerprint:candidateDomain.fingerprint,sourceRevision:view.source?.descriptor?.revision??0,domain:candidateDomain,signal,nativeFallback:fallback,...(moduleFactory?{moduleFactory}:{})});try{checkAbort(signal);checkpoint.localizer=localizer;return localizer;}catch(error){localizer.disposeIdle();throw error;}
 };
 const localize=async(checkpoint,p,hooks)=>{try{return await(await localizerFor(checkpoint,hooks.signal)).exact(p,hooks);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;return ssgStrictLocalize(checkpoint.fields,checkpoint.features,checkpoint.pairs,checkpoint.groups,checkpoint.models,p,{budget,profile,domain:candidateDomain,...hooks,...(moduleFactory?{moduleFactory}:{})});}};
 const keyFor=(p,identity)=>JSON.stringify([view.domain.sourceSha256,view.domain.fingerprint,candidateDomain.fingerprint,view.source?.descriptor?.revision??null,identity.sha256,Object.fromEntries(Object.entries(p).filter(([key])=>!presentation.has(key)).sort(([a],[b])=>a.localeCompare(b)))]);
 return{
  async localizeRetained(input={},hooks={}){
   if(closed||active||!cached||!hooks.models?.['ssg-edges'])return null;
   let admitted,result,returned=false,finish;const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;active=true;done=new Promise(r=>finish=r);
   try{checkAbort(signal);admitted=budget.reserve(65536+sourceRegionTransportBytes(input,{allowAliases:true,allowUndefined:true})*4);const p=ssgFullParams(structuredClone(input)),identity=hooks.models['ssg-edges'];if(p.reflections||hooks.backend==='webgpu'||cached.key!==keyFor(p,identity))return null;const checkpoint=cached;
    if(hooks.preview){result=await(await localizerFor(checkpoint,signal)).preview(p,hooks.preview,{signal});checkAbort(signal);returned=true;return result;}
    const localized=await localize(checkpoint,p,{signal,onProgress:hooks.onProgress});result=await createSsgStrictResult(checkpoint,localized,p,{budget,view,candidateDomain,identity,reused:true});checkAbort(signal);returned=true;return result;
   }finally{try{if(!returned)result?.release();}finally{admitted?.();if(finish){active=false;finish();}}}
  },
  async analyze(input={},hooks={}){
   requireValue(!closed&&!active,'Strict SSG engine is busy or disposed.');const p=ssgFullParams(structuredClone(input)),identity=structuredClone(hooks.models?.['ssg-edges']);requireValue(identity?.url&&identity.bytes&&identity.sha256,'SSG requires its pinned native forest model.');if(p.reflections)throw new EngineError('UNSUPPORTED_OPERATION','Native SSG reflected matching is not qualified; ordinary matching is not substituted.');if(hooks.backend==='webgpu')throw new EngineError('UNSUPPORTED_OPERATION','Full native SSG requires its double-precision CPU runtime.');
   const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;checkAbort(signal);active=true;let finish;done=new Promise(resolve=>finish=resolve);const releases=[],admit=n=>{const free=budget.reserve(n);releases.push(free);return free;},report=(phase,fraction,details={})=>hooks.onProgress?.({phase,fraction,...details});let next,source,bank,words,fields,salience,phrases,localized,result,returned=false,primary,failed=false;
   try{
    const key=keyFor(p,identity);let checkpoint=cached,reused=checkpoint?.key===key;
    if(!reused){
     report('ssg-preparing',0);source=await createSsgStrictSource(view,p,{budget,signal});bank=await createSsgStrictWordBank(source,{budget,profile,candidateDomain,signal,onProgress:e=>report(e.phase,.03+.2*(e.completed/e.total),e),...(vlfeatFactory?{vlfeatFactory}:{})});report('ssg-word-matching',.27,{descriptors:bank.count});words=await matchSsgStrictWords(bank,{budget,signal});
     fields=await createSsgStrictFields(source,{budget,profile,model:identity,withEdges:!!words.pairs.length,signal,onProgress:e=>report(e.phase,.31+.15*(e.completed/e.total),e),...(edgesFactory?{edgesFactory}:{})});
     let weights;if(words.pairs.length){salience=await ssgStrictSalience(fields,bank,p,{budget,profile,signal,...(moduleFactory?{moduleFactory}:{})});weights=salience.weights;}else{admit(bank.count*8);weights=new Float64Array(bank.count).fill(1);}
     report('ssg-phrase-matching',.5);phrases=await ssgFastPhrases(bank,words,weights,p,{budget,profile,signal});let phaseInput=phrases;
     if(p.compare){const inside=(id,region)=>ssgInside((bank.points[id*3]+.5)/fields.scaleX-.5,(bank.points[id*3+1]+.5)/fields.scaleY-.5,p.regions[region]),ids=[];for(let i=0;i<phrases.pairs.length/2;i++){const a=phrases.pairs[i*2],b=phrases.pairs[i*2+1];if(inside(a,0)&&inside(b,1)||inside(a,1)&&inside(b,0))ids.push(i);}admit(ids.length*24);phaseInput={...phrases,pairs:Uint32Array.from(ids.flatMap(i=>Array.from(phrases.pairs.subarray(i*2,i*2+2)))),distances:Float64Array.from(ids.flatMap(i=>Array.from(phrases.distances.subarray(i*2,i*2+2))))};}
     const{normalizationLongEdge,...core}=p,filtered=await ssgFullFilterMatches(bank,phaseInput,{...core,width:fields.width,height:fields.height},{signal,reserveMemory:admit});report('ssg-mlesac',.65);const pairs=filtered.pairs,n=pairs.length/2,positions=new Float64Array(n*4);admit(positions.byteLength);for(let i=0;i<n;i++){const a=pairs[i*2]*3,b=pairs[i*2+1]*3;positions.set([bank.points[a],bank.points[a+1],bank.points[b],bank.points[b+1]],i*4);}const models=[],groups=[];
     for(const cluster of [...new Set(filtered.clusters)].filter(v=>v>0)){await controlCheckpoint(signal);const ids=Array.from(filtered.clusters,(v,i)=>v===cluster?i:-1).filter(i=>i>=0);if(ids.length<3)continue;admit(ids.length*100+4096);const xy=Float64Array.from(ids.flatMap(i=>Array.from(positions.subarray(i*4,i*4+4)))),fit=await ssgMlesac(xy,{signal,seed:p.rngSeed+cluster});if(fit.model&&fit.inliers.reduce((a,b)=>a+b,0)>=2){models.push({...fit.model,source_point_indices:ids.map(i=>pairs[i*2]),destination_point_indices:ids.map(i=>pairs[i*2+1]),inliers:fit.inliers.reduce((a,b)=>a+b,0),ssg:{iterations:fit.iterations,score:Number.isFinite(fit.score)?fit.score:null,...(!Number.isFinite(fit.score)?{nonfiniteScore:fit.score===Infinity?'positive-infinity':'negative-infinity'}:{}),scoreDefinition:fit.scoreDefinition,threshold:fit.threshold}});groups.push(Uint32Array.from(ids));}}
     const owners=[],own=(Type,array,label)=>{const o=allocateOwnedTypedArray(Type,array.length,{budget,owner:'ssg-strict-checkpoint',label});owners.push(o);o.data.set(array);return o.data;};let meta;
     try{const points=own(Float64Array,bank.points,'native common-grid feature points'),keptPairs=own(Uint32Array,pairs,'global accepted pairs'),keptGroups=groups.map(group=>own(Uint32Array,group,'native geometric groups')),metadata={bank:structuredClone(bank.metadata),fields:structuredClone(fields.metadata),counts:{features:bank.count,words:words.pairs.length/2,phrases:phaseInput.pairs.length/2,filtered:n,clusters:groups.length},models:structuredClone(models)};meta=budget.reserve(65536+sourceRegionTransportBytes(metadata,{allowAliases:true,allowUndefined:true})*3);let released=false;const retainedFields=fields,checkpointOwner={key,fields:retainedFields,features:{points,count:bank.count},pairs:keptPairs,groups:keptGroups,models:metadata.models,metadata,release(){if(released)return;checkpointOwner.localizer?.disposeIdle();released=true;retainedFields.release();for(const owner of owners)owner.release();meta();}};next=checkpointOwner;fields=null;checkpoint=next;
     }catch(error){for(const owner of owners)owner.release();meta?.();throw error;}
     await retire([()=>phrases?.release(),()=>salience?.release(),()=>words?.release(),()=>bank?.release(),()=>source?.dispose()]);phrases=salience=words=bank=source=null;
    }else report('ssg-native-checkpoint',.65,{reused:true});
    checkAbort(signal);report('ssg-ssim-roi',.75,{clusters:checkpoint.groups.length});localized=await localize(checkpoint,p,{signal,onProgress:f=>report('ssg-ssim-roi',.75+.2*f)});
    result=await createSsgStrictResult(checkpoint,localized,p,{budget,view,candidateDomain,identity,reused});localized=null;
    checkAbort(signal);report('complete',1);checkAbort(signal);if(next){const old=cached;cached=next;next=null;releaseCheckpoint(old);}returned=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{
    try{await retire([()=>!returned&&result?.release(),()=>localized?.release(),()=>releaseCheckpoint(next),()=>fields?.release(),()=>phrases?.release(),()=>salience?.release(),()=>words?.release(),()=>bank?.release(),()=>source?.dispose(),...releases],primary,failed);}finally{active=false;finish();}
   }
  },
  clearCheckpoint:clear,
  async dispose(){closed=true;lifetime.abort();await done;try{clear();}finally{unregister?.();}},
 };
}
