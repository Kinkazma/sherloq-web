import {parameters,rows,rgbPixels} from './pixel-utils.js';
export const statsParams=(p={})=>parameters(p,{mode:'min',inclusive:false},{},{mode:['min','avg','max']},['inclusive']);
export async function pixelStats(image,p,hooks={}){
 const out=new Uint8Array(image.data.length),src=image.data;
 await rows(image.height,hooks,y=>{
  for(let i=y*image.width*3,end=i+image.width*3;i<end;i+=3){
   // Native assignments run B,G,R; the last match wins (R > G > B).
   let selected=-1;
   for(let c=2;c>=0;c--){
    const a=src[i+(c+1)%3],b=src[i+(c+2)%3],v=src[i+c],lo=Math.min(a,b),hi=Math.max(a,b);
    const match=p.mode==='min'?(p.inclusive?v<=lo:v<lo):p.mode==='max'?(p.inclusive?v>=hi:v>hi):(p.inclusive?lo<=v&&v<=hi:lo<v&&v<hi);
    if(match)selected=c;
   }
   if(selected>=0)out[i+selected]=255;
  }
 });
 return {pixels:rgbPixels(image,out),semantics:'Channel rank; inclusive ties prefer red, then green, then blue.'};
}
