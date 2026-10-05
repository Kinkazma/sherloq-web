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
// Border following below adapts OpenCV4.11 icvFetchContour, CHAIN_APPROX_SIMPLE.
// Each input to it is one global8-connected component, so holes are not traced.
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createBytePager} from './byte-pager.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const MiB=1024**2,dx=[1,1,0,-1,-1,-1,0,1],dy=[0,-1,-1,-1,0,1,1,1];
async function contour(data,width,height,start,origin,{cooperate,account}){
 const occupied=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&data[y*width+x]!==0;
 const x0=start%width,y0=Math.floor(start/width);let s=4,sEnd=4,x1,y1;
 do{s=(s-1)&7;x1=x0+dx[s];y1=y0+dy[s];}while(!occupied(x1,y1)&&s!==sEnd);
 const points=[];const append=(x,y)=>{if(points.length%1024===0)account(1024*64);points.push([x+origin[0],y+origin[1]]);};
 if(s===sEnd){append(x0,y0);return points;}
 let x=x0,y=y0,previous=s^4,steps=0;
 while(true){
  if((steps++&4095)===0)await cooperate();requireValue(steps<=data.length*8,'Invalid connected component border');
  let nextX,nextY;do{s=(s+1)&7;nextX=x+dx[s];nextY=y+dy[s];}while(!occupied(nextX,nextY));
  if(s!==previous){append(x,y);previous=s;}
  if(nextX===x0&&nextY===y0&&x===x1&&y===y1)break;
  x=nextX;y=nextY;s=(s+4)&7;
 }
 return points;
}

/** Borrow a source mask; visit global components with bounded page caches.
 * Owned cropped masks retain the existing display/export contract. No label
 * plane, original RGB copy, or source-sized OpenCV heap is constructed. */
export async function streamedD2prlRegions({width,height,mask,boxes=[],minimum=500},{budget,signal,onProgress,temporarySession,getTemporarySession}={}){
 requireValue(Number.isInteger(minimum)&&minimum>=0&&minimum<=5000&&Array.isArray(boxes)&&boxes.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isInteger)),'D2PRL minimum and boxes required');
 const n=width*height;requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&n<2**32&&mask?.byteLength===n&&typeof mask.readInto==='function','Original segmented D2PRL mask required');
 const cooperate=createCooperator(signal),stores=[],pagers=[],leases=[],entries=[],keys=[];let scratch,complete=false,working,queue;
 try{
  scratch=budget.reserve(MiB+8192);const options={budget,signal,storage:temporarySession||getTemporarySession?'temporary':'auto',temporarySession,getTemporarySession};
  working=await createSegmentedBytes(n,options);stores.push(working);queue=await createSegmentedBytes(8*Math.ceil(width/2)*height,options);stores.push(queue);
  const buffer=new Uint8Array(Math.min(MiB,n));for(let at=0;at<n;at+=buffer.length){await cooperate();const part=buffer.subarray(0,Math.min(buffer.length,n-at));await mask.readInto(part,at);await working.write(part,at);}await working.flush();
  const work=createBytePager(working,{budget,signal,mutable:true,maxPages:64});pagers.push(work);const runs=createBytePager(queue,{budget,signal,mutable:true,maxPages:4});pagers.push(runs);
  const hash=await createSHA256(),account=bytes=>{const release=budget.reserve(bytes);leases.push(release);};let visited=0;
  for(let seed=0;seed<n;seed++){
   if((seed&4095)===0)await cooperate();let wait=work.prepare(seed,1);if(wait)await wait;if(!work.get8(seed))continue;
   let tail=0,pixels=0,left=width,right=-1,top=height,bottom=-1,key=Infinity;
   const enqueue=async(x,y)=>{
    let wait=work.prepare(y*width,width);if(wait)await wait;let l=x,r=x;while(l>0&&work.get8(y*width+l-1))l--;while(r+1<width&&work.get8(y*width+r+1))r++;
    const start=y*width+l,end=y*width+r+1;for(let at=start;at<end;){const length=Math.min(end-at,65536-at%65536);work.span(at,length,{write:true}).fill(0);at+=length;}
    wait=runs.prepare(tail*8,8);if(wait)await wait;runs.set32(tail*8,start);runs.set32(tail*8+4,end);tail++;pixels+=end-start;left=Math.min(left,l);right=Math.max(right,r);top=Math.min(top,y);bottom=Math.max(bottom,y);key=Math.min(key,Math.floor(y/2)*Math.ceil(width/2)+Math.floor(l/2));return r;
   };
   await enqueue(seed%width,Math.floor(seed/width));
   for(let head=0;head<tail;head++){
    if((head&1023)===0)await cooperate();wait=runs.prepare(head*8,8);if(wait)await wait;const start=runs.get32(head*8),end=runs.get32(head*8+4),y=Math.floor(start/width),lo=Math.max(0,start%width-1),hi=Math.min(width-1,(end-1)%width+1);
    for(const yy of [y-1,y+1])if(yy>=0&&yy<height){wait=work.prepare(yy*width,width);if(wait)await wait;for(let x=lo;x<=hi;x++)if(work.get8(yy*width+x))x=await enqueue(x,yy);}
   }
   const w=right-left+1,h=bottom-top+1;account(w*h+8192+JSON.stringify(boxes).length*8);const data=new Uint8Array(w*h);
   for(let head=0;head<tail;head++){if((head&1023)===0)await cooperate();wait=runs.prepare(head*8,8);if(wait)await wait;const start=runs.get32(head*8),end=runs.get32(head*8+4),at=(Math.floor(start/width)-top)*w+start%width-left;data.fill(1,at,at+end-start);}
   const polygons=[await contour(data,w,h,(Math.floor(seed/width)-top)*w+seed%width-left,[left,top],{cooperate,account})];
   hash.init();for(let at=0;at<data.length;at+=MiB){hash.update(data.subarray(at,Math.min(data.length,at+MiB)));await cooperate();}hash.update(new TextEncoder().encode(`(${left}, ${top}, ${w}, ${h})`));const id='d2prl-'+hash.digest('hex').slice(0,24);
   entries.push({id,source:'D2PRL',label:'D2PRL',count:pixels,count_kind:'pixels',color:[230,170,30],pixel_mask:{width:w,height:h,data},origin:[left,top],polygons,search_context:'d2prl-selected-zones',provenance:{min_component:minimum,native_grid:[448,448],evidence:'segmentation',boxes:structuredClone(boxes)}});keys.push(key);visited+=pixels;onProgress?.({phase:'d2prl-regions',completed:entries.length,visited,fraction:(seed+1)/n});checkAbort(signal);
  }
  // OpenCV's default8-connected block CCL labels components in first2x2-block
  // order. Stable ids depend only on exact cropped mask bytes and native bbox.
  const ordered=entries.map((entry,i)=>({entry,key:keys[i]})).sort((a,b)=>a.key-b.key).map(x=>x.entry);checkAbort(signal);complete=true;let released=false;return {entries:ordered,release(){if(released)return;released=true;for(const free of leases)free();}};
 }finally{for(const p of pagers)p.dispose();const settled=await Promise.allSettled(stores.map(s=>s.dispose())),failed=settled.find(r=>r.status==='rejected');scratch?.();if(!complete||failed)for(const free of leases)free();if(failed)throw failed.reason;}
}
