import "../../runtime-context.js?v=0.14.5";
import {parameters,rows,rgbPixels} from './pixel-utils.js';
export const defectParams=(p={})=>parameters(p,{radius:1,threshold:32,spread:32,kind:0,mode:0},{radius:[1,2],threshold:[1,255],spread:[0,255],kind:[0,2],mode:[0,2]});
// Caller excludes the global image border and supplies the complete halo.
// The same window supplies the median only when a channel is a candidate.
export function defectChannel(src,w,x,y,c,p,window){
 let lo=255,hi=0,k=0,hot=p.kind!==2,dead=p.kind!==1;
 const value=src[(y*w+x)*3+c];
 for(let dy=-p.radius;dy<=p.radius;dy++)for(let dx=-p.radius;dx<=p.radius;dx++){
  const neighbor=src[((y+dy)*w+x+dx)*3+c];window[k++]=neighbor;
  if(dx||dy){
   lo=Math.min(lo,neighbor);hi=Math.max(hi,neighbor);
   if(hi-lo>p.spread)return 0;
   if(value-hi<p.threshold)hot=false;
   if(lo-value<p.threshold)dead=false;
   // Adding neighbors cannot restore a failed inequality or shrink the range.
   if(!hot&&!dead)return 0;
  }
 }
 return hot?1:dead?2:0;
}
export async function defectPixels(image,p,hooks={}){
 const {width:w,height:h,data:src}=image,n=w*h,flags=new Uint8Array(src.length),pixelMask=new Uint8Array(n),median=new Uint8Array(src.length),out=p.mode===1?new Uint8Array(src.length):src.slice();
 const window=new Uint8Array((2*p.radius+1)**2);let count=0,channels=0;
 await rows(h,hooks,y=>{
  if(y<p.radius||y>=h-p.radius)return;
  for(let x=p.radius;x<w-p.radius;x++){
   const i=y*w+x;
   for(let c=0;c<3;c++){
    const flag=defectChannel(src,w,x,y,c,p,window);
    if(flag){window.sort();median[i*3+c]=window[window.length>>1];flags[i*3+c]=flag;pixelMask[i]|=flag;channels++;if(p.mode===2)out[i*3+c]=median[i*3+c];}
   }
   if(pixelMask[i]){
    count++;if(p.mode!==2){out[i*3]=(pixelMask[i]&1)?255:0;out[i*3+1]=0;out[i*3+2]=(pixelMask[i]&2)?255:0;}
   }
  }
 });
 // Compact integer rows preserve native CSV order y,x,B,G,R without retaining a second source image.
 const candidates=new Uint32Array(channels*6);let offset=0;
 await rows(h,hooks,y=>{for(let x=0;x<w;x++)for(let c=2;c>=0;c--){const i=(y*w+x)*3+c;if(flags[i]){candidates.set([x,y,c,flags[i],src[i],median[i]],offset);offset+=6;}}});
 return {pixels:rgbPixels(image,out),masks:{candidates:{width:w,height:h,format:'mask8',data:pixelMask,range:[0,3],semantics:'Bit 1=hot, bit 2=dead; 3=both across RGB channels; border excluded.'}},data:{flags:{width:w,height:h,format:'rgb-flags8',data:flags,channelOrder:'RGB'},count,candidateColumns:['x','y','rgbChannelIndex','flag','originalValue','replacementValue'],candidates},semantics:'Isolated pixel candidates, not a diagnosis of sensor defects. Correction replaces candidate channels only; original stays unchanged.'};
}
