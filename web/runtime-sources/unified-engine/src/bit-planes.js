import "../../runtime-context.js?v=0.14.5";
import {parameters,channelValue,rows,reflect101,rgbPixels,binaryMask} from './pixel-utils.js';
export const planesParams=(p={})=>parameters(p,{channel:0,bit:0,filter:0},{channel:[0,4],bit:[0,7],filter:[0,2]});
export const BIT_PLANE_SEMANTICS='Unfiltered bit plane; filter changes display only.';
export async function renderBitPlane(plane,w,h,filter,hooks={}){
 const out=new Uint8Array(w*h*3);
 await rows(h,hooks,y=>{
  for(let x=0;x<w;x++){
   let value=plane[y*w+x]*255;
   if(filter===1){
    let ones=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)ones+=plane[Math.min(h-1,Math.max(0,y+dy))*w+Math.min(w-1,Math.max(0,x+dx))];
    value=ones>=5?255:0;
   }else if(filter===2){
    let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=plane[reflect101(y+dy,h)*w+reflect101(x+dx,w)]*(dy===0?2:1)*(dx===0?2:1)*255;
    value=(sum+8)>>4;
   }
   const i=(y*w+x)*3;out[i]=out[i+1]=out[i+2]=value;
  }
 });
 return out;
}
export async function bitPlanes(image,p,hooks={}){
 const {width:w,height:h,data:src}=image,plane=new Uint8Array(w*h);
 await rows(h,hooks,y=>{for(let x=0;x<w;x++){const i=y*w+x;plane[i]=(channelValue(src,i*3,p.channel,true)>>p.bit)&1;}});
 const out=await renderBitPlane(plane,w,h,p.filter,hooks);
 return {pixels:rgbPixels(image,out),masks:{plane:binaryMask(image,plane,BIT_PLANE_SEMANTICS)},semantics:'Bit 0 is least significant; RGB norm is truncated then reduced modulo 256, as in the native engine.'};
}
