import{isSsgProjectionFailure}from'./ssg-native-projection.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createSsgRetainedLocalizer} from './ssg-retained-localization.js';
import {createSsgFullResult} from './ssg-full-result.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {ssgFullParams,prepareSsgImage,ssgInside} from './ssg-full-input.js';
import {createSsgVlfeat} from './ssg-vlfeat.js';
import {createSsgEdges} from './ssg-edges.js';
import {ssgWordDescriptors,ssgMatchWords} from './ssg.js';
import {ssgMlesac} from './ssg-full-geometry.js';
import {ssgFullFilterMatches} from './ssg-full-filter.js';
import {ssgLocalize,ssgFastSalience,ssgFastPhrases} from './ssg-full-localization.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {allocateOwnedTypedArray,registerArrayViews} from './allocation.js';
import {copyPalette} from './copy-subbiomes.js';
import {sparseStageCache} from './sparse-stage-cache.js';
let nextSsgImage=0;
const checkpointViews=value=>({gray:value.image.gray,points:value.features.points,pairs:value.pairs,...Object.fromEntries(value.groups.map((g,i)=>['group'+i,g]))});
const checkpointBytes=value=>{const buffers=new Set(Object.values(checkpointViews(value)).map(a=>a.buffer));return [...buffers].reduce((sum,b)=>sum+b.byteLength,0)+value.models.reduce((sum,m)=>sum+(m.source_point_indices.length+m.destination_point_indices.length)*8+512,0)+2048;};

export class SsgFullEngine {
 constructor(image,budget,profile){this.image=image;this.budget=budget;this.profile=profile;this.vlfeat=createSsgVlfeat({budget});this.edges=createSsgEdges({budget,profile});this.running=false;this.disposed=false;this.lifetime=new AbortController();this.prefix='ssg-full-'+(++nextSsgImage)+'/';this.sourceOwners=new WeakMap();this.nextSourceOwner=0;this.localizers=new Map();this.retiringOwners=new Set();this.wordOwners=new Set();}
 async dispose(){this.disposed=true;this.lifetime.abort();await this.finished;await retireCompositeOwners([()=>this.vlfeat.dispose(),()=>this.edges.dispose(),...[...this.wordOwners].map(owner=>()=>owner.dispose()),()=>this.budget.clearPrefix(this.prefix),...[...this.retiringOwners].map(owner=>()=>owner()),...[...this.localizers.values()].map(localizer=>()=>localizer.dispose())]);this.localizers.clear();}

 sourceBinding(hooks){const owner=hooks.sourceOwner;let token=null;if(owner&&typeof owner==='object'){token=this.sourceOwners.get(owner);if(!token){token=++this.nextSourceOwner;this.sourceOwners.set(owner,token);}}return[hooks.sourceSha256??null,hooks.sourceRevision??null,token];}
 nativeName(p,identity,hooks){const nativeParameters=Object.fromEntries(Object.entries(p).filter(([key])=>!['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius','limit'].includes(key)).sort(([a],[b])=>a.localeCompare(b)));return'native/'+JSON.stringify([identity.sha256,this.image.width,this.image.height,nativeParameters,this.sourceBinding(hooks)]);}
 async localization(checkpoint,p,hooks){
  if(!hooks.sourceSha256)return ssgLocalize(checkpoint.image,checkpoint.features,checkpoint.pairs,checkpoint.groups,checkpoint.models,p,{budget:this.budget,profile:this.profile,signal:hooks.signal,onProgress:hooks.onProgress});
  try{let localizer=this.localizers.get(checkpoint);if(!localizer){localizer=await createSsgRetainedLocalizer(checkpoint,{budget:this.budget,profile:this.profile,sourceSha256:hooks.sourceSha256,sourceRevision:hooks.sourceRevision??0,signal:hooks.signal,nativeFallback:(params,options)=>ssgLocalize(checkpoint.image,checkpoint.features,checkpoint.pairs,checkpoint.groups,checkpoint.models,params,{budget:this.budget,profile:this.profile,...options})});try{checkAbort(hooks.signal);this.localizers.set(checkpoint,localizer);}catch(error){localizer.disposeIdle();throw error;}}
  if(hooks.preview)return await localizer.preview(p,hooks.preview,{signal:hooks.signal});return await localizer.exact(p,{signal:hooks.signal});}catch(error){if(isSsgProjectionFailure(error)||error?.code!=='MEMORY_LIMIT')throw error;if(hooks.preview)return null;return ssgLocalize(checkpoint.image,checkpoint.features,checkpoint.pairs,checkpoint.groups,checkpoint.models,p,{budget:this.budget,profile:this.profile,signal:hooks.signal,onProgress:hooks.onProgress});}
 }
 async localizeRetained(input={},hooks={}){
  if(this.running||this.disposed||!this.image||!hooks.sourceSha256||!hooks.models?.['ssg-edges'])return null;
  this.running=true;let finish;this.finished=new Promise(resolve=>finish=resolve);let admitted,cache,result,returned=false,primary,failed=false;const signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;
  try{checkAbort(signal);admitted=this.budget.reserve(65536+sourceRegionTransportBytes(input,{allowAliases:true,allowUndefined:true})*4);const p=ssgFullParams(structuredClone(input)),identity=hooks.models['ssg-edges'];if(p.reflections||hooks.backend==='webgpu')return null;const name=this.nativeName(p,identity,hooks);if(this.retainedName!==name||!this.budget.get(this.prefix+name))return null;cache=sparseStageCache(this.budget,this.prefix,{signal,byteLength:checkpointBytes});const checkpoint=await cache.memo(name,()=>{throw new EngineError('CACHE_MISS','Native SSG checkpoint was evicted.');});
   const localized=await this.localization(checkpoint,p,{...hooks,signal});if(hooks.preview){result=localized;checkAbort(signal);returned=true;return result;}if(!localized)return null;result=createSsgFullResult(checkpoint,localized,p,{budget:this.budget,width:this.image.width,height:this.image.height,identity,reused:true});checkAbort(signal);returned=true;return result;
  }catch(error){failed=true;primary=error;throw error;}finally{try{await retireCompositeOwners([()=>!returned&&result?.release(),()=>admitted?.(),()=>cache?.finish({publish:!this.disposed})],failed?{primary}:{});}catch(cleanup){if(returned)result?.release();throw cleanup;}finally{this.running=false;finish();}}
 }
 async analyze(input={},hooks={}){
  const p=ssgFullParams(input),identity=hooks.models?.['ssg-edges'];requireValue(!this.running&&!this.disposed,'SSG engine busy or disposed.');requireValue(identity?.url&&identity.bytes&&identity.sha256,'SSG requires the original pinned structured-forest resource.');if(p.reflections)throw new EngineError('UNSUPPORTED_OPERATION','SSG reflected matching is not yet qualified; no ordinary matching pass is substituted.');if(hooks.backend==='webgpu')throw new EngineError('UNSUPPORTED_OPERATION','The full SSG double-precision localization currently requires its qualified CPU runtime.');
  const signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;checkAbort(signal);this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});
  const releases=[],admit=bytes=>{const r=this.budget.reserve(bytes);releases.push(r);return r;},report=(phase,fraction,detail={})=>hooks.onProgress?.({phase,fraction,...detail});let image,frames,edge,grayOwner,lease,localized,outputRelease,outputBacking,output,returned=false,primary,failed=false;const hits={};
  const cache=sparseStageCache(this.budget,this.prefix,{signal,byteLength:checkpointBytes,hits}),name=this.nativeName(p,identity,hooks);
  if(!this.budget.get(this.prefix+name))this.budget.clearPrefix(this.prefix);
  try{
   const checkpoint=await cache.memo(name,async()=>{
   report('ssg-preparing',0);image=await prepareSsgImage(this.image,p,{budget:this.budget,signal});grayOwner=allocateOwnedTypedArray(Float32Array,image.gray.length,{budget:this.budget,owner:'ssg',label:'VLFeat Float32 grayscale'});grayOwner.data.set(image.gray);
   const scheduler=getExecutionScheduler(this.budget,{maxWorkers:this.profile.maxWorkers});lease=await scheduler.acquire({cpu:1,signal,label:'ssg-vlfeat',resourceOwner:'ssg'});report('ssg-vlfeat',.03);frames=await this.vlfeat.run({gray:grayOwner.data,width:image.width,height:image.height},{signal});lease.release();lease=null;grayOwner.release();grayOwner=null;this.vlfeat.releaseIdle();
   report('ssg-word-descriptors',.15,{features:frames.count});const points=frames.points,filtered=[];for(let i=0;i<points.length;i+=3){const x=(points[i]+.5)/image.scaleX-.5,y=(points[i+1]+.5)/image.scaleY-.5;if((!p.regions.length||p.regions.some(poly=>ssgInside(x,y,poly)))&&!p.excluded.some(poly=>ssgInside(x,y,poly)))filtered.push(points[i],points[i+1],points[i+2]);}
   const {normalizationLongEdge:preparationOnly,...core}=p;
   const features=await ssgWordDescriptors({gray:image.gray,width:image.width,height:image.height,points:Float64Array.from(filtered)},core,{signal,reserveMemory:admit});frames.release();frames=null;
   const cross=(a,b)=>{if(!p.compare)return true;const ax=(features.points[a*3]+.5)/image.scaleX-.5,ay=(features.points[a*3+1]+.5)/image.scaleY-.5,bx=(features.points[b*3]+.5)/image.scaleX-.5,by=(features.points[b*3+1]+.5)/image.scaleY-.5;return ssgInside(ax,ay,p.regions[0])&&ssgInside(bx,by,p.regions[1])||ssgInside(ax,ay,p.regions[1])&&ssgInside(bx,by,p.regions[0]);};
   const keepCross=matches=>{if(!p.compare)return matches;const ids=Array.from({length:matches.pairs.length/2},(_,i)=>i).filter(i=>cross(matches.pairs[i*2],matches.pairs[i*2+1]));return {...matches,pairs:Uint32Array.from(ids.flatMap(i=>Array.from(matches.pairs.subarray(i*2,i*2+2)))),...(matches.distances?{distances:Float64Array.from(ids.flatMap(i=>Array.from(matches.distances.subarray(i*2,i*2+2))))}:{})};};
   report('ssg-word-matching',.3,{descriptors:features.count});const words=keepCross(await ssgMatchWords(features,core,{signal,reserveMemory:admit,wordIndex:{budget:this.budget,pendingOwners:this.wordOwners}}));
   if(words.pairs.length){report('ssg-structured-edges',.4);edge=await this.edges.run({rgb:image.rgb,width:image.width,height:image.height,model:identity},{signal});}
   this.edges.releaseIdle();const salience=edge?await ssgFastSalience({...image,edgeMap:edge.edgeMap},features,p,{budget:this.budget,profile:this.profile,signal}):null,weights=salience?.weights??new Float64Array(features.count).fill(1),edgeMetadata=edge?.metadata;edge?.release();edge=null;
   report('ssg-phrase-matching',.55);let phrases,phraseOwner;try{phraseOwner=await ssgFastPhrases(features,words,weights,p,{budget:this.budget,profile:this.profile,signal});phrases=keepCross(phraseOwner);}finally{salience?.release();}let filteredMatches;try{filteredMatches=await ssgFullFilterMatches(features,phrases,{...core,width:image.width,height:image.height},{signal,reserveMemory:admit});}finally{phraseOwner?.release();}
   report('ssg-mlesac',.65);const pairs=filteredMatches.pairs,n=pairs.length/2,positions=new Float64Array(n*4);admit(positions.byteLength);for(let i=0;i<n;i++){const a=pairs[i*2]*3,b=pairs[i*2+1]*3;positions.set([features.points[a],features.points[a+1],features.points[b],features.points[b+1]],i*4);}
   const clusters=[...new Set(filteredMatches.clusters)].filter(i=>i>0),models=[],groups=[];
   for(const cluster of clusters){const ids=Array.from(filteredMatches.clusters,(v,i)=>v===cluster?i:-1).filter(i=>i>=0);if(ids.length<3)continue;const xy=Float64Array.from(ids.flatMap(i=>Array.from(positions.subarray(i*4,i*4+4)))),fit=await ssgMlesac(xy,{signal,seed:p.rngSeed+cluster});if(fit.model&&fit.inliers.reduce((a,b)=>a+b,0)>=2){models.push({...fit.model,source_point_indices:ids.map(i=>pairs[i*2]),destination_point_indices:ids.map(i=>pairs[i*2+1]),inliers:fit.inliers.reduce((a,b)=>a+b,0),ssg:{iterations:fit.iterations,score:Number.isFinite(fit.score)?fit.score:null,...(!Number.isFinite(fit.score)?{nonfiniteScore:fit.score===Infinity?'positive-infinity':'negative-infinity'}:{}),scoreDefinition:fit.scoreDefinition,threshold:fit.threshold}});groups.push(Uint32Array.from(ids));}}
   const value={key:name,image:{gray:image.gray,width:image.width,height:image.height,scaleX:image.scaleX,scaleY:image.scaleY,originalWidth:image.originalWidth,originalHeight:image.originalHeight},features:{points:features.points,count:features.count},pairs,groups,models,counts:{features:features.count,words:words.pairs.length/2,phrases:phrases.pairs.length/2,filtered:n,clusters:groups.length},edgeMetadata};
   const backing=registerArrayViews(this.budget,checkpointViews(value),{owner:'ssg-native-checkpoint'});let retired=false,retirementCredit;const retireOwner=()=>{if(retired)return;try{const localizer=this.localizers.get(value);localizer?.disposeIdle();this.localizers.delete(value);backing();retired=true;this.retiringOwners.delete(retireOwner);retirementCredit?.();}catch(error){this.retiringOwners.add(retireOwner);retirementCredit??=this.budget.reserve(checkpointBytes(value));throw error;}};cache.adopt(value,retireOwner);return value;
   });
   const groups=checkpoint.groups;
   if(hits.native)report('ssg-native-checkpoint',.65,{reused:true});
   report('ssg-ssim-roi',.75,{clusters:groups.length});localized=await this.localization(checkpoint,p,{...hooks,signal,onProgress:f=>report('ssg-ssim-roi',.75+.2*f)});
   output=createSsgFullResult(checkpoint,localized,p,{budget:this.budget,width:this.image.width,height:this.image.height,identity,reused:!!hits.native});localized=null;checkAbort(signal);this.retainedName=name;report('complete',1);checkAbort(signal);returned=true;return output;
  }catch(error){failed=true;primary=error;throw error;}finally{try{await retireCompositeOwners([()=>!returned&&output?.release(),()=>outputBacking?.(),()=>outputRelease?.(),()=>localized?.release(),()=>lease?.release(),()=>grayOwner?.release(),()=>edge?.release(),()=>frames?.release(),()=>image?.release(),...releases,()=>cache.finish({publish:!this.disposed})],failed?{primary}:{});}catch(cleanup){if(returned)output?.release();throw cleanup;}finally{this.running=false;finish();}}
 }
}
