import "../../runtime-context.js?v=0.14.5";
// Pillow RGB8 bilinear resampling, 22-bit coefficients and per-pass rounding.
// Adapted from PIL/Pillow Resample.c; full notice in vendor/adaifl/Pillow-LICENSE.
export function pillowCoefficients(input,output){
 const scale=input/output,support=Math.max(1,scale),inverse=1/support,result=[];
 for(let p=0;p<output;p++){
  const center=(p+.5)*scale,start=Math.max(0,Math.trunc(center-support+.5)),end=Math.min(input,Math.trunc(center+support+.5)),values=[];let total=0;
  for(let j=start;j<end;j++){const value=Math.max(0,1-Math.abs((j-center+.5)*inverse));values.push(value);total+=value;}
  result.push({start,weights:Int32Array.from(values,v=>Math.trunc(.5+v/total*4194304))});
 }
 return result;
}
export function prepareAdaifl(image){
 const {width:w,height:h,data}=image,size=1024,horizontal=h>w*100&&size<h?null:new Uint8Array(h*size*3),output=new Float32Array(size*size*3),cx=pillowCoefficients(w,size),cy=pillowCoefficients(h,size);
 // Pillow applies the vertical pass first for very tall reductions.
 if(h>w*100&&size<h){
  const vertical=new Uint8Array(size*w*3);
  for(let y=0;y<size;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const {start,weights}=cy[y];let sum=2097152;for(let k=0;k<weights.length;k++)sum+=data[((start+k)*w+x)*3+c]*weights[k];vertical[(y*w+x)*3+c]=sum>>22;}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){const {start,weights}=cx[x];let sum=2097152;for(let k=0;k<weights.length;k++)sum+=vertical[(y*w+start+k)*3+c]*weights[k];output[c*size*size+y*size+x]=(sum>>22)/255;}
  return output;
 }
 for(let y=0;y<h;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){
  const {start,weights}=cx[x];let sum=2097152;for(let k=0;k<weights.length;k++)sum+=data[(y*w+start+k)*3+c]*weights[k];horizontal[(y*size+x)*3+c]=sum>>22;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){
  const {start,weights}=cy[y];let sum=2097152;for(let k=0;k<weights.length;k++)sum+=horizontal[((start+k)*size+x)*3+c]*weights[k];output[c*size*size+y*size+x]=(sum>>22)/255;
 }
 return output;
}
