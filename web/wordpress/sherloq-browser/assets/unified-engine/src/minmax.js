import "../../runtime-context.js?v=0.14.5";
import {parameters,channelValue,rows,rgbPixels,binaryMask,normalizeU8} from './pixel-utils.js';
export const minmaxParams=(p={})=>parameters(p,{channel:0,minimum:1,maximum:0,filter:0},{channel:[0,4],minimum:[0,4],maximum:[0,4],filter:[0,5]});
export const MINMAX_PALETTE=[[255,0,0],[0,255,0],[0,0,255],[255,255,255],[0,0,0]];
async function density(mask,w,h,radius,hooks){
 const values=new Float32Array(w*h),block=radius*2+1;
 if(w<=radius||h<=radius)return new Uint8Array(w*h);
 for(let y=0;y<h;y+=block){
  await rows(1,hooks,()=>{
   for(let x=0;x<w;x+=block){
    const bh=Math.min(block,h-y),bw=Math.min(block,w-x);if(bh<=radius||bw<=radius)continue;
    let count=0;for(let dy=0;dy<bh;dy++)for(let dx=0;dx<bw;dx++)count+=mask[(y+dy)*w+x+dx];
    const q=count/(bh*bw),value=Math.fround(Math.sqrt(q*(1-q)));
    for(let dy=0;dy<bh;dy++)values.fill(value,(y+dy)*w+x,(y+dy)*w+x+bw);
   }
  });
 }
 return normalizeU8(values,127);
}
export async function localExtrema(image,p,hooks={}){
 const {width:w,height:h,data:src}=image,n=w*h,values=new Uint32Array(n),low=new Uint8Array(n),high=new Uint8Array(n);
 await rows(h,hooks,y=>{for(let x=0;x<w;x++){const i=y*w+x;values[i]=channelValue(src,i*3,p.channel);}});
 await rows(h,hooks,y=>{
  if(y===0||y===h-1)return;
  for(let x=1;x<w-1;x++){
   const i=y*w+x;let lo=Infinity,hi=-Infinity;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const v=values[i+dy*w+dx];lo=Math.min(lo,v);hi=Math.max(hi,v);}
   low[i]=Number(values[i]<lo);high[i]=Number(values[i]>hi);
  }
 });
 return {low,high};
}
export async function minmax(image,p,hooks={}){
 const {width:w,height:h,data:src}=image,out=new Uint8Array(src.length),{low,high}=await localExtrema(image,p,hooks);
 if(!p.filter){
  await rows(h,hooks,y=>{for(let x=0;x<w;x++){const i=y*w+x;if(low[i]||high[i])out.set(MINMAX_PALETTE[low[i]?p.minimum:p.maximum],i*3);}});
 }else{
  for(const [mask,color] of [[low,p.minimum],[high,p.maximum]]){
   if(color===4)continue;const d=await density(mask,w,h,p.filter+3,hooks);
   await rows(h,hooks,y=>{for(let x=0;x<w;x++){const i=y*w+x;for(let c=0;c<3;c++)if(color===c||color===3)out[i*3+c]+=d[i];}});
  }
  out.set(normalizeU8(out));
 }
 return {pixels:rgbPixels(image,out),masks:{minimum:binaryMask(image,low,'Strict minimum relative to eight neighbors; border excluded.'),maximum:binaryMask(image,high,'Strict maximum relative to eight neighbors; border excluded.')},semantics:'Local extrema; density display never changes the underlying masks.'};
}
