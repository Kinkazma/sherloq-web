import {createCloningGroupGrid} from './cloning-group-grid.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
import {roundEven} from './pixel-utils.js';

import {TypedPages} from './m3-typed-pages.js';
const indexBuilder=account=>new TypedPages(Uint32Array,1,account);
export async function cloningGeometry(points,raw,distance,normScalar,{signal,onProgress,account=()=>{},pairCache='auto',pool=null,poolMinimum=4096}={}){
  let reported=0;const progress=f=>{reported=Math.max(reported,f);onProgress?.(reported);};
  const count=raw.length/3,pointCount=points.length/7;
  account(count*12);const displacements=new Float64Array(count),indices=new Uint32Array(count);let kept=0,lastYield=performance.now();
  const yieldIfNeeded=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  for(let i=0;i<count;i++){
    const a=raw[i*3]*7,b=raw[i*3+1]*7,dx=points[a]-points[b],dy=points[a+1]-points[b+1],d=Math.sqrt(dx*dx+dy*dy);
    if(d>distance){indices[kept]=i;displacements[kept++]=d;}
    if(i%4096===0)await yieldIfNeeded();
  }
  // The Set for one row holds numeric pair ids; reserve its worst row capacity.
  account(kept*(24+4+64));const matches=new Float64Array(kept*3),lengths=new Uint32Array(kept);
  for(let i=0;i<kept;i++)matches.set(raw.subarray(indices[i]*3,indices[i]*3+3),i*3);
  const norm=(a,b)=>{
    const dx=points[a*7]-points[b*7],dy=points[a*7+1]-points[b*7+1],d=Math.sqrt(dx*dx+dy*dy);
    return Math.abs(d-distance)<=Math.max(1,distance)*1e-12?normScalar(dx,dy):d;
  };
  // Each predicate depends only on the immutable points and distance. Cache
  // the exact boolean, including the native fused boundary norm, not a rounded
  // distance. Admission may choose the low-memory path without changing data.
  let near=null,strategy='direct';
  if(pairCache==='on'||pairCache==='auto'&&kept>=1024&&pointCount<=2048){
    try{account(pointCount*pointCount);near=new Uint8Array(pointCount*pointCount);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
    if(near){
      strategy='point-pair-cache';
      for(let a=0;a<pointCount;a++){
        for(let b=a+1;b<pointCount;b++){const d=norm(a,b);near[a*pointCount+b]=near[b*pointCount+a]=d>0&&d<distance?1:0;}
        if(a%32===0)await yieldIfNeeded();
      }
    }
  }
  let scheduling;
  if(near&&pool&&kept>=poolMinimum){
    const parallel=await pool.run({matches,displacements:displacements.subarray(0,kept),near,pointCount,distance},{signal,onProgress:progress,account});
    scheduling=parallel.metrics;
    if(parallel.groups)return {matches,lengths:parallel.lengths,groups:parallel.groups,strategy,metrics:scheduling};
  }
  if(near){
    const grouped=await cloningGroupRows({matches,displacements,near,pointCount,distance},0,kept,{signal,onProgress:progress,account});
    return {matches,...grouped,strategy,metrics:scheduling};
  }
  let grid;
  if(distance>0&&(pairCache==='grid'||pairCache==='auto'&&pointCount>2048&&kept>=1024))try{grid=await createCloningGroupGrid(points,matches,distance,{account,signal});strategy='endpoint-grid';}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
  const builder=indexBuilder(account);let candidatesVisited=0;
  try{for(let i=0;i<kept;i++){
    const query=matches[i*3],train=matches[i*3+1],seen=new Set([query*pointCount+train]);let length=1;builder.push(i);
    const candidates=grid?.query(i),candidateCount=candidates?.length??kept-i-1;
    for(let k=0;k<candidateCount;k++){
      const j=candidates?candidates[k]:i+1+k;candidatesVisited++;if(k%4096===0)await yieldIfNeeded();
      if(Math.abs(displacements[j]-displacements[i])>distance)continue;
      const q=matches[j*3],t=matches[j*3+1];if(q===train&&t===query)continue;
      const aa=norm(query,q),bb=norm(train,t),ab=norm(query,t),ba=norm(train,q);
      if(!((aa>0&&aa<distance&&bb>0&&bb<distance)||(ab>0&&ab<distance&&ba>0&&ba<distance)))continue;
      if(!seen.has(t*pointCount+q)){builder.push(j);length++;seen.add(q*pointCount+t);}
    }
    lengths[i]=length;
    if(i%64===0){await yieldIfNeeded();progress((i+1)/kept);}
  }
  checkAbort(signal);progress(1);return {matches,lengths,groups:builder.finish(),strategy,metrics:{cloningGroupWorkers:1,cloningGroupCandidateRows:candidatesVisited,cloningGroupAllPairRows:kept*(kept-1)/2}};
  }finally{grid?.dispose();builder.dispose();}
}
// Independent rows preserve global match indices and original candidate order.
// Workers receive the already-qualified boolean table, so need no codec, ORB
// pyramid or WASM heap. Bounded row batches keep their outputs predictable.
export async function cloningGroupRows({matches,displacements,near,pointCount,distance},first,last,{signal,onProgress,account=()=>{}}={}){
  const kept=matches.length/3;account((last-first)*4+kept*64);
  const lengths=new Uint32Array(last-first),builder=indexBuilder(account);let lastYield=performance.now();
  const yieldIfNeeded=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  for(let i=first;i<last;i++){
    const query=matches[i*3],train=matches[i*3+1],seen=new Set([query*pointCount+train]);let length=1;builder.push(i);
    for(let j=i+1;j<kept;j++){
      if(j%4096===0)await yieldIfNeeded();
      if(Math.abs(displacements[j]-displacements[i])>distance)continue;
      const q=matches[j*3],t=matches[j*3+1];if(q===train&&t===query)continue;
      if(!((near[query*pointCount+q]&&near[train*pointCount+t])||(near[query*pointCount+t]&&near[train*pointCount+q])))continue;
      if(!seen.has(t*pointCount+q)){builder.push(j);length++;seen.add(q*pointCount+t);}
    }
    lengths[i-first]=length;
    if(i%64===0){await yieldIfNeeded();onProgress?.((i-first+1)/(last-first));}
  }
  checkAbort(signal);onProgress?.(1);return {lengths,groups:builder.finish()};
}
export function* cloningGroupIndices(geometry,minimum){
  let offset=0;
  for(const length of geometry.lengths){if(length>=minimum)for(let i=offset;i<offset+length;i++)yield geometry.groups[i];offset+=length;}
}
function matchAngle(points,matches,index){
  const at=index*3,a=matches[at]*7,b=matches[at+1]*7;
  let angle=Math.atan2(Math.trunc(points[b+1])-Math.trunc(points[a+1]),Math.trunc(points[b])-Math.trunc(points[a]));
  if(angle<0)angle+=Math.PI;return angle;
}
export async function cloningAngles(points,geometry,minimum,{signal,account=()=>{}}={}){
  let count=0;for(const length of geometry.lengths)if(length>=minimum)count+=length;
  account(count*4);const angles=new Float32Array(count);let at=0;
  for(const index of cloningGroupIndices(geometry,minimum)){
    angles[at++]=matchAngle(points,geometry.matches,index);
    if(at%8192===0)await controlCheckpoint(signal);
  }
  checkAbort(signal);return angles;
}
export function cloningCommand(points,matches,index,radius,out,offset){
  const at=index*3,a=matches[at]*7,b=matches[at+1]*7,angle=matchAngle(points,matches,index);
  out[offset]=Math.trunc(points[a]);out[offset+1]=Math.trunc(points[a+1]);out[offset+2]=Math.trunc(points[b]);out[offset+3]=Math.trunc(points[b+1]);
  out[offset+4]=roundEven(points[a+2]);out[offset+5]=roundEven(points[b+2]);out[offset+6]=Math.trunc(angle/Math.PI*180)&255;out[offset+7]=Math.trunc(matches[at+2]/radius*255)&255;
}
function sum32(a,start,length){
  const f=Math.fround;
  if(length<8){let s=-0;for(let i=0;i<length;i++)s=f(s+a[start+i]);return s;}
  if(length<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i+7<length;i+=8)for(let k=0;k<8;k++)r[k]=f(r[k]+a[start+i+k]);let s=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<length;i++)s=f(s+a[start+i]);return s;}
  let cut=Math.floor(length/2);cut-=cut%8;return f(sum32(a,start,cut)+sum32(a,start+cut,length-cut));
}
const reduce32=a=>{let value=0;for(let i=0;i<a.length;i+=8192)value=Math.fround(value+sum32(a,i,Math.min(8192,a.length-i)));return value;};
export function cloningAngleStd(a,{account=()=>{}}={}){
  if(!a.length)return null;
  account(a.byteLength);const f=Math.fround,mean=f(reduce32(a)/a.length),delta=Float32Array.from(a,v=>f(v-mean));
  for(let i=0;i<delta.length;i++)delta[i]=f(delta[i]*delta[i]);
  return f(Math.sqrt(f(reduce32(delta)/delta.length)));
}
