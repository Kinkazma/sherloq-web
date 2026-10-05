import "../../runtime-context.js?v=0.14.5";
/*M///////////////////////////////////////////////////////////////////////////////////////
//
//  IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.
//
//  By downloading, copying, installing or using the software you agree to this license.
//  If you do not agree to this license, do not download, install,
//  copy or use the software.
//
//
//                        Intel License Agreement
//                For Open Source Computer Vision Library
//
// Copyright (C) 2000, Intel Corporation, all rights reserved.
// Third party copyrights are property of their respective owners.
//
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
//
//   * Redistribution's of source code must retain the above copyright notice,
//     this list of conditions and the following disclaimer.
//
//   * Redistribution's in binary form must reproduce the above copyright notice,
//     this list of conditions and the following disclaimer in the documentation
//     and/or other materials provided with the distribution.
//
//   * The name of Intel Corporation may not be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// This software is provided by the copyright holders and contributors "as is" and
// any express or implied warranties, including, but not limited to, the implied
// warranties of merchantability and fitness for a particular purpose are disclaimed.
// In no event shall the Intel Corporation or contributors be liable for any direct,
// indirect, incidental, special, exemplary, or consequential damages
// (including, but not limited to, procurement of substitute goods or services;
// loss of use, data, or profits; or business interruption) however caused
// and on any theory of liability, whether in contract, strict liability,
// or tort (including negligence or otherwise) arising in any way out of
// the use of this software, even if advised of the possibility of such damage.
//
//M*/
// OpenCV4.11 RETR_EXTERNAL / CHAIN_APPROX_SIMPLE border scan. A padded byte
// plane replaces the generic geometry heap; output coordinates remain original.
import {requireValue,checkAbort,createCooperator} from './errors.js';
const dx=[1,1,0,-1,-1,-1,0,1],dy=[0,-1,-1,-1,0,1,1,1];
export async function externalMaskContours({width,height,mask,origin=[0,0]},{budget,signal}={}){
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&mask instanceof Uint8Array&&mask.length===width*height&&origin.length===2&&origin.every(Number.isSafeInteger),'Binary mask and original origin required');
 const stride=width+2,size=stride*(height+2),free=budget.reserve(size),leases=[],polygons=[],cooperate=createCooperator(signal);let complete=false,outputUnits=0,data;
 const accountOutput=()=>{if(outputUnits++%1024===0)leases.push(budget.reserve(1024*64));};
 try{
  data=new Int8Array(size);const delta=dx.map((x,i)=>x+dy[i]*stride);for(let y=0;y<height;y++){if((y&63)===0)await cooperate();for(let x=0;x<width;x++)data[(y+1)*stride+x+1]=mask[y*width+x]?1:0;}
  async function trace(start,x0,y0){
   accountOutput();const points=[];const append=(x,y)=>{accountOutput();points.push([x+origin[0],y+origin[1]]);};
   let s=4,first;do{s=(s-1)&7;first=start+delta[s];}while(!data[first]&&s!==4);
   if(s===4){data[start]=-126;append(x0,y0);return points;}
   let at=start,x=x0,y=y0,previous=s^4,steps=0;
   while(true){if((steps++&4095)===0)await cooperate();requireValue(steps<=mask.length*8,'Invalid contour border');let end=s,next;do{s=(s+1)&7;next=at+delta[s];}while(!data[next]);
    if(((s-1)>>>0)<(end>>>0))data[at]=-126;else if(data[at]===1)data[at]=2;
    if(s!==previous){append(x,y);previous=s;}if(next===start&&at===first)break;x+=dx[s];y+=dy[s];at=next;s=(s+4)&7;
   }return points;
  }
  for(let y=1;y<=height;y++){if((y&31)===0)await cooperate();let previous=0,last=0;
   for(let x=1;x<=width;x++){let value=data[y*stride+x];if(value===previous)continue;
    if(previous===0&&value===1){if(data[y*stride+last]<=0){last=x;polygons.push(await trace(y*stride+x,x-1,y-1));value=data[y*stride+x];}}
    else if(value===0&&previous>=1&&(previous&-2))last=x-1;
    previous=value;if(previous&-2)last=x;
   }
  }
  polygons.reverse();checkAbort(signal);complete=true;let released=false;return {polygons,release(){if(released)return;released=true;for(const f of leases)f();}};
 }finally{data=null;free();if(!complete)for(const f of leases)f();}
}
