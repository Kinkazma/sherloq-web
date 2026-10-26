import "../../runtime-context.js?v=0.25.0";
import {allocateOwnedTypedArray} from './allocation.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {copyPalette} from './copy-subbiomes.js';
/** Result-only packing, independent of every preparation/model entry point. */
export function createSsgFullResult(checkpoint,localized,p,{budget,width,height,identity,reused=false}={}){
 const {features,pairs,models,counts,edgeMetadata}=checkpoint,analysisImage=checkpoint.image,n=pairs.length/2,owners=[],temporary=[];let meta,returned=false;
 const own=(Type,count,label)=>{const o=allocateOwnedTypedArray(Type,count,{budget,owner:'ssg-full-result',label});owners.push(o);return o.data;},admit=bytes=>{const free=budget.reserve(bytes);temporary.push(free);return free;};
 try{
  meta=budget.reserve(65536+sourceRegionTransportBytes([models,p,counts,edgeMetadata??null],{allowAliases:true,allowUndefined:true})*6+checkpoint.groups.length*1024);
  const groups=checkpoint.groups.map(group=>{const out=own(Uint32Array,group.length,'independent native geometric group');out.set(group);return out;}),resultPoints=own(Float64Array,features.count*7,'Original native feature points'),resultPairs=own(Float64Array,n*4,'native pair result'),pairOwners=own(Int32Array,n,'native search ownership');pairOwners.fill(p.compare?0:-1);
  for(let i=0;i<features.count;i++){resultPoints[i*7]=(features.points[i*3]+.5)/analysisImage.scaleX-.5;resultPoints[i*7+1]=(features.points[i*3+1]+.5)/analysisImage.scaleY-.5;resultPoints[i*7+2]=features.points[i*3+2]/Math.sqrt(analysisImage.scaleX*analysisImage.scaleY);resultPoints[i*7+4]=1;}
  for(let i=0;i<n;i++){const a=pairs[i*2]*7,b=pairs[i*2+1]*7;resultPairs.set([pairs[i*2],pairs[i*2+1],1,Math.hypot(resultPoints[a]-resultPoints[b],resultPoints[a+1]-resultPoints[b+1])],i*4);}
  const originalModels=models.map(model=>{const m=model.matrix,sx=analysisImage.scaleX,sy=analysisImage.scaleY,ox=(sx-1)/2,oy=(sy-1)/2;return{...structuredClone(model),matrix:[[m[0][0],m[0][1]*sy/sx,(m[0][2]+m[0][0]*ox+m[0][1]*oy-ox)/sx],[m[1][0]*sx/sy,m[1][1],(m[1][2]+m[1][0]*ox+m[1][1]*oy-oy)/sy],[0,0,1]]};});
  const palette=copyPalette(groups,resultPairs,1,{reserveMemory:admit}),colors=own(Uint8Array,palette.colors.length,'native group colors');colors.set(palette.colors);
  const output={status:'ok',points:resultPoints,pairs:resultPairs,pair_search_regions:pairOwners,groups,models:originalModels,colors,bases:structuredClone(palette.bases),mask:localized.mask,width,height,total_features:features.count,candidate_comparisons:counts.words+counts.phrases,params:structuredClone(p),regions:structuredClone(p.regions),compare:p.compare,backend:'cpu',feature_policy:'ssg-paper-v2-full',metadata:{algorithm:'SSG',completeDetector:true,sourceCommit:'66bb26eca0c7e95c76042d5bcca58f744d70a27d',modelSha256:identity.sha256,edge:structuredClone(edgeMetadata),counts:structuredClone(counts),stageCache:{nativeCheckpoint:!!reused,newVlfeat:reused?0:1,newForest:reused?0:edgeMetadata?1:0,newMatching:reused?0:1},coordinates:'original-pixel-centres',scientificDefinitions:{I2NN:'paper-two-neighbors',salience:'paper-exp-negative-sigma-squared-distance',pairConfidence:'unscored-accepted-match',localization:structuredClone(localized.metadata),scriptParity:false},preflightExecutions:0}};
  returned=true;let released=false;return{...output,release(){if(released)return;released=true;localized.release();for(const owner of owners)owner.release();meta();}};
 }finally{for(const free of temporary)free();if(!returned){localized.release();for(const owner of owners)owner.release();meta?.();}}
}
