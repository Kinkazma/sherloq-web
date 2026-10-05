import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {roundEven} from './pixel-utils.js';
import {remapReflectedSiftPoints} from './sift-g2nn.js';

export function siftRegionPlan(width,height,regions=[],excluded=[],{reflected=false,reserveMemory}={}){
  requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&width<=2**30&&height<=2**30,'Invalid SIFT image dimensions.');
  requireValue(typeof reflected==='boolean'&&Array.isArray(regions)&&Array.isArray(excluded)&&typeof reserveMemory==='function','SIFT region planning requires shared admission.');
  for(const polygon of [...regions,...excluded])requireValue(Array.isArray(polygon)&&polygon.length>=3&&polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=2**30)),'Invalid SIFT polygon.');
  const vertices=regions.reduce((n,p)=>n+p.length,0),exclusionVertices=excluded.reduce((n,p)=>n+p.length,0);
  reserveMemory((vertices*2+exclusionVertices*(Math.max(1,regions.length)+1))*64+Math.max(1,regions.length)*512);
  const inFrame=polygons=>polygons.map(poly=>poly.map(([x,y])=>[reflected?width-1-x:x,y]));
  const framed=inFrame(regions),exclusions=inFrame(excluded),jobs=[];
  for(let zone=0;zone<Math.max(1,regions.length);zone++){
    const poly=framed[zone],xs=poly?.map(p=>p[0]),ys=poly?.map(p=>p[1]);
    const x=poly?Math.max(0,Math.floor(xs.reduce((a,b)=>Math.min(a,b),Infinity))):0,y=poly?Math.max(0,Math.floor(ys.reduce((a,b)=>Math.min(a,b),Infinity))):0;
    const right=poly?Math.min(width,Math.ceil(xs.reduce((a,b)=>Math.max(a,b),-Infinity))+1):width,bottom=poly?Math.min(height,Math.ceil(ys.reduce((a,b)=>Math.max(a,b),-Infinity))+1):height;
    if(right<=x||bottom<=y)continue;
    const local=polygons=>polygons.map(polygon=>polygon.map(([px,py])=>[px-x,py-y]));
    jobs.push({zone,rectangle:{x,y,width:right-x,height:bottom-y},regions:poly?local([poly]):[],excluded:local(exclusions),scale:(right-x+bottom-y)/2<1024?4:1,reflected});
  }
  return {zoneCount:Math.max(1,regions.length),jobs};
}

// Unique original-image centres, first original index, then stable response.
// NumPy retains point dtype. Native nonempty pack_keypoints is float64.
export async function selectUniqueSift(points,descriptors,limit,{reserveMemory,signal}={}){
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&descriptors instanceof Float32Array&&descriptors.length===points.length/7*128,'Invalid extracted SIFT arrays.');
  requireValue(Number.isSafeInteger(limit)&&limit>=100&&limit<=20000&&typeof reserveMemory==='function','SIFT requires native point limit and shared admission.');
  const count=points.length/7;reserveMemory(count*160+Math.min(count,limit)*(512+7*points.BYTES_PER_ELEMENT));checkAbort(signal);
  const round=points instanceof Float32Array?Math.fround:x=>x,centre=x=>round(round(roundEven(round(x*1e6)))/1e6),seen=new Set(),ids=[];
  for(let i=0;i<count;i++){
    const x=points[i*7],y=points[i*7+1],response=points[i*7+4];requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(response),'Nonfinite SIFT feature.');
    const key=centre(x)+','+centre(y);if(!seen.has(key)){seen.add(key);ids.push(i);}
    if(i%4096===0)await controlCheckpoint(signal);
  }
  ids.sort((a,b)=>points[b*7+4]-points[a*7+4]||a-b);ids.length=Math.min(limit,ids.length);
  const selected=new points.constructor(ids.length*7),desc=new Float32Array(ids.length*128);
  ids.forEach((id,i)=>{selected.set(points.subarray(id*7,id*7+7),i*7);desc.set(descriptors.subarray(id*128,id*128+128),i*128);});
  checkAbort(signal);return {points:selected,descriptors:desc,totalFeatures:count};
}

export function projectSiftRegion(points,job,imageWidth,zoneCount,{reserveMemory}={}){
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&Number.isSafeInteger(zoneCount)&&zoneCount>0&&Number.isSafeInteger(job?.zone)&&job.zone>=0&&job.zone<zoneCount&&typeof reserveMemory==='function'&&job.rectangle&&Number.isFinite(job.rectangle.x)&&Number.isFinite(job.rectangle.y),'Invalid SIFT projection.');
  reserveMemory(points.byteLength*(job.reflected?2:1)+points.length/7*zoneCount);
  let output=points.slice();const round=points instanceof Float32Array?Math.fround:x=>x;
  for(let i=0;i<output.length;i+=7){output[i]=round(output[i]+job.rectangle.x);output[i+1]=round(output[i+1]+job.rectangle.y);}
  if(job.reflected)output=remapReflectedSiftPoints(output,imageWidth);
  const members=new Uint8Array(points.length/7*zoneCount);for(let i=0;i<points.length/7;i++)members[i*zoneCount+job.zone]=1;
  return {points:output,members};
}
