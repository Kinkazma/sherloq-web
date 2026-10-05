import {requireValue,checkAbort} from './errors.js';
/** Read-only native RGB preprocessing, materializing only requested rows. */
export function truforRgbSource(surface,{budget}={}){
 const {width,height}=surface.descriptor,f=Math.fround,mean=[.485,.456,.406].map(f),std=[.229,.224,.225].map(f);
 return {width,height,channels:3,async readRows(top,rows,{signal}={}){
  const window=await surface.readWindow({x:0,y:top,width,height:rows},{signal});let release;
  try{checkAbort(signal);release=budget.reserve(width*rows*12);const n=width*rows,data=new Float32Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)data[c*n+i]=f(f(window.pixels.data[i*3+c]/256-mean[c])/std[c]);return {data,dims:[1,3,rows,width],release};}catch(e){release?.();throw e;}finally{window.release();}
 }};
}
/** Native repeat(1,3,1,1) without a full-image three-channel allocation. */
export function truforNoiseSource(tensor,{budget}={}){
 requireValue(tensor.channels===1,'A scalar Noiseprint++ field is required.');
 return {width:tensor.width,height:tensor.height,channels:3,async readRows(top,rows,options){const part=await tensor.readRows(top,rows,options);let release;try{release=budget.reserve(part.data.byteLength*3);const data=new Float32Array(part.data.length*3);for(let c=0;c<3;c++)data.set(part.data,c*part.data.length);return {data,dims:[1,3,rows,tensor.width],release};}catch(e){release?.();throw e;}finally{part.release();}}};
}
