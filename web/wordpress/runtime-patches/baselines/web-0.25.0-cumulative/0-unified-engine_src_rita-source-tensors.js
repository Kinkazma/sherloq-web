import {requireValue,checkAbort} from './errors.js';
const f=Math.fround,MEAN=[.485,.456,.406].map(f),STD=[.229,.224,.225].map(f);
// RGB8 has only256 values. Keep precisely the original float32 operation
// sequence, once per value/channel; row preparation then only copies bits.
const NORMALIZED=MEAN.map((mean,c)=>Float32Array.from({length:256},(_,value)=>f(f(f(value/255)-mean)/STD[c])));
export function ritaReflectIndex(index,length){
 requireValue(Number.isSafeInteger(index)&&index>=0&&Number.isSafeInteger(length)&&length>0,'Invalid RITA reflect coordinate.');
 if(length===1)return 0;const period=2*(length-1),at=index%period;return at<length?at:period-at;
}
/** Audited native geometric adaptation: ImageNet RGB, no rescaling, reflect
 * right/bottom to32. Only the requested normalized rows materialize. */
export function ritaSourceTensors(image,{budget}={}){
 const surface=image.surface??image,d=surface.descriptor??image,{width,height}=d;
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&typeof surface.readWindow==='function','Native RITA RGB surface required.');
 const pw=Math.ceil(width/32)*32,ph=Math.ceil(height/32)*32;
 // Padding is at most31 columns. Do not retain a full-image index plane.
 const right=Array.from({length:pw-width},(_,i)=>ritaReflectIndex(width+i,width));
 const rgb={channels:3,width:pw,height:ph,async readRows(top,rows,{signal}={}){
  requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=ph-rows,'Invalid RITA source rows.');checkAbort(signal);
  const mapped=new Array(rows);let first=height,last=0;for(let y=0;y<rows;y++){const at=ritaReflectIndex(top+y,height);mapped[y]=at;if(at<first)first=at;if(at>last)last=at;}
  const part=await surface.readWindow({x:0,y:first,width,height:last-first+1},{signal});let release;
  try{
   const pixels=part.pixels??part,channels=pixels.data.length/(width*(last-first+1));requireValue(channels===3||channels===4,'RITA source must be RGB8/RGBA8.');release=budget.reserve(rows*pw*12);const n=rows*pw,data=new Float32Array(n*3),bytes=pixels.data instanceof Uint8Array||pixels.data instanceof Uint8ClampedArray;
   for(let y=0;y<rows;y++){
    checkAbort(signal);const row=(mapped[y]-first)*width*channels,out=y*pw;
    for(let x=0;x<pw;x++){
     const at=row+(x<width?x:right[x-width])*channels,index=out+x;
     if(bytes){data[index]=NORMALIZED[0][pixels.data[at]];data[n+index]=NORMALIZED[1][pixels.data[at+1]];data[2*n+index]=NORMALIZED[2][pixels.data[at+2]];}
     else for(let c=0;c<3;c++)data[c*n+index]=f(f(f(pixels.data[at+c]/255)-MEAN[c])/STD[c]);
    }
   }
   return {data,dims:[1,3,rows,pw],release};
  }catch(error){release?.();throw error;}finally{part.release?.();}
 }};
 return {rgb,width,height,paddedWidth:pw,paddedHeight:ph,metadata:{method:'rita',source_shape:[height,width],padded_shape:[ph,pw],padding_right_bottom:[pw-width,ph-height],normalization:{divisor:255,mean:[.485,.456,.406],std:[.229,.224,.225]},rescaled:false,geometricAdaptation:'native reflect32; dynamic feature splits and final align-corners resize'}};
}
export function ritaInitialMask(width,height,{budget}={}){
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid RITA mask geometry.');
 return {channels:1,width,height,async readRows(top,rows,{signal}={}){
  requireValue(Number.isSafeInteger(top)&&Number.isSafeInteger(rows)&&top>=0&&rows>0&&top<=height-rows,'Invalid RITA mask rows.');checkAbort(signal);const release=budget.reserve(width*rows*4);try{return {data:new Float32Array(width*rows).fill(3),dims:[1,1,rows,width],release};}catch(error){release();throw error;}
 }};
}
