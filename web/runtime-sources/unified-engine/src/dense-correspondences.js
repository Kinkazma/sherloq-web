import {requireValue,controlCheckpoint} from './errors.js';
import {gatherDenseValues} from './dense-paged-links.js';
import {denseCompactAxes} from './dense-regions.js';
const f=Math.fround;
function interpolate(axis,x){const at=Math.max(0,Math.min(axis.length-1,x)),lo=Math.floor(at),hi=Math.min(axis.length-1,lo+1);return axis[lo]+(axis[hi]-axis[lo])*(at-lo);}

// Reproduce DenseCopyEngine's float32 points and float64 column_stack pairs.
// The input evidence lease remains owned by the caller; this output owns only
// packed correspondence arrays, never alters the raw field or its selection.
export async function packDenseCorrespondences(evidence,image,{budget,signal}={}){
 requireValue(evidence?.fields&&budget?.reserve,'Dense evidence and shared budget required.');
 const p=evidence.params,axes=p.compact&&!p.compare?denseCompactAxes(image.width,image.height,p.guides):null;
 const membersCount=Math.max(1,p.regions.length),estimate=evidence.fields.reduce((n,field)=>n+field.displayRows.length*(768+membersCount*4),axes?8*(image.width+image.height):0),release=budget.reserve(estimate);let released=false;
 try{
  const byPass=new Map();
  for(const field of evidence.fields){
   await controlCheckpoint(signal);const rows=field.displayRows,rowTargets=field.paged?await gatherDenseValues(field.targets,rows,Int32Array,{signal}):Int32Array.from(rows,i=>field.targets[i]),ids=Int32Array.from(new Set([...rows,...rowTargets])).sort(),index=new Map(Array.from(ids,(id,i)=>[id,i]));
   const allowed=field.paged?await gatherDenseValues(field.allowed,ids,Uint8Array,{signal}):null,squared=field.paged?await gatherDenseValues(field.distancesSquared,rows,Float32Array,{signal}):null;
   const points=new Float32Array(ids.length*7),pairs=new Float64Array(rows.length*4),members=new Uint8Array(ids.length*membersCount),owners=new Int32Array(rows.length).fill(field.context.pairSearchRegion),[x0,y0]=field.context.origin;
   for(let i=0;i<ids.length;i++){const id=ids[i];points[i*7]=id%field.width+field.shift+x0;points[i*7+1]=Math.floor(id/field.width)+field.shift+y0;points[i*7+2]=field.pass.patch*(field.pass.method?3:2);if(p.compare){members[i*membersCount]=!!((allowed?allowed[i]:field.allowed[id])&1);members[i*membersCount+1]=!!((allowed?allowed[i]:field.allowed[id])&2);}else members[i*membersCount+field.context.pairSearchRegion]=1;}
   for(let i=0;i<rows.length;i++){
    const row=rows[i],a=index.get(row),b=index.get(rowTargets[i]),ax=points[a*7],ay=points[a*7+1],bx=points[b*7],by=points[b*7+1];
    let dx=axes?interpolate(axes[0],ax)-interpolate(axes[0],bx):f(ax-bx),dy=axes?interpolate(axes[1],ay)-interpolate(axes[1],by):f(ay-by);
    if(p.compare){const sign=(allowed?allowed[a]:field.allowed[row])&1?1:-1;dx=f(dx+sign*evidence.distancePolicy.gap[0]);dy=f(dy+sign*evidence.distancePolicy.gap[1]);}
    const length=axes?Math.sqrt(dx*dx+dy*dy):f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));pairs.set([a,b,f(Math.sqrt(squared?squared[i]:field.distancesSquared[row])),length],i*4);
   }
   let record=byPass.get(field.pass.id);if(!record){record={pass:field.pass,chunks:[],denseCount:0,consistentCount:0,comparisons:0n};byPass.set(field.pass.id,record);}
   const threshold=f(p.threshold*p.threshold);if(field.paged)record.denseCount+=field.denseCount;else for(let i=0;i<field.targets.length;i++){if(i%65536===0)await controlCheckpoint(signal);if(field.targets[i]>=0&&field.distancesSquared[i]<=threshold)record.denseCount++;}
   record.consistentCount+=field.uniqueLinks;record.comparisons+=field.comparisons;record.chunks.push({points,pairs,members,pairSearchRegions:owners,field});
  }
  const passes=[];
  for(const record of byPass.values()){
   const pointCount=record.chunks.reduce((n,c)=>n+c.points.length/7,0),pairCount=record.chunks.reduce((n,c)=>n+c.pairs.length/4,0),points=new Float32Array(pointCount*7),pairs=new Float64Array(pairCount*4),members=new Uint8Array(pointCount*membersCount),owners=new Int32Array(pairCount);let po=0,mo=0;
   for(const chunk of record.chunks){points.set(chunk.points,po*7);members.set(chunk.members,po*membersCount);pairs.set(chunk.pairs,mo*4);for(let i=0;i<chunk.pairs.length/4;i++){pairs[(mo+i)*4]+=po;pairs[(mo+i)*4+1]+=po;}owners.set(chunk.pairSearchRegions,mo);po+=chunk.points.length/7;mo+=chunk.pairs.length/4;}
   passes.push({pass:record.pass,points,pairs,members,membersCount,pairSearchRegions:owners,denseCount:record.denseCount,consistentCount:record.consistentCount,comparisons:record.comparisons});
  }
  return {passes,release(){if(!released){released=true;release();}}};
 }catch(error){release();throw error;}
}
