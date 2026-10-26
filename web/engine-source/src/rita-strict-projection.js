import {requireValue,checkAbort} from './errors.js';
import {displayGeometry} from './display-sampling.js';

/** Only Original-coordinate display/scalar projection. The packed fields are
 * never treated as an envelope raster. Unadmitted pixels remain NaN, and each
 * logits channel retains its native CHW position across the context union. */
export async function readRitaStrictProjection({width,height,pixels,fragments,field='map',channel=0,readArray,windowBytes=4*1024**2},tile,{signal}={}){
 const channels=field==='logits'?4:1;requireValue(['map','official_mask','labels','logits'].includes(field)&&Number.isInteger(channel)&&channel>=0&&channel<channels&&Number.isSafeInteger(pixels)&&pixels>0,'Invalid native RITA projection field.');
 const g=displayGeometry({width,height},tile),out=new Float32Array(g.width*g.height).fill(NaN),limit=Math.floor(Math.min(4*1024**2,windowBytes)/4);requireValue(limit>0,'A bounded native RITA numeric window is required.');let count=0;
 for(let index=0;index<fragments.length;index++){
  checkAbort(signal);const f=fragments[index],r=f.rect;
  requireValue(f.index===index&&f.offset===count&&f.count===r.width*r.height&&f.evaluable===true&&['x','y','width','height'].every(k=>Number.isSafeInteger(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=width&&r.y+r.height<=height,'Native RITA context coordinates or offsets changed.');count+=f.count;
  const first=Math.max(0,Math.ceil((r.x-g.x)/g.step)),last=Math.min(g.width,Math.ceil((r.x+r.width-g.x)/g.step)),columns=Math.max(1,Math.floor((limit-1)/g.step)+1);
  if(last<=first)continue;
  for(let y=Math.max(0,Math.ceil((r.y-g.y)/g.step));y<g.height&&g.y+y*g.step<r.y+r.height;y++)for(let x=first;x<last;x+=columns){
   checkAbort(signal);const n=Math.min(columns,last-x),length=(n-1)*g.step+1,offset=channel*pixels+f.offset+(g.y+y*g.step-r.y)*r.width+g.x+x*g.step-r.x,values=await readArray(field,offset,length,{signal});
   requireValue(values instanceof Float32Array&&values.length===length&&values.every(Number.isFinite),'Native RITA projection lost finite modeled observations.');for(let xx=0;xx<n;xx++)out[y*g.width+x+xx]=values[xx*g.step];
  }
 }
 requireValue(count===pixels,'Native RITA projection population changed.');checkAbort(signal);return out;
}
