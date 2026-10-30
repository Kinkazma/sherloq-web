import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// Exact connected components of paired endpoints, including reversed pairs.
// A sparse 4-D grid stores only unvisited links: no pairwise adjacency matrix.
export async function pairedBiomes(points,pairs,tolerance,
  {signal,reserveMemory,pairSearchRegions=null,onProgress,packedIndex=false}={}){
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
  let packing=null;
  // A lossless physical index for bounded integer cells. Guard the complete
  // mixed-radix range, including every +/-1 neighbor, before using Number keys.
  // Wide/unbounded cells and exact-coordinate tolerance0 retain the old strings.
  if(packedIndex&&tolerance>0&&count){
    let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity,loZone=Infinity,hiZone=-Infinity,eligible=true,scanStamp=performance.now();
    for(let row=0;row<count;row++){
      const zone=pairSearchRegions?.[row]??0;loZone=Math.min(loZone,zone);hiZone=Math.max(hiZone,zone);
      for(let side=0;side<2;side++){
        const id=pairs[row*4+side];if(!Number.isSafeInteger(id)||id<0||id>=pointCount){eligible=false;break;}
        const x=coordinate(points[id*7]),y=coordinate(points[id*7+1]);if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)){eligible=false;break;}
        loX=Math.min(loX,x);hiX=Math.max(hiX,x);loY=Math.min(loY,y);hiY=Math.max(hiY,y);
      }
      if(!eligible)break;
      if(row%1024===0){checkAbort(signal);if(performance.now()-scanStamp>=8){await controlCheckpoint(signal);scanStamp=performance.now();}}
    }
    const nx=hiX-loX+3,ny=hiY-loY+3,plane=nx*ny,space=plane*plane,zones=hiZone-loZone+1;
    if(eligible&&[loX-1,loY-1,hiX+1,hiY+1,nx,ny,plane,space,space*zones].every(Number.isSafeInteger)&&nx>0&&ny>0&&space*zones<=Number.MAX_SAFE_INTEGER)
      packing={loX:loX-1,loY:loY-1,loZone,strides:[ny*plane,plane,ny,1],space};
  }
  const key=(zone,v)=>packing?(zone-packing.loZone)*packing.space+(v[0]-packing.loX)*packing.strides[0]+(v[1]-packing.loY)*packing.strides[1]+(v[2]-packing.loX)*packing.strides[2]+(v[3]-packing.loY):zone+':'+v.join(',');
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
  if(tolerance>0)for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++)for(let l=-1;l<=1;l++)offsets.push(packing?i*packing.strides[0]+j*packing.strides[1]+k*packing.strides[2]+l:[i,j,k,l]);
  let steps=0;
  for(let seed=0;seed<count;seed++){
    if(!remaining[seed])continue;
    let first=0,last=1;queue[0]=seed;remove(seed);
    while(first<last){
      const i=queue[first++],zone=pairSearchRegions?.[i]??0,xy=[a[i*2],a[i*2+1],b[i*2],b[i*2+1]],base=xy.map(coordinate);
      const packedBase=packing?key(zone,base):null;
      for(const offset of offsets){
        const bucket=cells.get(packing?packedBase+offset:key(zone,base.map((v,d)=>v+offset[d])));if(!bucket)continue;
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
