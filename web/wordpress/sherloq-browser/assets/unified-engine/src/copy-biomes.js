import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// Exact connected components of paired endpoints, including reversed pairs.
// A sparse 4-D grid stores only unvisited links: no pairwise adjacency matrix.
export async function pairedBiomes(points,pairs,tolerance,
  {signal,reserveMemory,pairSearchRegions=null,onProgress}={}){
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&pairs instanceof Float64Array&&pairs.length%4===0,'Invalid copy/move points or pairs.');
  requireValue(Number.isFinite(tolerance)&&tolerance>=0,'Invalid biome tolerance.');
  requireValue(typeof reserveMemory==='function','Biome grouping requires shared memory admission.');
  const count=pairs.length/4,pointCount=points.length/7;
  requireValue(pairSearchRegions===null||pairSearchRegions instanceof Int32Array&&pairSearchRegions.length===count,'Invalid biome search contexts.');
  reserveMemory(count*1024+pointCount*8+4096);checkAbort(signal);
  const float32=points instanceof Float32Array,round=float32?Math.fround:x=>x;
  const a=new Float64Array(count*2),b=new Float64Array(count*2),remaining=new Uint8Array(count).fill(1);
  const cells=new Map(),keys=new Array(count*2),queue=new Uint32Array(count),groups=[];
  const coordinate=x=>tolerance===0?x:Math.floor(x/(tolerance*Math.sqrt(2)));
  const key=(zone,v)=>zone+':'+v.join(',');
  const put=(id,side,zone,coords)=>{
    const cell=coords.map(coordinate);
    requireValue(cell.every(x=>Number.isFinite(x)&&(tolerance===0||Number.isSafeInteger(x))),'Biome coordinates exceed spatial-index range.');
    const address=key(zone,cell);keys[id*2+side]=address;
    let bucket=cells.get(address);if(!bucket){bucket=new Set();cells.set(address,bucket);}bucket.add(id*2+side);
  };
  let stamp=performance.now();
  for(let i=0;i<count;i++){
    for(let side=0;side<2;side++){
      const id=pairs[i*4+side];requireValue(Number.isSafeInteger(id)&&id>=0&&id<pointCount,'Invalid pair point index.');
      const x=points[id*7],y=points[id*7+1];requireValue(Number.isFinite(x)&&Number.isFinite(y),'Nonfinite endpoint.');
      (side?b:a).set([x,y],i*2);
    }
    const zone=pairSearchRegions?.[i]??0,normal=[a[i*2],a[i*2+1],b[i*2],b[i*2+1]];
    put(i,0,zone,normal);put(i,1,zone,[normal[2],normal[3],normal[0],normal[1]]);
    if(i%1024===0&&performance.now()-stamp>=8){onProgress?.(.2*i/Math.max(1,count));await controlCheckpoint(signal);stamp=performance.now();}
  }
  const remove=id=>{remaining[id]=0;for(let side=0;side<2;side++){const address=keys[id*2+side],bucket=cells.get(address);if(bucket){bucket.delete(id*2+side);if(!bucket.size)cells.delete(address);}}};
  const offsets=tolerance===0?[[0,0,0,0]]:[];
  if(tolerance>0)for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++)for(let l=-1;l<=1;l++)offsets.push([i,j,k,l]);
  let steps=0;
  for(let seed=0;seed<count;seed++){
    if(!remaining[seed])continue;
    let first=0,last=1;queue[0]=seed;remove(seed);
    while(first<last){
      const i=queue[first++],zone=pairSearchRegions?.[i]??0,xy=[a[i*2],a[i*2+1],b[i*2],b[i*2+1]],base=xy.map(coordinate);
      for(const offset of offsets){
        const bucket=cells.get(key(zone,base.map((v,d)=>v+offset[d])));if(!bucket)continue;
        for(const entry of bucket){
          const j=entry>>>1,reverse=entry&1,u=reverse?b:a,v=reverse?a:b;
          const delta=[u[j*2]-xy[0],u[j*2+1]-xy[1],v[j*2]-xy[2],v[j*2+1]-xy[3]];
          // Native cKDTree's radius query is double precision before the NumPy
          // endpoint tests, which retain the packed point dtype.
          if(Math.sqrt(delta.reduce((s,x)=>s+x*x,0))>tolerance*Math.sqrt(2))continue;
          const d=delta.map(round),norm=(x,y)=>round(Math.sqrt(round(round(x*x)+round(y*y))));
          if(norm(d[0],d[1])>tolerance||norm(d[2],d[3])>tolerance)continue;
          remove(j);queue[last++]=j;
        }
      }
      if(++steps%64===0&&performance.now()-stamp>=8){onProgress?.(.2+.8*steps/Math.max(1,count));await controlCheckpoint(signal);stamp=performance.now();}
    }
    const rows=queue.slice(0,last).sort();let x=0,y=0;
    for(const row of rows){x=round(x+Math.min(a[row*2],b[row*2]));y=round(y+Math.min(a[row*2+1],b[row*2+1]));}
    groups.push({rows,zone:pairSearchRegions?.[seed]??0,x:round(x/last),y:round(y/last)});
    checkAbort(signal);
  }
  groups.sort((a,b)=>a.zone-b.zone||a.x-b.x||a.y-b.y||b.rows.length-a.rows.length);
  onProgress?.(1);return groups.map(g=>g.rows);
}
