import {alignedParent,hullOverlap,nativeBiomeHull,partitionBiomeAreas} from './sparse-biome-area.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {roundEven,inverse3} from './copy-geometry.js';

export const BIOME_METHODS=Object.freeze(['paired-local','paired-envelope','native','compact']);
export function biomeMethod(view={}){const method=view.biomeMethod??'paired-local';requireValue(BIOME_METHODS.includes(method),'Invalid biome formation method.');return method;}
export const pairedBiomeMethod=method=>method==='paired-local'||method==='paired-envelope';
export function needsBiomeFormation(view={}){const method=biomeMethod(view);return pairedBiomeMethod(method)||method==='compact'&&(view.maxBiomeArea??100)<100;}
/** Count only potentially displayed occurrences before allocating any formation
 * tables. Distinct-centre/overlap checks can narrow this safe upper bound later. */
export function biomeFormationSelectionCounts(result,view={}){
 const chosen=new Set(view.chosen??[]),hidden=new Set(view.hidden??[]),low=view.low??0,high=view.high??100000,minimum=view.minimum??4;let rows=0,groups=0;
 for(let index=0;index<result.groups.length;index++){
  if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;let kept=0;
  for(const row of result.groups[index])if(result.pairs[row*4+3]>=low&&result.pairs[row*4+3]<=high)kept++;
  if(kept>=minimum){rows+=kept;groups++;}
 }
 requireValue(Number.isSafeInteger(rows)&&Number.isSafeInteger(groups),'Biome selected occurrence count exceeds admission.');return{rows,groups};
}


function familyColor(index){
 const h=(.76+index*.618033988749895)%1,s=.75,v=.95,i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));
 return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6].slice().reverse().map(x=>roundEven(x*255));
}
function decorateColors(formed,result){
 if(!formed)return formed;const counts=new Map();for(const leaf of formed.leaves)counts.set(leaf.index,(counts.get(leaf.index)??0)+1);
 const split=[...counts.values()].some(n=>n>1),used=new Set();requireValue(formed.leaves.length<=0x1000000,'Too many derived palette entries.');
 formed.leaves.forEach((leaf,i)=>{let color=split?familyColor(i):Array.from(result.bases?.[leaf.index]??familyColor(i)),salt=i;
  if(split)while(used.has(color.join(','))){const mixed=Math.imul(++salt,2654435761)>>>0;color=[mixed&255,mixed>>>8&255,mixed>>>16&255];}
  used.add(color.join(','));leaf.colorBgr=color;formed.metadata.partitions[i].colorBgr=[...color];});
 formed.metadata.palette='paired-side-identical; Native golden-angle bases distinguish derived children; raw colors unchanged';return formed;
}

function covariance(a,b=a){
 const n=a.length,ma=[0,0],mb=[0,0];for(let i=0;i<n;i++)for(let k=0;k<2;k++){ma[k]+=a[i][k]/n;mb[k]+=b[i][k]/n;}
 const out=[[0,0],[0,0]];for(let i=0;i<n;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)out[j][k]+=(a[i][j]-ma[j])*(b[i][k]-mb[k])/n;
 return out;
}
function affineCovariance(model,c){
 const m=model.matrix;if(m[2][0]!==0||m[2][1]!==0||m[2][2]!==1)return null;
 return [0,1].map(i=>[0,1].map(j=>[0,1].reduce((s,k)=>s+[0,1].reduce((t,l)=>t+m[i][k]*c[k][l]*m[j][l],0),0)));
}
function modelInformation(frame){
 const covarianceSource=covariance(frame.a),covarianceTarget=covariance(frame.b);
 if(!frame.model)return{modelSource:'none-unfitted',shapeGuarantee:'proximity-only; no fitted transformation',covarianceSource,covarianceTarget};
 const model=frame.model,affine=model.matrix[2][0]===0&&model.matrix[2][1]===0&&model.matrix[2][2]===1;
 return{modelSource:'native-parent',independentlyRefitted:false,model:model.model,
  shapeGuarantee:affine?'observed convex envelopes correspond within parent point residual plus Native rounding; no contour projection':'projective pointwise support only; no universal affine shape/scale guarantee',
  covarianceSource,covarianceTarget,crossCovarianceSourceTarget:covariance(frame.a,frame.b),predictedTargetCovariance:affineCovariance(model,covarianceSource),
  covarianceUse:'diagnostic only; no new fit or acceptance threshold'};
}
async function connectedSupport(a,b,tolerance,cooperate){
 // The existing Native predicate on the two explicitly oriented endpoints.
 // Index only unvisited rows; never materialise a quadratic adjacency table.
 const unseen=new Set(a.map((_,i)=>i)),out=[],cells=new Map(),keys=[],cell=i=>[...a[i],...b[i]].map(x=>tolerance===0?x:Math.floor(x/tolerance)),key=c=>c.join(','),offsets=[];
 if(tolerance===0)offsets.push([0,0,0,0]);else for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++)for(let l=-1;l<=1;l++)offsets.push([i,j,k,l]);
 for(let i=0;i<a.length;i++){const c=cell(i);requireValue(c.every(Number.isFinite),'Paired biome index range');const address=key(c);keys.push(address);if(!cells.has(address))cells.set(address,new Set());cells.get(address).add(i);if(i%256===0)await cooperate();}
 const remove=i=>{unseen.delete(i);const bucket=cells.get(keys[i]);bucket.delete(i);if(!bucket.size)cells.delete(keys[i]);};
 while(unseen.size){const seed=unseen.values().next().value,queue=[seed],part=[];unseen.delete(seed);
  const seedBucket=cells.get(keys[seed]);seedBucket.delete(seed);if(!seedBucket.size)cells.delete(keys[seed]);
  for(let at=0;at<queue.length;at++){const i=queue[at],c=cell(i);part.push(i);for(const offset of offsets){const bucket=cells.get(key(c.map((x,k)=>x+offset[k])));if(!bucket)continue;for(const j of bucket)if(Math.hypot(a[i][0]-a[j][0],a[i][1]-a[j][1])<=tolerance&&Math.hypot(b[i][0]-b[j][0],b[i][1]-b[j][1])<=tolerance){remove(j);queue.push(j);}}await cooperate();}
  out.push(part.sort((i,j)=>i-j));
 }return out;
}
function horizonCrosses(model,hull){
 if(!model)return false;const m=model.matrix;let positive=false,negative=false;
 for(const [x,y]of hull){const w=m[2][0]*x+m[2][1]*y+m[2][2];if(!Number.isFinite(w)||Math.abs(w)<=1e-12)return true;positive||=w>0;negative||=w<0;}
 return positive&&negative;
}

/** View-only formation over already acquired correspondences. Each filled side
 * is the convex hull of observed, model-oriented endpoints; no transformed or
 * extrapolated contour is substituted for observed target evidence. */
export async function formCorrespondenceBiomes(result,groups,percent,references,{view={},signal,reserveMemory,minimum=4}={}){
 const method=biomeMethod(view);if(method==='native')return null;
 if(method==='compact'){const formed=await partitionBiomeAreas(result,groups,percent,references,{signal,reserveMemory,minimum});if(formed){formed.metadata.method=method;formed.metadata.effectiveMaxBiomeArea=percent;}return decorateColors(formed,result);}
 requireValue(Number.isInteger(percent)&&percent>=1&&percent<=100&&typeof reserveMemory==='function','Invalid paired biome admission.');
 const count=groups.reduce((n,g)=>n+g.rows.length,0),frameBytes=count*8192+groups.length*4096+8192;requireValue(Number.isSafeInteger(frameBytes),'Invalid paired frame workspace.');reserveMemory(frameBytes);checkAbort(signal);
 const sharedAdmission=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes<=frameBytes,'Paired component exceeds its existing frame admission.');};
 const tolerance=result.params?.tolerance??50;requireValue(Number.isFinite(tolerance)&&tolerance>=0,'Invalid paired biome proximity.');
 const cooperate=createCooperator(signal),leaves=[],partitions=[],parents=[],nextSubIndex=new Map();
 for(const group of groups){
  await cooperate();const frame=alignedParent(result,group.index,Array.from(group.rows)),inverse=frame.model?inverse3(frame.model.matrix.flat()):null,inverseModel=inverse?{matrix:[inverse.slice(0,3),inverse.slice(3,6),inverse.slice(6,9)]}:null,info=modelInformation(frame),local=method==='paired-local'||!frame.model,
   components=local?await connectedSupport(frame.a,frame.b,tolerance,cooperate):[frame.a.map((_,i)=>i)],
   alignedHulls=[nativeBiomeHull(frame.a),nativeBiomeHull(frame.b)],maximumOverlap=result.self_match_filter?.maximum_overlap??null,
   parentOverlap=hullOverlap(...alignedHulls);
  parents.push({parent:group.index,inliers:group.rows.length,components:components.map(c=>c.length),orientation:frame.orientation,...info,
   alignedObservedOverlap:parentOverlap,surfaceIssue:maximumOverlap!==null&&parentOverlap>=maximumOverlap?'aligned-parent-overlap; links retained':null,
   requestedMethod:method,effectiveMethod:local?'paired-local':'paired-envelope',fallback:!frame.model?'geometric-model-unavailable':null});
  for(let component=0;component<components.length;component++){
   await cooperate();const rows=Uint32Array.from(components[component],i=>group.rows[i]),formed=await partitionBiomeAreas(result,[{index:group.index,rows}],percent,references,
    {signal,reserveMemory:sharedAdmission,minimum,observedHullsOnly:true,hardProximity:local,forceDerived:true,reportDerivedRadius:false,orientedFrame:{...frame,a:components[component].map(i=>frame.a[i]),b:components[component].map(i=>frame.b[i]),pointIds:frame.pointIds.map(side=>components[component].map(i=>side[i]))}});
   for(let k=0;k<formed.leaves.length;k++){
    const leaf=formed.leaves[k],record=formed.metadata.partitions[k],subIndex=nextSubIndex.get(group.index)??0;nextSubIndex.set(group.index,subIndex+1);
    leaf.subIndex=subIndex;leaf.component=component;record.subIndex=subIndex;record.component=component;
    if(horizonCrosses(frame.model,leaf.hulls[0])||horizonCrosses(inverseModel,leaf.hulls[1])){leaf.supportOnly=true;leaf.reason='projective-horizon-crosses-support';record.supportOnly=true;record.supportReason=leaf.reason;}
    leaves.push(leaf);partitions.push(record);
   }
  }
 }
 checkAbort(signal);const covered=leaves.reduce((n,g)=>n+g.rows.length,0);requireValue(covered===count,'Paired biome formation lost a selected occurrence.');
 return decorateColors({leaves,metadata:{schema:'sparse-biome-area/4',method,percent,effectiveMaxBiomeArea:percent,derived:true,independentlyRefitted:false,
  metric:'max-rounded-observed-convex-hull-area-of-both-model-oriented-sides',reference:'actual admitted area per Native parent/window',
  formation:method==='paired-local'?'post-fit paired-endpoint connected support; area-constrained nuclei and residual reassignment':'observed envelopes under one parent model; area-constrained regrouping',
  nativeGroupsUnchanged:true,nativePairsUnchanged:true,nativeModelsUnchanged:true,linksPolicy:'all selected Native links retained even when a surface is unsupported or overlapping',
  parents,parentGroups:groups.length,displaySubBiomes:leaves.length,coveredPairOccurrences:covered,supportOnlyGroups:leaves.filter(g=>g.supportOnly).length,
  preferredNucleusMinimum:Math.max(3,minimum),effectiveInheritedSurfaceMinimum:3,partitions}},result);
}
