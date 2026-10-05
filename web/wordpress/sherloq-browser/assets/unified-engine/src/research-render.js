import {INFERNO} from './research-palette.js';
import {requireValue,createCooperator} from './errors.js';
const colors=[[210,90,220],[255,190,70],[50,190,255],[110,220,90]],even=x=>{const lo=Math.floor(x),d=x-lo;return d===.5?lo+(lo%2):Math.round(x);};
/** Original research-panel displays. Rendering never reruns a neural graph. */
export async function renderResearch(image,data,mode=0,{budget,signal,onProgress,origin=[0,0]}={}){
 requireValue([0,1,2].includes(mode),'Unknown research display.');
 const cooperate=createCooperator(signal);
 const {width,height}=image,isCfa=data.metadata.method==='adaptive_cfa',release=budget?.reserve(image.data.byteLength);
 try{
  const out=isCfa?image.data.slice():new Uint8Array(image.data.length),map=isCfa?data.suspicion:data.map;
  const mw=isCfa?data.metadata.valid_shape[1]/data.metadata.block:data.width,mh=isCfa?data.metadata.valid_shape[0]/data.metadata.block:data.height;
  requireValue(map instanceof Float32Array&&map.length===mw*mh,'Invalid research map geometry.');
  for(let y=0;y<height;y++){
   if(y%32===0){await cooperate();onProgress?.({phase:'render',fraction:y/height});}
   for(let x=0;x<width;x++){
    let sx,sy;
    if(isCfa){const [oy,ox]=data.metadata.origin,gx=x+origin[0],gy=y+origin[1];if(gy<oy||gx<ox||gy>=oy+data.metadata.valid_shape[0]||gx>=ox+data.metadata.valid_shape[1])continue;sx=Math.floor((gx-ox)/data.metadata.block);sy=Math.floor((gy-oy)/data.metadata.block);}
    else{sx=Math.floor(x*mw/width);sy=Math.floor(y*mh/height);}
    const index=sy*mw+sx,value=map[index];requireValue(Number.isFinite(value),'Nonfinite research map.');
    const color=isCfa&&mode===2?colors[data.local_grid[index]]:INFERNO.subarray(even(Math.fround(Math.max(0,Math.min(1,value))*255))*3,even(Math.fround(Math.max(0,Math.min(1,value))*255))*3+3);
    requireValue(color?.length===3,'Invalid CFA grid index.');
    for(let c=0;c<3;c++){const at=(y*width+x)*3+c;out[at]=mode===0?even((image.data[at]+color[c])*.5):color[c];}
   }
  }
  return {width,height,format:'rgb8',data:out,release:release??(()=>{})};
 }catch(e){release?.();throw e;}
}
