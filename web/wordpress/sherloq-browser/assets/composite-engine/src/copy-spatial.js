import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
import {copyTreeRanks} from './copy-tree.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';
const f=Math.fround;
export function numpyFloat32Sum(a,start=0,n=a.length){
  if(n<8){let sum=-0;for(let i=0;i<n;i++)sum=f(sum+a[start+i]);return sum;}
  if(n<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]=f(r[j]+a[start+i+j]);let sum=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<n;i++)sum=f(sum+a[start+i]);return sum;}
  let cut=Math.floor(n/2);cut-=cut%8;return f(numpyFloat32Sum(a,start,cut)+numpyFloat32Sum(a,start+cut,n-cut));
}
export async function normalizeSiftDescriptors(descriptors,root=false,{signal,reserveMemory}={}){
  requireValue(descriptors instanceof Float32Array&&descriptors.length%128===0&&typeof reserveMemory==='function','Invalid SIFT normalization input.');
  checkAbort(signal);reserveMemory(descriptors.byteLength+512);const out=new Float32Array(descriptors.length),squared=new Float32Array(128);
  for(let i=0;i<descriptors.length;i+=128){
    for(let j=0;j<128;j++){const value=descriptors[i+j];requireValue(Number.isFinite(value)&&value>=0,'Invalid SIFT descriptor.');squared[j]=root?value:f(value*value);}
    const sum=numpyFloat32Sum(squared),norm=Math.max(f(1e-12),root?sum:f(Math.sqrt(sum)));
    for(let j=0;j<128;j++){const value=f(descriptors[i+j]/norm);out[i+j]=root?f(Math.sqrt(value)):value;}
    if(i%524288===0)await controlCheckpoint(signal);
  }
  checkAbort(signal);return out;
}
export function compactCopyPoints(points,axes){
  const coords=new Float64Array(points.length/7*2);
  const interp=(x,a)=>{if(x<=0)return a[0];if(x>=a.length-1)return a.at(-1);const k=Math.floor(x);return a[k]+(x-k)*(a[k+1]-a[k]);};
  for(let i=0;i<points.length/7;i++)for(let d=0;d<2;d++)coords[i*2+d]=axes?interp(points[i*7+d],axes[d]):points[i*7+d];return coords;
}
const popcount=Uint8Array.from({length:256},(_,i)=>{let n=0;for(;i;i>>>=1)n+=i&1;return n;});
// Exact spatial filtering precedes descriptor distance. A sparse pixel grid
// bounds candidate storage; only accepted pairs are retained, with ROI context.
export async function spatialCopyMatches({points,descriptors,descriptorSize,members,zoneCount,radius,minimum,threshold,binary=false,compare=false,radii=null,gap=[0,0],axes=null},
 {signal,onProgress,reserveMemory,maxPairs=Number.MAX_SAFE_INTEGER}={}){
  requireValue(typeof reserveMemory==='function'&&(points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0,'Invalid sparse points or memory admission.');
  const n=points.length/7;
  requireValue(Number.isSafeInteger(descriptorSize)&&descriptorSize>0&&descriptorSize<=1024&&descriptors instanceof (binary?Uint8Array:Float32Array)&&descriptors.length===n*descriptorSize,'Invalid sparse descriptors.');
  requireValue(Number.isSafeInteger(zoneCount)&&zoneCount>0&&zoneCount<=10000&&members instanceof Uint8Array&&members.length===n*zoneCount&&members.every(x=>x<2)&&(!compare||zoneCount===2),'Invalid sparse memberships.');
  requireValue(Number.isFinite(radius)&&radius>0&&Number.isFinite(minimum)&&minimum>=0&&minimum<=radius&&Number.isFinite(threshold)&&threshold>0&&threshold<=1&&Number.isSafeInteger(maxPairs)&&maxPairs>=0&&maxPairs<=Number.MAX_SAFE_INTEGER,'Invalid sparse matching settings.');
  requireValue(Array.isArray(gap)&&gap.length===2&&gap.every(Number.isFinite)&&(!radii||radii.length===zoneCount&&Array.from(radii).every(x=>Number.isFinite(x)&&x>=0)),'Invalid sparse search distances.');
  requireValue(!axes||axes.length===2&&axes.every(a=>(a instanceof Float32Array||a instanceof Float64Array)&&a.length&&a.every(Number.isFinite)),'Invalid compact coordinates.');
  requireValue(points.every(Number.isFinite)&&descriptors.every(Number.isFinite),'Nonfinite sparse input.');
  reserveMemory(n*208+zoneCount*16+descriptorSize*4+8192);checkAbort(signal);
  const coords=compactCopyPoints(points,axes),queryRadius=radius+Math.sqrt(gap[0]*gap[0]+gap[1]*gap[1]),grid=new Map(),cell=x=>Math.floor(x/queryRadius),address=(x,y)=>x+','+y;
  for(let i=0;i<n;i++){const x=cell(coords[i*2]),y=cell(coords[i*2+1]);requireValue(Number.isSafeInteger(x)&&Number.isSafeInteger(y),'Spatial coordinate range exceeded.');const k=address(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
  const ranks=await copyTreeRanks(coords,{signal,reserveMemory}),rows=new TypedPages(Float64Array,5,reserveMemory),squared=new Float32Array(descriptorSize),round=points instanceof Float32Array&&!axes?f:x=>x;let evaluated=0,checks=0,lastYield=performance.now();
  const yieldIfNeeded=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  try{
  for(let i=0;i<n;i++){
    checkAbort(signal);const x=cell(coords[i*2]),y=cell(coords[i*2+1]),candidates=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get(address(x+dx,y+dy))??[])if(j>i)candidates.push(j);
    candidates.sort((a,b)=>ranks[a]-ranks[b]);
    for(const j of candidates){
      const rawX=coords[j*2]-coords[i*2],rawY=coords[j*2+1]-coords[i*2+1];if(rawX*rawX+rawY*rawY>queryRadius*queryRadius)continue;
      let dx=round(rawX),dy=round(rawY),normRound=round;
      if(compare&&(gap[0]||gap[1])){const direction=members[i*2]&&members[j*2+1]?1:-1;dx-=direction*gap[0];dy-=direction*gap[1];normRound=x=>x;}
      const distance=normRound(Math.sqrt(normRound(normRound(dx*dx)+normRound(dy*dy))));if(distance<minimum||distance>radius)continue;
      const contexts=[];
      if(compare){if(!(members[i*2]&&members[j*2+1]||members[i*2+1]&&members[j*2]))continue;contexts.push(-1);}
      else for(let zone=0;zone<zoneCount;zone++)if(members[i*zoneCount+zone]&&members[j*zoneCount+zone]&&(!radii||distance<=radii[zone]))contexts.push(zone);
      if(!contexts.length)continue;evaluated++;
      let score=0;
      if(binary){for(let k=0;k<descriptorSize;k++)score+=popcount[descriptors[i*descriptorSize+k]^descriptors[j*descriptorSize+k]];score/=descriptorSize*8;}
      else{for(let k=0;k<descriptorSize;k++){const d=f(descriptors[j*descriptorSize+k]-descriptors[i*descriptorSize+k]);squared[k]=f(d*d);}score=f(Math.sqrt(numpyFloat32Sum(squared)));}
      if(score<=threshold)for(const zone of contexts){if(rows.length>=maxPairs)throw new EngineError('MEMORY_LIMIT','Correspondences exceed the explicit caller limit.');rows.push(i,j,score,distance,zone);}
      if(++checks%512===0)await yieldIfNeeded();
    }
    if(i%32===0){onProgress?.((i+1)/Math.max(1,n));await yieldIfNeeded();}
  }
  const {pairs,pairSearchRegions}=finishCorrespondences(rows,{maxPairs});
  checkAbort(signal);onProgress?.(1);return {pairs,pairSearchRegions,candidateComparisons:evaluated,backend:'cpu',preflightExecutions:0};
  }finally{rows.dispose();}
}
