import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {prepareSegmentationScientificMask} from './segmentation-scientific-scope.js';
import {nativeSourceRegionCandidateExclusions} from './source-region-native-regions.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

const grids=new Map([[128,{channels:24,k:24}],[64,{channels:32,k:32}],[32,{channels:96,k:96}]]);
const polygon=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

function candidateRectangles(domain,bounds){
 const [x0,y0,x1,y1]=bounds,rectangles=[],active=new Map();
 for(let y=y0;y<y1;y++){
  const next=new Map();
  for(const [lo,hi] of domain.originalRowIntervals(y)){
   const left=Math.max(x0,lo)-x0,right=Math.min(x1,hi)-x0;if(right<=left)continue;
   const key=left+','+right,prior=active.get(key);
   if(prior&&prior[3]===y-y0){prior[3]++;next.set(key,prior);active.delete(key);}
   else next.set(key,[left,y-y0,right,y-y0+1]);
  }
  rectangles.push(...active.values());active.clear();for(const [key,r] of next)active.set(key,r);
  requireValue(rectangles.length+active.size<=8192,'CMSeg exact candidate metadata exceeds its admitted rectangle bound');
 }
 rectangles.push(...active.values());return rectangles;
}

// The native MobileNet centres are 0,stride,2*stride,... in prepared RGB.
// Mapping through Original avoids treating concatenated grids as a taller image.
export function cmsegWindowCoordinate(index,side,first,length,frameFirst,frameLength){
 requireValue(grids.has(side)&&Number.isInteger(index)&&index>=0&&index<side&&[first,length,frameFirst,frameLength].every(Number.isSafeInteger)&&length>0&&frameLength>0,'Native CMSeg cell and Original frame required');
 if(first===frameFirst&&length===frameLength)return index;
 const stride=512/side;
 return Math.fround((((first-frameFirst)*512+(index*stride+.5)*length)/frameLength-.5)/stride);
}

/** Geometry only: no RGB, graph, tensor normalization or inference is executed.
 * Contexts must be an exact disjoint partition of the one declared context.
 * Candidate cells are removed upstream; no unavailable location is restored by
 * a decoder/output mask. One full rectangle keeps its original pipeline.
 */
export async function planCmsegWindowBank({window,contexts,side},{budget,signal}={}){
 const spec=grids.get(side);requireValue(spec&&budget?.reserve&&window?.contextDomain&&window?.candidateDomain&&Array.isArray(contexts)&&contexts.length>0,'One canonical CMSeg window and native contexts required');
 checkAbort(signal);
 const domain=await compileOriginalSourceRegions(window.contextDomain.descriptor??window.contextDomain),candidate=await compileOriginalSourceRegions(window.candidateDomain.descriptor??window.candidateDomain);
 requireValue(!domain.empty&&candidate.sourceSha256===domain.sourceSha256&&candidate.sourceWidth===domain.sourceWidth&&candidate.sourceHeight===domain.sourceHeight&&typeof window.fingerprint==='string','CMSeg context and candidates differ from Original');
 const frame=[domain.rect.x0,domain.rect.y0,domain.rect.x1,domain.rect.y1],count=side*side,total=count*contexts.length;
 requireValue(Number.isSafeInteger(total)&&total<=0x3ffffff&&contexts.length<=8192,'CMSeg native bank exceeds its exact indexing/metadata bound');
 const credit=budget.reserve(total*9+contexts.length*1024+8192*64),masks=[];let complete=false,released=false;
 const current=()=>{requireValue(!released,'CMSeg bank plan retired');checkAbort(signal);};
 try{
  const owned=contexts.map((c,index)=>{
   const bounds=[...(c.bounds??[])];requireValue(bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=frame[0]&&bounds[1]>=frame[1]&&bounds[2]<=frame[2]&&bounds[3]<=frame[3]&&bounds[2]>bounds[0]&&bounds[3]>bounds[1],'CMSeg literal context escapes its window');
   return Object.freeze({index,id:c.id??String(index),bounds:Object.freeze(bounds),offset:index*count,count});
  });
  for(let y=frame[1];y<frame[3];y++){
   if((y&31)===0)await controlCheckpoint(signal);
   const xs=owned.filter(c=>c.bounds[1]<=y&&c.bounds[3]>y).map(c=>[c.bounds[0],c.bounds[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),merged=[];
   for(const [lo,hi] of xs){const prior=merged.at(-1);requireValue(!prior||lo>=prior[1],'CMSeg RGB context partitions duplicate Original observations');if(prior&&lo===prior[1])prior[1]=hi;else merged.push([lo,hi]);}
   const expected=domain.originalRowIntervals(y);requireValue(merged.length===expected.length&&merged.every((r,i)=>same(r,expected[i])),'CMSeg literal contexts do not cover the exact admitted RGB domain');
   const allowed=candidate.originalRowIntervals(y);for(const [lo,hi] of allowed)requireValue(expected.some(r=>lo>=r[0]&&hi<=r[1]),'CMSeg candidates escape admitted RGB');
  }
  const values=new Uint8Array(total),positions=new Float32Array(total*2),metadata=[];
  for(const c of owned){
   current();const [x0,y0,x1,y1]=c.bounds,width=x1-x0,height=y1-y0,rectangles=candidateRectangles(candidate,c.bounds);
   if(rectangles.length){
    const membership={schema:'sherloq.native-region-membership/1',coordinates:'source-region-native',domainFingerprint:candidate.fingerprint,sourceSha256:domain.sourceSha256,width,height,levels:[{rectangles}]};
    const scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:domain.sourceSha256,width,height,status:'ready',regions:[{id:c.id,x0:0,y0:0,x1:width,y1:height,polygon:polygon([0,0,width,height])}],excluded:nativeSourceRegionCandidateExclusions(membership),nativeSourceRegions:membership,fingerprint:await digest(['cmseg-window-candidates/1',window.fingerprint,candidate.fingerprint,c.bounds,rectangles])};
    const stride=512/side,mask=await prepareSegmentationScientificMask({scope,width,height,sourceSha256:domain.sourceSha256,bounds:[0,0,width,height]},{rows:side,inputSide:512,originX:0,originY:0,strideX:stride,strideY:stride,budget,signal});masks.push(mask);values.set(mask.values,c.offset);metadata.push(mask.metadata);
   }else metadata.push({admittedSources:0,admittedTargets:0,grid:[side,side],bounds:[...c.bounds],policy:'No candidate pixel in this literal RGB context; no fallback'});
   for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=c.offset+y*side+x;positions[i]=cmsegWindowCoordinate(x,side,x0,width,frame[0],frame[2]-frame[0]);positions[total+i]=cmsegWindowCoordinate(y,side,y0,height,frame[1],frame[3]-frame[1]);}
  }
  current();const admitted=values.reduce((n,v)=>n+v,0),identity=await digest(['cmseg-window-bank/1',window.fingerprint,domain.fingerprint,candidate.fingerprint,side,owned.map(c=>c.bounds),metadata.map(m=>m.gridSha256??null)]);current();complete=true;
  return Object.freeze({identity,side,channels:spec.channels,k:spec.k,count:total,admitted,frame:Object.freeze(frame),contexts:Object.freeze(owned),mask:values,positions,metadata:Object.freeze(metadata),sourceSha256:domain.sourceSha256,contextFingerprint:domain.fingerprint,candidateFingerprint:candidate.fingerprint,assertCurrent:current,release(){if(released)return;released=true;for(const m of masks)m.release();credit();}});
 }finally{if(!complete){for(const m of masks)m.release();credit();}}
}

/** Preserve every FP32 feature bit and original channel-major order. Context
 * concatenation is storage only; the correlation uses explicit positions.
 */
export function packCmsegWindowFeatures(plan,features,{budget,signal}={}){
 plan.assertCurrent();requireValue(budget?.reserve&&Array.isArray(features)&&features.length===plan.contexts.length,'Complete native feature contexts required');checkAbort(signal);
 const credit=budget.reserve(4*plan.channels*plan.count);let complete=false,released=false;
 try{
  const input=new Float32Array(plan.channels*plan.count);
  for(const c of plan.contexts){const f=features[c.index];requireValue(f?.data instanceof Float32Array&&same(f.shape??[],[1,plan.channels,plan.side,plan.side])&&f.data.length===plan.channels*c.count&&f.data.every(Number.isFinite),'CMSeg encoder grid, channels or precision changed');
   for(let channel=0;channel<plan.channels;channel++)input.set(f.data.subarray(channel*c.count,(channel+1)*c.count),channel*plan.count+c.offset);
  }
  checkAbort(signal);plan.assertCurrent();complete=true;return{input,release(){if(!released){released=true;credit();}}};
 }finally{if(!complete)credit();}
}
