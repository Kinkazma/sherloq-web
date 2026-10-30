import "../../runtime-context.js?v=0.30.0";
/* Third-party geometry notices retained in the offline module.
OpenCV modules/imgproc/src/imgwarp.cpp
=======================================================
IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.

By downloading, copying, installing or using the software you agree to this license.
If you do not agree to this license, do not download, install,
copy or use the software.


License Agreement
For Open Source Computer Vision Library

Copyright (C) 2000-2008, Intel Corporation, all rights reserved.
Copyright (C) 2009, Willow Garage Inc., all rights reserved.
Copyright (C) 2014-2015, Itseez Inc., all rights reserved.
Copyright (C) 2026, Advanced Micro Devices, all rights reserved.
Third party copyrights are property of their respective owners.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistribution's of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

* Redistribution's in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.

* The name of the copyright holders may not be used to endorse or promote products
derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors "as is" and
any express or implied warranties, including, but not limited to, the implied
warranties of merchantability and fitness for a particular purpose are disclaimed.
In no event shall the Intel Corporation or contributors be liable for any direct,
indirect, incidental, special, exemplary, or consequential damages
(including, but not limited to, procurement of substitute goods or services;
loss of use, data, or profits; or business interruption) however caused
and on any theory of liability, whether in contract, strict liability,
or tort (including negligence or otherwise) arising in any way out of
the use of this software, even if advised of the possibility of such damage.

OpenCV modules/imgproc/src/resize.cpp
=======================================================
IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.

By downloading, copying, installing or using the software you agree to this license.
If you do not agree to this license, do not download, install,
copy or use the software.


License Agreement
For Open Source Computer Vision Library

Copyright (C) 2000-2008, 2017, Intel Corporation, all rights reserved.
Copyright (C) 2009, Willow Garage Inc., all rights reserved.
Copyright (C) 2014-2015, Itseez Inc., all rights reserved.
Third party copyrights are property of their respective owners.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistribution's of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

* Redistribution's in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.

* The name of the copyright holders may not be used to endorse or promote products
derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors "as is" and
any express or implied warranties, including, but not limited to, the implied
warranties of merchantability and fitness for a particular purpose are disclaimed.
In no event shall the Intel Corporation or contributors be liable for any direct,
indirect, incidental, special, exemplary, or consequential damages
(including, but not limited to, procurement of substitute goods or services;
loss of use, data, or profits; or business interruption) however caused
and on any theory of liability, whether in contract, strict liability,
or tort (including negligence or otherwise) arising in any way out of
the use of this software, even if advised of the possibility of such damage.

*/
/* PP-OCRv6 recognition preprocessing and CTC decoding. PaddlePaddle Authors,
 * Apache-2.0. Crop resampling follows OpenCV INTER_CUBIC (BSD-3-Clause; see OCR third-party notices), followed
 * by the official integer RGB resize/normalization and CTC channel order. */
import {requireValue,checkAbort,createCooperator,EngineError,serializeEngineError} from './errors.js';
async function retireTextSource(lease,primary){try{await lease?.release?.();}catch(error){if(!primary)throw error;primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),serializeEngineError(error)]};}}

export const PPOCR_MEDIUM=Object.freeze({detector:{bytes:62032837,sha256:'eb13b44b25bb36f89528b68720af8a61d9cf381176107f465db1757b65d086e1'},recognizer:{bytes:76554979,sha256:'9c09abf0957f7968c7586464b7397b84ad2387a0497a351af40e9acc71b673ba'},orientation:{bytes:6777816,sha256:'38aa97cd4be591e0ad304e659f07ba30d946f27a63315433f6659c69c8778345'},dictionary:{bytes:112366,sha256:'679f4f4cbbb4f762e84fae998e02c08a556afbd115968104ca3b4aeee5cb2b19'},characters:18708,classes:18710,input:'x',output:'fetch_name_0'});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function ppocrOrderedQuad(polygon){
 requireValue(Array.isArray(polygon)&&polygon.length===4&&polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'PP-OCR requires a finite four-corner polygon.');
 const p=polygon.map(p=>[...p]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),left=p.slice(0,2).sort((a,b)=>a[1]-b[1]),right=p.slice(2).sort((a,b)=>a[1]-b[1]);return [left[0],right[0],right[1],left[1]];
}
export function ppocrRecognitionShape(polygon){
 const points=ppocrOrderedQuad(polygon),width=Math.max(1,Math.floor(Math.max(distance(points[0],points[1]),distance(points[2],points[3])))),height=Math.max(1,Math.floor(Math.max(distance(points[0],points[3]),distance(points[1],points[2])))),rotate=height/width>=1.5,cropWidth=rotate?height:width,cropHeight=rotate?width:height;
 const ratio=cropWidth/cropHeight,inputWidth=Math.min(3200,Math.max(320,Math.floor(48*Math.max(320/48,ratio)))),usedWidth=Math.min(inputWidth,Math.ceil(48*ratio));return {points,width,height,rotate,inputWidth,usedWidth,inputHeight:48};
}
async function borrow(image,box,signal){
 const [x,y,r,b]=box,width=r-x,height=b-y;
 if(image.readWindow){const lease=await image.readWindow({x,y,width,height},{signal});const data=lease.pixels?.data??lease.data??lease.pixels??lease;if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*3){const error=new EngineError('INVALID_INPUT','PP-OCR source window is not RGB8.');await retireTextSource(lease,error);throw error;}return {data,release:()=>lease.release?.()};}
 const data=new Uint8Array(width*height*3),cooperate=createCooperator(signal);
 if(image.readRows){for(let yy=0;yy<height;yy+=32){await cooperate();const rows=Math.min(32,height-yy),lease=await image.readRows(y+yy,rows,{signal});try{const rgb=lease.pixels?.data??lease.data??lease.pixels??lease;requireValue((rgb instanceof Uint8Array||rgb instanceof Uint8ClampedArray)&&rgb.length===image.width*rows*3,'PP-OCR source rows are not RGB8.');for(let row=0;row<rows;row++)data.set(rgb.subarray((row*image.width+x)*3,(row*image.width+r)*3),(yy+row)*width*3);}finally{await lease.release?.();}}}
 else{requireValue((image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray)&&image.data.length===image.width*image.height*3,'PP-OCR requires original RGB8 pixels.');for(let yy=0;yy<height;yy++)data.set(image.data.subarray(((y+yy)*image.width+x)*3,((y+yy)*image.width+r)*3),yy*width*3);}
 return {data,release(){}};
}
// OpenCV's separable cubic kernel A=-.75 and its1/32-pixel,15-bit
// interpolation table. Preserve the source border with BORDER_REPLICATE.
const roundEven=v=>{const n=Math.floor(v),f=v-n;return f<.5?n:f>.5?n+1:n%2?n+1:n;};
let cubicTable;
function cubicCoefficients(t){const A=-.75,x=t+1,y=1-t,a=Math.fround(((A*x-5*A)*x+8*A)*x-4*A),b=Math.fround(((A+2)*t-(A+3))*t*t+1),c=Math.fround(((A+2)*y-(A+3))*y*y+1);return [a,b,c,Math.fround(1-a-b-c)];}
function cubicWeights(){if(cubicTable)return cubicTable;const table=new Int16Array(32*32*16);for(let fy=0;fy<32;fy++)for(let fx=0;fx<32;fx++){const ys=cubicCoefficients(fy/32),xs=cubicCoefficients(fx/32),base=(fy*32+fx)*16;let sum=0;for(let y=0;y<4;y++)for(let x=0;x<4;x++){const v=clamp(roundEven(Math.fround(ys[y]*xs[x])*32768),-32768,32767);table[base+y*4+x]=v;sum+=v;}if(sum!==32768){let lo=10,hi=10;for(let y=2;y<4;y++)for(let x=2;x<4;x++){const i=y*4+x;if(table[base+i]<table[base+lo])lo=i;else if(table[base+i]>table[base+hi])hi=i;}table[base+(sum<32768?hi:lo)]-=sum-32768;}}cubicTable=table;return table;}
export async function ppocrWarpCubic(source,width,height,points,outputWidth,outputHeight,{signal}={}){
 const data=new Uint8Array(outputWidth*outputHeight*3),table=cubicWeights(),[p0,p1,,p3]=points,cooperate=createCooperator(signal);
 for(let y=0;y<outputHeight;y++){await cooperate();for(let x=0;x<outputWidth;x++){
  const sx=p0[0]+x/outputWidth*(p1[0]-p0[0])+y/outputHeight*(p3[0]-p0[0]),sy=p0[1]+x/outputWidth*(p1[1]-p0[1])+y/outputHeight*(p3[1]-p0[1]),qx=roundEven(sx*32),qy=roundEven(sy*32),ix=Math.floor(qx/32),iy=Math.floor(qy/32),at=((qy-iy*32)*32+qx-ix*32)*16;
  for(let c=0;c<3;c++){let sum=0;for(let yy=0;yy<4;yy++){const py=clamp(iy+yy-1,0,height-1);for(let xx=0;xx<4;xx++)sum+=source[(py*width+clamp(ix+xx-1,0,width-1))*3+c]*table[at+yy*4+xx];}data[(y*outputWidth+x)*3+c]=clamp(Math.floor((sum+16384)/32768),0,255);}
 }}return data;
}
function sourcePixel(crop,x,y,c,rotate,reverse){const width=rotate?crop.height:crop.width,height=rotate?crop.width:crop.height;if(reverse){x=width-1-x;y=height-1-y;}const sx=rotate?crop.width-1-y:x,sy=rotate?x:y;return crop.data[(sy*crop.width+sx)*3+c];}
export async function ppocrResizeLine(crop,width,height,{rotate=false,reverse=false,signal}={}){
 const sw=rotate?crop.height:crop.width,sh=rotate?crop.width:crop.height,data=new Uint8Array(width*height*3),cooperate=createCooperator(signal);
 for(let y=0;y<height;y++){await cooperate();const py=(y+.5)*sh/height-.5,iy=Math.floor(py),y0=clamp(iy,0,sh-1),y1=Math.min(sh-1,y0+1),fy=iy<0||iy>=sh-1?0:Math.fround(py-iy),by=roundEven(fy*2048),ay=roundEven((1-fy)*2048);
  for(let x=0;x<width;x++){const px=(x+.5)*sw/width-.5,ix=Math.floor(px),x0=clamp(ix,0,sw-1),x1=Math.min(sw-1,x0+1),fx=ix<0||ix>=sw-1?0:Math.fround(px-ix),bx=roundEven(fx*2048),ax=roundEven((1-fx)*2048);for(let c=0;c<3;c++){const top=sourcePixel(crop,x0,y0,c,rotate,reverse)*ax+sourcePixel(crop,x1,y0,c,rotate,reverse)*bx,bottom=sourcePixel(crop,x0,y1,c,rotate,reverse)*ax+sourcePixel(crop,x1,y1,c,rotate,reverse)*bx;data[(y*width+x)*3+c]=clamp(((((ay*(top>>4))>>16)+((by*(bottom>>4))>>16)+2)>>2),0,255);}}
 }return data;
}
export async function preparePpocrLine(image,polygon,{signal,budget}={}){
 const shape=ppocrRecognitionShape(polygon),xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),box=[clamp(Math.floor(Math.min(...xs))-2,0,image.width-1),clamp(Math.floor(Math.min(...ys))-2,0,image.height-1),clamp(Math.ceil(Math.max(...xs))+3,1,image.width),clamp(Math.ceil(Math.max(...ys))+3,1,image.height)],bw=box[2]-box[0],bh=box[3]-box[1],count=shape.inputWidth*48;
 const release=budget?.reserve((bw*bh+shape.width*shape.height+160*80+shape.usedWidth*48)*3+(count+160*80)*12+32768)??(()=>{});let source,complete=false,primaryError;
 try{source=await borrow(image,box,signal);const local=shape.points.map(([x,y])=>[x-box[0],y-box[1]]),data=await ppocrWarpCubic(source.data,bw,bh,local,shape.width,shape.height,{signal}),crop={data,width:shape.width,height:shape.height};const retired=source;source=null;await retired.release();checkAbort(signal);
  const direction=await ppocrResizeLine(crop,160,80,{rotate:shape.rotate,signal}),orientationData=new Float32Array(160*80*3),means=[.485,.456,.406],stds=[.229,.224,.225];for(let i=0;i<160*80;i++)for(let c=0;c<3;c++)orientationData[c*160*80+i]=Math.fround(Math.fround(Math.fround(direction[i*3+c]/255)-Math.fround(means[c]))/Math.fround(stds[c]));
  let recognitionData;
  const recognition=async(reverse=false)=>{const resized=await ppocrResizeLine(crop,shape.usedWidth,48,{rotate:shape.rotate,reverse,signal}),data=recognitionData??new Float32Array(count*3);data.fill(0);for(let i=0;i<48;i++)for(let x=0;x<shape.usedWidth;x++)for(let c=0;c<3;c++){const v=Math.fround(resized[(i*shape.usedWidth+x)*3+2-c]/255);data[c*count+i*shape.inputWidth+x]=Math.fround(Math.fround(v-.5)/.5);}recognitionData=data;return {data,dims:[1,3,48,shape.inputWidth],type:'float32'};};
  checkAbort(signal);complete=true;return {crop,shape,orientationTensor:{data:orientationData,dims:[1,3,80,160],type:'float32'},recognition,release};
 }catch(error){primaryError=error;throw error;}finally{try{await retireTextSource(source,primaryError);}finally{if(!complete)release();}}
}
export async function preparePpocrRecognition(image,polygon,options={}){const line=await preparePpocrLine(image,polygon,options);try{return {...line,tensor:await line.recognition(false)};}catch(error){line.release();throw error;}}
export function decodePpocrOrientation(tensor){const {data,dims}=tensor??{};requireValue(data instanceof Float32Array&&data.length===2&&dims?.length===2&&dims[0]===1&&dims[1]===2&&[...data].every(Number.isFinite),'Invalid PP-LCNet orientation output.');return {reverse:data[1]>data[0],classId:data[1]>data[0]?1:0,confidence:Math.max(...data),scores:Array.from(data)};}
export function decodePpocrCtc(tensor,dictionary){
 requireValue(Array.isArray(dictionary)&&dictionary.length===PPOCR_MEDIUM.characters&&dictionary.every(x=>typeof x==='string'),'Invalid PP-OCR character dictionary.');
 const {data,dims}=tensor??{};requireValue(data instanceof Float32Array&&Array.isArray(dims)&&dims.length===3&&dims[0]===1&&dims[2]===PPOCR_MEDIUM.classes&&data.length===dims[1]*dims[2],'Invalid PP-OCR recognition output.');
 let text='',sum=0,selected=0,previous=-1;
 for(let t=0;t<dims[1];t++){let best=-Infinity,index=-1;for(let c=0;c<dims[2];c++){const p=data[t*dims[2]+c];if(!Number.isFinite(p)||p<0||p>1)throw new EngineError('MODEL_OUTPUT_INVALID','PP-OCR recognizer returned invalid CTC probabilities.');if(p>best){best=p;index=c;}}
  if(index!==0&&index!==previous){text+=index===dims[2]-1?' ':dictionary[index-1];sum+=best;selected++;}previous=index;
 }return {text,confidence:selected?sum/selected:0,characters:selected,timeSteps:dims[1]};
}
