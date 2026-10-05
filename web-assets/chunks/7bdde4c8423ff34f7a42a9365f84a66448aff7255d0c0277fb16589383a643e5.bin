import "../../runtime-context.js?v=0.14.5";
import {TypedPages} from './m3-typed-pages.js';
import {copyTreeRanks} from './copy-tree.js';
import {compactCopyPoints} from './copy-spatial.js';
import {requireValue,EngineError,controlCheckpoint} from './errors.js';
// Candidate ordering is the native cKDTree leaf order, before neural attention.
export async function sparseGlueCandidates({points,members,zoneCount,compare=false,radius,minimum,radii=null,gap=[0,0],axes=null},zone,{signal,reserveMemory}={}){
 const n=points.length/7;reserveMemory(n*32);const a=[],b=[];for(let i=0;i<n;i++){if(members[i*zoneCount+(compare?0:zone)])a.push(i);if(members[i*zoneCount+(compare?1:zone)])b.push(i);}
 reserveMemory((a.length+b.length)*144+8192);
 if(!a.length||!b.length)return null;
 const coords=compactCopyPoints(points,axes),x=new Float64Array(a.length*2),y=new Float64Array(b.length*2);
 for(let i=0;i<a.length;i++)x.set(coords.subarray(a[i]*2,a[i]*2+2),i*2);
 for(let i=0;i<b.length;i++)for(let d=0;d<2;d++)y[i*2+d]=compare?points[b[i]*7+d]-gap[d]:coords[b[i]*2+d];
 const r=compare||!radii?radius:radii[zone];if(r<=0)return null;
 const ranks=await copyTreeRanks(y,{signal,reserveMemory}),grid=new Map(),cell=v=>Math.floor(v/r),address=(xx,yy)=>xx+','+yy;
 for(let i=0;i<b.length;i++){const k=address(cell(y[i*2]),cell(y[i*2+1]));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
 const builder=new TypedPages(Int32Array,2,reserveMemory);
 try{
 for(let i=0;i<a.length;i++){
  const cx=cell(x[i*2]),cy=cell(x[i*2+1]),ids=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get(address(cx+dx,cy+dy))??[]){const xx=y[j*2]-x[i*2],yy=y[j*2+1]-x[i*2+1],d=Math.sqrt(xx*xx+yy*yy);if(a[i]!==b[j]&&d>=minimum&&d<=r)ids.push(j);}
  ids.sort((a,b)=>ranks[a]-ranks[b]);for(const j of ids)builder.push(i,j);
  if(i%64===0)await controlCheckpoint(signal);
 }
 if(!builder.length)return null;const edges=builder.finish();return {a,b,x,y,edges,zone:compare?-1:zone};
 }finally{builder.dispose();}
}
export function selectSparseGlue(job,confidence,threshold){
 requireValue(confidence instanceof Float32Array&&confidence.length===job.edges.length/2&&confidence.every(Number.isFinite),'Invalid learned confidence output.');
 // Below-threshold edges follow every selectable edge in the descending sort.
 // Their seen flags can never affect a later accepted pair. Retain the full
 // attention domain, then sort only this mathematically equivalent suffix cut.
 const cut=Math.fround(1-threshold);let count=0;for(const value of confidence)if(value>=cut)count++;
 const order=new Uint32Array(count);for(let i=0,at=0;i<confidence.length;i++)if(confidence[i]>=cut)order[at++]=i;
 const {edges,a,b,x,y}=job;order.sort((i,j)=>confidence[j]-confidence[i]||edges[i*2]-edges[j*2]||edges[i*2+1]-edges[j*2+1]);const seenA=new Uint8Array(a.length),seenB=new Uint8Array(b.length),unique=new Map();
 for(const e of order){const i=edges[e*2],j=edges[e*2+1],keep=!seenA[i]&&!seenB[j];seenA[i]=seenB[j]=1;if(!keep||confidence[e]<Math.fround(1-threshold))continue;const source=Math.min(a[i],b[j]),target=Math.max(a[i],b[j]),key=source+','+target;if(!unique.has(key)){const dx=x[i*2]-y[j*2],dy=x[i*2+1]-y[j*2+1];unique.set(key,[source,target,Math.fround(1-confidence[e]),Math.sqrt(dx*dx+dy*dy)]);}}
 // np.unique(axis=0) returns endpoint lexicographic order, after selecting the
 // lowest score by stable sorting. Preserve independent zone provenance.
 return [...unique.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
