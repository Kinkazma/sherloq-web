import {createSsgVlfeat} from './ssg-vlfeat.js';
import {ssgWordDescriptors,ssgMatchWords} from './ssg.js';
import {ssgInside} from './ssg-full-input.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {roundEven} from './pixel-utils.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

async function retire(actions,primary,failed=false){const errors=[];for(const action of actions)try{await action();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgRetirementErrors=errors;}else throw new AggregateError(errors,'Native SSG word-bank retirement failed.');}}

/** Only the upstream image/detector production is partitioned. Coordinates and
 * native moment descriptors are joined in ONE global analysis-grid bank before
 * the original I2NN or phrase matcher can see them. No per-context matches are
 * concatenated and no artificial RGB mosaic is constructed. */
export async function createSsgStrictWordBank(source,{budget,profile,candidateDomain,signal,onProgress,vlfeatFactory=()=>createSsgVlfeat({budget})}={}){
 requireValue(source?.contexts&&budget&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0,'A strict SSG source, budget and unchanged worker profile are required.');
 const p=source.parameters,{normalizationLongEdge,...core}=p,native=vlfeatFactory(),scheduler=getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers}),leases=[],parts=[],outputs=[];let prepared,gray,frames,cpu,returned=false,primary,failed=false,metadataRelease;
 const admit=n=>{const release=budget.reserve(n);leases.push(release);return release;};
 try{
  if(candidateDomain)requireValue(candidateDomain.sourceSha256===source.sourceSha256,'SSG candidates and source have different Original identities.');admit(65536);let count=0,totalFrames=0;
  for(const context of source.contexts){
   await controlCheckpoint(signal);prepared=await source.read(context,{signal});gray=allocateOwnedTypedArray(Float32Array,prepared.gray.length,{budget,owner:'ssg-strict-VLFeat',label:'native Float32 grayscale'});gray.data.set(prepared.gray);
   cpu=await scheduler.acquire({cpu:1,signal,label:'ssg-strict-VLFeat',resourceOwner:'ssg'});frames=await native.run({gray:gray.data,width:prepared.width,height:prepared.height},{signal});cpu.release();cpu=null;gray.release();gray=null;
   const kept=[];for(let i=0;i<frames.count;i++){
    const x=(frames.points[i*3]+context.x+.5)/source.scaleX-.5,y=(frames.points[i*3+1]+context.y+.5)/source.scaleY-.5;
    const inSearch=(!p.regions.length||p.regions.some(poly=>ssgInside(x,y,poly)))&&!p.excluded.some(poly=>ssgInside(x,y,poly));
    const admitted=!candidateDomain||candidateDomain.containsOriginal(roundEven(x+source.origin[0]),roundEven(y+source.origin[1]));
    if(inSearch&&admitted)kept.push(frames.points[i*3],frames.points[i*3+1],frames.points[i*3+2]);
   }
   admit(kept.length*16+4096);const words=await ssgWordDescriptors({gray:prepared.gray,width:prepared.width,height:prepared.height,points:Float64Array.from(kept)},core,{signal,reserveMemory:admit});
   admit(2048);parts.push({context,words,nativeFrames:frames.count,normalizationSupport:structuredClone(prepared.metadata)});count+=words.count;totalFrames+=frames.count;
   await frames.release();frames=null;prepared.release();prepared=null;onProgress?.({phase:'ssg-strict-native-words',completed:context.index+1,total:source.contexts.length,features:count});
  }
  checkAbort(signal);const own=(Type,length,label)=>{const o=allocateOwnedTypedArray(Type,length,{budget,owner:'ssg-strict-global-bank',label});outputs.push(o);return o.data;},points=own(Float64Array,count*3,'common-grid native points'),magnitudes=own(Float64Array,count*4,'native word magnitudes'),invariants=own(Float64Array,count*24,'native word invariants'),moments=own(Float64Array,count*24,'native complex moments'),contextIds=own(Uint32Array,count,'native source context IDs');
  let at=0;for(const part of parts){await controlCheckpoint(signal);const w=part.words;points.set(w.points,at*3);for(let i=0;i<w.count;i++){points[(at+i)*3]+=part.context.x;points[(at+i)*3+1]+=part.context.y;contextIds[at+i]=part.context.index;}magnitudes.set(w.magnitudes,at*4);invariants.set(w.invariants,at*24);moments.set(w.moments,at*24);at+=w.count;}
  const metadata={sourceDomain:parts[0]?.normalizationSupport.sourceDomain??null,totalNativeFrames:totalFrames,wordFeatures:count,analysisShape:[source.height,source.width],scaleX:source.scaleX,scaleY:source.scaleY,featurePolicy:'native VLFeat plus native word descriptors per admitted common-grid context; ONE global bank',contexts:parts.map(v=>({index:v.context.index,bounds:[...v.context.bounds],nativeFrames:v.nativeFrames,wordFeatures:v.words.count,normalizationSupport:v.normalizationSupport})),nativePatchSupport:'Original word extractor keeps only complete native moment patches within each exact context; its block size and scale are unchanged.'};
  metadataRelease=budget.reserve(4096+sourceRegionTransportBytes([metadata,p],{allowAliases:true,allowUndefined:true})*3);checkAbort(signal);returned=true;let released=false;return{points,magnitudes,invariants,moments,contextIds,count,parameters:p,scaleX:source.scaleX,scaleY:source.scaleY,metadata,release(){if(released)return;released=true;for(const o of outputs)o.release();metadataRelease();}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await retire([()=>cpu?.release(),()=>frames?.release(),()=>gray?.release(),()=>prepared?.release(),()=>native.dispose(),...leases],primary,failed);}catch(error){for(const o of outputs)o.release();metadataRelease?.();throw error;}if(!returned){for(const o of outputs)o.release();metadataRelease?.();}}
}

/** Use the existing global word matcher once, with the same native comparison
 * predicate used by SsgFullEngine. This is not a complete SSG detector. */
export async function matchSsgStrictWords(bank,{budget,signal}={}){
 const leases=[],admit=n=>{const r=budget.reserve(n);leases.push(r);return r;},p=bank.parameters,{normalizationLongEdge,...core}=p;let complete=false,releaseOutput;
 try{
  const words=await ssgMatchWords(bank,core,{signal,reserveMemory:admit});let result=words;
  if(p.compare){const inside=(id,zone)=>ssgInside((bank.points[id*3]+.5)/bank.scaleX-.5,(bank.points[id*3+1]+.5)/bank.scaleY-.5,p.regions[zone]),ids=[];for(let i=0;i<words.pairs.length/2;i++){const a=words.pairs[i*2],b=words.pairs[i*2+1];if(inside(a,0)&&inside(b,1)||inside(a,1)&&inside(b,0))ids.push(i);}admit(ids.length*40);result={...words,pairs:Uint32Array.from(ids.flatMap(i=>Array.from(words.pairs.subarray(i*2,i*2+2)))),distances:Float64Array.from(ids.flatMap(i=>Array.from(words.distances.subarray(i*2,i*2+2)))),tests:ids.map(i=>words.tests[i])};}
  releaseOutput=budget.reserve(result.pairs.byteLength+result.distances.byteLength+result.tests.length*32+4096);const pairs=result.pairs.slice(),distances=result.distances.slice(),tests=[...result.tests];complete=true;let released=false;return{...result,pairs,distances,tests,release(){if(released)return;released=true;releaseOutput();}};
 }finally{for(const release of leases)release();if(!complete)releaseOutput?.();}
}
