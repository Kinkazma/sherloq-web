import "../../runtime-context.js?v=0.14.5";
import {createPagedDetailSampler} from './dense-paged-detail.js';
import {pagedGuideLabels} from './dense-paged-regions.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {packDenseCorrespondences} from './dense-correspondences.js';
import {corroborateDenseGroups,DENSE_DETAIL_POLICY} from './dense-detail.js';
import {filterDenseTransforms} from './dense-transforms.js';
import {createDenseRegions} from './dense-regions.js';
const determinant=m=>m.matrix[0][0]*m.matrix[1][1]-m.matrix[0][1]*m.matrix[1][0];
const median=values=>{values.sort((a,b)=>a-b);const n=values.length;return n%2?values[n>>1]:(values[n/2-1]+values[n/2])/2;};
async function coalesce(pass,groups,models,labels,fit,signal){
 if(!models.length||!labels)return {groups,models};const partitions=new Map(),kept=[],fitted=[];
 for(let i=0;i<groups.length;i++){
  await controlCheckpoint(signal);let key=null,valid=true;
  for(const row of groups[i]){let a=labels[pass.pairs[row*4]],b=labels[pass.pairs[row*4+1]];if(a<0||b<0||a===b){valid=false;break;}if(a>b)[a,b]=[b,a];const value=pass.pairSearchRegions[row]+','+a+','+b;if(key!==null&&key!==value){valid=false;break;}key=value;}
  if(valid&&key!==null){const ids=partitions.get(key)??[];ids.push(i);partitions.set(key,ids);}else{kept.push(groups[i]);fitted.push(models[i]);}
 }
 for(const [key,ids]of partitions){
  if(ids.length===1){kept.push(groups[ids[0]]);fitted.push(models[ids[0]]);continue;}
  const union=Uint32Array.from(new Set(ids.flatMap(i=>Array.from(groups[i])))).sort(),result=await fit([union]),[,a,b]=key.split(',').map(Number);
  for(let i=0;i<result.models.length;i++)if(determinant(result.models[i])<0){kept.push(result.groups[i]);fitted.push({...result.models[i],source_panels:[a+1,b+1],merged_fragments:ids.length});}
 }
 return {groups:kept,models:fitted};
}

// M3 supplies these real geometry functions after coordinator integration. No
// fallback or substitute is used when that dependency has not been installed.
export async function verifyDenseEvidence(evidence,image,{budget,geometry,model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,signal,onProgress}={}){
 requireValue(geometry&&['pairedBiomes','verifyCopyGeometry','copyPalette','createGeometryKernel'].every(k=>typeof geometry[k]==='function'),'M3 geometry adapter is required.');
 requireValue(['None','Similarity','Affine','Homography'].includes(model)&&Number.isFinite(tolerance)&&tolerance>=0&&Number.isFinite(geometricThreshold)&&geometricThreshold>0&&Number.isInteger(geometricMinimum)&&geometricMinimum>=4,'Invalid dense geometry options.');
 requireValue((model!=='None')===evidence.params.coherence,'Dense field coherence must match the requested geometry mode.');
 const holds=[],work=[],reserveMemory=bytes=>{const release=budget.reserve(bytes);work.push(release);return release;},holdOutput=bytes=>{const release=budget.reserve(bytes);holds.push(release);return release;};let packed,kernel,preparation,detail,sampler,keep=false;
 try{
  packed=await packDenseCorrespondences(evidence,image,{budget,signal});
  if(model!=='None')kernel=await geometry.createGeometryKernel({signal,reserveMemory});
  const needsDetail=model!=='None'&&packed.passes.some(p=>p.pass.requireDetail);
  const needsGuides=model!=='None'&&evidence.profile.passes.some(p=>p.stage==='mirror')&&!evidence.params.compare&&evidence.params.guides.length;
  if(needsDetail||needsGuides){if(image.surface){if(needsDetail){sampler=await createPagedDetailSampler(image,{budget,signal});detail=sampler.detail;}}else{reserveMemory(48*1024**2+image.width*image.height*32);preparation=await createDenseRegions();checkAbort(signal);if(needsDetail){detail=preparation.detail(image);sampler=preparation.sampler(detail);}}}
  const results=[];let pairCount=0,pointCount=0,basePairs=0;
  for(const pass of packed.passes){
   await controlCheckpoint(signal);const scratch=[],admit=n=>{const done=budget.reserve(n);scratch.push(done);return done;};let fitted;
   try{
    const groups=await geometry.pairedBiomes(pass.points,pass.pairs,tolerance,{signal,reserveMemory:admit,pairSearchRegions:pass.pairSearchRegions});
    const fit=groups=>geometry.verifyCopyGeometry(pass.points,pass.pairs,groups,{model,threshold:geometricThreshold,minimum:geometricMinimum,reflection:pass.pass.reflection,signal,reserveMemory:admit,kernel});
    fitted=await fit(groups);
    if(pass.pass.requireReflection&&fitted.models.length){const ids=fitted.models.map((m,i)=>determinant(m)<0?i:-1).filter(i=>i>=0);fitted={groups:ids.map(i=>fitted.groups[i]),models:ids.map(i=>fitted.models[i])};
     const labels=needsGuides?(image.surface?await pagedGuideLabels(pass.points,image.width,image.height,evidence.params.guides,{budget,signal}):preparation.guideLabels(pass.points,image.width,image.height,evidence.params.guides)):null;fitted=await coalesce(pass,fitted.groups,fitted.models,labels,fit,signal);
    }
    if(pass.pass.requireTransform)fitted=filterDenseTransforms(fitted.groups,fitted.models,pass.pass);
    if(pass.pass.requireDetail&&detail)fitted=await corroborateDenseGroups(detail,sampler,pass.points,fitted.groups,fitted.models,{signal});
    if(pass.pass.requireReflection&&fitted.models.length){const ids=[];for(let i=0;i<fitted.models.length;i++){const m=fitted.models[i].matrix,move=fitted.models[i].source_point_indices.map(id=>{const x=pass.points[id*7],y=pass.points[id*7+1],w=x*m[2][0]+y*m[2][1]+m[2][2],u=(x*m[0][0]+y*m[0][1]+m[0][2])/w,v=(x*m[1][0]+y*m[1][1]+m[1][2])/w;return Math.sqrt((u-x)**2+(v-y)**2);});if(median(move)+1e-6>=evidence.params.minimum)ids.push(i);}fitted={groups:ids.map(i=>fitted.groups[i]),models:ids.map(i=>fitted.models[i])};}
    holdOutput(pass.pairs.length*64+4096);results.push({...pass,...fitted,pointOffset:pointCount,pairOffset:pairCount});pointCount+=pass.points.length/7;pairCount+=pass.pairs.length/4;if(pass.pass.stage!=='mirror')basePairs=pairCount;
   }finally{for(const release of scratch)release();}
   onProgress?.({phase:'dense-geometry',completed:results.length,total:packed.passes.length});
  }
  holdOutput(pointCount*28+pairCount*48+4096);const points=new Float32Array(pointCount*7),pairs=new Float64Array(pairCount*4),owners=new Int32Array(pairCount),algorithms=new Uint8Array(pairCount),groups=[],models=[],groupAlgorithms=[],variants=[],frames=[];
  for(const r of results){points.set(r.points,r.pointOffset*7);pairs.set(r.pairs,r.pairOffset*4);owners.set(r.pairSearchRegions,r.pairOffset);algorithms.fill(r.pass.method,r.pairOffset,r.pairOffset+r.pairs.length/4);for(let row=r.pairOffset;row<r.pairOffset+r.pairs.length/4;row++){pairs[row*4]+=r.pointOffset;pairs[row*4+1]+=r.pointOffset;}
   for(const group of r.groups){groups.push(Uint32Array.from(group,i=>i+r.pairOffset));groupAlgorithms.push(r.pass.algorithm);variants.push(r.pass.stage==='mirror'?'reflection':'normal');frames.push(r.pass.descriptorFrame);}
   for(const m of r.models)models.push({...m,...(evidence.profile.passes.length>1?{algorithm:r.pass.algorithm}:{}),...(r.pass.stage==='mirror'?{variant:'reflection'}:{}),...(r.pass.stage!=='base'?{descriptor_frame:r.pass.descriptorFrame}:{}),source_point_indices:m.source_point_indices.map(i=>i+r.pointOffset),destination_point_indices:m.destination_point_indices.map(i=>i+r.pointOffset)});
  }
  const palette=geometry.copyPalette(groups,pairs,Math.max(evidence.params.threshold,1e-9),{reserveMemory:holdOutput});checkAbort(signal);packed.release();packed=null;let released=false;keep=true;
  return {status:'ok',points,pairs,groups,models,...palette,pair_search_regions:owners,pair_algorithms:algorithms,group_algorithms:groupAlgorithms,group_variants:variants,group_frames:frames,dense_maps:evidence.fields,total_features:pointCount,candidate_comparisons:results.reduce((n,r)=>n+r.comparisons,0n),dense_count:results.reduce((n,r)=>n+r.denseCount,0),dense_consistent_count:results.reduce((n,r)=>n+r.consistentCount,0),params:evidence.params,geometry:{model,tolerance,threshold:geometricThreshold,minimum:geometricMinimum},regions:evidence.params.regions,compare:evidence.params.compare,extension_bins:evidence.profile.bins,mirror_policy:evidence.profile.profile.endsWith(' + Mirror')?{normal_preserved:true,base_pair_count:basePairs,maximum_overlap:.8,overlap_filter_stage:'display',detail:{enabled:needsDetail,...DENSE_DETAIL_POLICY}}:null,
   release(){if(released)return;released=true;for(const release of holds)release();},semantics:'Native dense hypotheses with independent search provenance, M3 regional fits and supplementary transformation/detail checks. No authenticity verdict.'};
 }finally{sampler?.dispose();kernel?.dispose();for(const release of work)release();if(!keep){packed?.release();for(const release of holds)release();}}
}
