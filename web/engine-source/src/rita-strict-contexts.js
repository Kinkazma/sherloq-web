import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

export function ritaStrictParameters(params={}){
 requireValue(params&&typeof params==='object'&&!Array.isArray(params)&&Object.keys(params).every(k=>k==='threshold')&&(params.threshold===undefined||Number.isFinite(params.threshold)&&params.threshold>=0&&params.threshold<=1),'RITA only accepts its existing visual threshold.');
 return Object.freeze({...params});
}

/** Exact disjoint admitted rectangles. Every pixel remains native, including
 * one-pixel fragments; the native analyzer alone applies reflect-to-32.
 * Contexts are never joined into an artificial image or autoregressive field. */
export async function planRitaStrictContexts(view,{budget,signal}={}){
 const fragments=[],leases=[];let pixels=0;
 try{
  for(const rect of view.admittedRectangles()){
   checkAbort(signal);leases.push(budget.reserve(2048));const count=rect.width*rect.height,origin=view.domain.toOriginal([rect.x,rect.y]);
   requireValue(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(pixels+count),'RITA context exceeds its native grid.');
   fragments.push({index:fragments.length,rect:{...rect},bounds:[origin[0],origin[1],origin[0]+rect.width,origin[1]+rect.height],shape:[rect.height,rect.width],paddedShape:[Math.ceil(rect.height/32)*32,Math.ceil(rect.width/32)*32],offset:pixels,count,evaluable:true});pixels+=count;
   if(fragments.length%32===0)await controlCheckpoint(signal);
  }
  requireValue(pixels===view.domain.countIncluded,'RITA native contexts must cover every admitted pixel exactly once.');let closed=false;
  return{fragments,pixels,selectedPixels:pixels,release(){if(closed)return;closed=true;for(const release of leases)release();}};
 }catch(error){for(const release of leases)release();throw error;}
}

/** Packed CHW transport, not a fabricated raster. For logits each channel
 * spans all contexts; native per-context CHW offsets are mapped explicitly. */
export function ritaStrictField(parts,key,pixels,{alive=()=>{},withRead=fn=>fn()}={}){
 requireValue(['map','official_mask','labels','logits'].includes(key)&&Number.isSafeInteger(pixels)&&pixels>0,'Invalid native RITA field.');const channels=key==='logits'?4:1,totalBytes=pixels*channels*4;
 async function readBytes(out,offset=0,{signal}={}){
  alive();checkAbort(signal);requireValue(out instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset+out.byteLength<=totalBytes,'Invalid packed native RITA byte window.');let copied=0;
  for(let channel=0;channel<channels;channel++)for(const part of parts){
   const f=part.fragment,start=(channel*pixels+f.offset)*4,end=start+f.count*4,left=Math.max(offset,start),right=Math.min(offset+out.byteLength,end);if(left>=right)continue;
   checkAbort(signal);await part.value.data[key].readBytes(out.subarray(left-offset,right-offset),(channel*f.count)*4+left-start,{signal});copied+=right-left;
  }
  requireValue(copied===out.byteLength,'Native RITA contexts do not cover the packed field.');alive();checkAbort(signal);return out;
 }
 return Object.freeze({channels,width:pixels,height:1,length:pixels*channels,byteLength:totalBytes,elementType:'Float32Array',storage:'immutable-native-context-loans',readBytes:(...args)=>withRead(()=>readBytes(...args)),readInto(out,offset=0,options){requireValue(out instanceof Float32Array&&Number.isSafeInteger(offset)&&offset>=0,'A native float32 RITA window is required.');return withRead(async()=>{await readBytes(new Uint8Array(out.buffer,out.byteOffset,out.byteLength),offset*4,options);return out;});}});
}
