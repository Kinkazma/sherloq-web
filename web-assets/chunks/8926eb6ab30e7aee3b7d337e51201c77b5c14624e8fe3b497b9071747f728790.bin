import "../runtime-context.js?v=0.21.0";
import {prepareComprintInput} from './comprint-statistics.js';
import {allocateTypedArray,allocateOwnedTypedArray} from '../unified-engine/src/allocation.js';

/** Run every source pixel once as output. Halo20 is the exact receptive radius
 * of twenty3x3 SAME convolutions; no resampling or independent tile statistics.
 * inferTile owns shared-session/cache/admission; concurrency is bounded by it.
 */
export async function inferTiled(prepared,{inferTile,coreSize=512,concurrency=1,signal,onProgress}={}){
 const {width,height,normalized}=prepared;
 if(typeof inferTile!=='function'||!Number.isInteger(coreSize)||coreSize<1||!Number.isInteger(concurrency)||concurrency<1)throw Error('Comprint tiled inference needs an admitted inferTile callback');
 const out=allocateTypedArray(Float32Array,width*height,{label:'Comprint full native fingerprint'}),tiles=[];
 for(let y=0;y<height;y+=coreSize)for(let x=0;x<width;x+=coreSize)tiles.push({x,y,w:Math.min(coreSize,width-x),h:Math.min(coreSize,height-y)});
 let next=0,completed=0,failure;
 const jobs=Array.from({length:Math.min(concurrency,tiles.length)},async()=>{
  while(next<tiles.length&&!failure){
   if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');
   const tile=tiles[next++],x0=Math.max(0,tile.x-20),y0=Math.max(0,tile.y-20),x1=Math.min(width,tile.x+tile.w+20),y1=Math.min(height,tile.y+tile.h+20),w=x1-x0,h=y1-y0,data=new Float32Array(w*h);
   for(let y=0;y<h;y++)data.set(normalized.subarray((y0+y)*width+x0,(y0+y)*width+x1),y*w);
   const response=await inferTile({data,dims:[1,h,w,1],type:'float32'},{tile,halo:20,signal});
   try{
    const values=response.data??response.tensor?.data;if(!(values instanceof Float32Array)||values.length!==w*h)throw Error('Comprint network returned wrong tile geometry');
    const ox=tile.x-x0,oy=tile.y-y0;
    for(let y=0;y<tile.h;y++)out.set(values.subarray((oy+y)*w+ox,(oy+y)*w+ox+tile.w),(tile.y+y)*width+tile.x);
   }finally{response.release?.();}
   onProgress?.({phase:'comprint-network',completed:++completed,total:tiles.length});
  }
 });
 await Promise.allSettled(jobs.map(job=>job.catch(error=>{failure??=error;throw error;})));if(failure)throw failure;
 return {fingerprint:out,width,height,metadata:{coreSize,halo:20,tileCount:tiles.length,concurrency,resize:false,globalPostprocess:true}};
}

/** Engine-facing entry point. infer is the shared cached/admitted inference hook. */
export async function runComprintFingerprint(prepared,{infer,asset='models/comprint/comprint.onnx',signal,onProgress,coreSize=512,concurrency=2}={}){
 const result=await inferTiled(prepared,{coreSize,concurrency,signal,onProgress,inferTile:async tensor=>{
  const outputs=await infer(asset,{luminance_normalized:tensor},{signal,onProgress});
  const value=outputs['Identity:0']??Object.values(outputs)[0];
  return {data:value.data};
 }});
 return {data:result.fingerprint,dims:[1,prepared.height,prepared.width,1],type:'float32',tiling:result.metadata};
}

/** Native-resolution source path: never creates a dense RGB or normalized image.
 * Only the float32 luminance and fingerprint planes survive each source window.
 */
export async function runComprintFingerprintSource(source,{infer,asset='models/comprint/comprint.onnx',signal,onProgress,coreSize=512,concurrency=2,budget}={}){
 const width=source.width??source.descriptor?.width,height=source.height??source.descriptor?.height;
 if(!Number.isSafeInteger(width*height)||width<1||height<1||typeof source.readWindow!=='function'||typeof infer!=='function'||!Number.isSafeInteger(coreSize)||coreSize<1||!Number.isSafeInteger(concurrency)||concurrency<1)throw Error('Comprint needs an original RGB8 window source');
 // The caller already reserves 8 bytes/source pixel. These owners register
 // actual materialized backing without a second policy reservation.
 let luminanceOwner,fingerprintOwner,handedOff=false;
 try{
 luminanceOwner=allocateOwnedTypedArray(Float32Array,width*height,{budget,reserve:()=>()=>{},owner:'comprint-source',label:'Comprint full native luminance'});
 fingerprintOwner=allocateOwnedTypedArray(Float32Array,width*height,{budget,reserve:()=>()=>{},owner:'comprint-source',label:'Comprint full native fingerprint'});
 const luminance=luminanceOwner.data,fingerprint=fingerprintOwner.data,tiles=[];
 for(let y=0;y<height;y+=coreSize)for(let x=0;x<width;x+=coreSize)tiles.push({x,y,w:Math.min(coreSize,width-x),h:Math.min(coreSize,height-y)});
 let next=0,completed=0,failure;
 const jobs=Array.from({length:Math.min(concurrency,tiles.length)},async()=>{
  while(next<tiles.length&&!failure){
   if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');
   const tile=tiles[next++],x=Math.max(0,tile.x-20),y=Math.max(0,tile.y-20),right=Math.min(width,tile.x+tile.w+20),bottom=Math.min(height,tile.y+tile.h+20);
   const rect={x,y,width:right-x,height:bottom-y},window=await source.readWindow(rect,{signal});
   try{
    const pixels=window.pixels??window,rgb=pixels.data;
    if(pixels.width!==rect.width||pixels.height!==rect.height)throw Error('Comprint source window geometry mismatch');
    const prepared=prepareComprintInput(rgb,rect.width,rect.height);
    const outputs=await infer(asset,{luminance_normalized:{data:prepared.normalized,dims:[1,rect.height,rect.width,1],type:'float32'}},{signal,onProgress,cache:false});
    try{
     const result=outputs['Identity:0']??Object.values(outputs)[0],values=result.data;
     if(!(values instanceof Float32Array)||values.length!==rect.width*rect.height)throw Error('Comprint source network geometry mismatch');
     const ox=tile.x-x,oy=tile.y-y;
     for(let row=0;row<tile.h;row++){
      const begin=(oy+row)*rect.width+ox,at=(tile.y+row)*width+tile.x;
      fingerprint.set(values.subarray(begin,begin+tile.w),at);luminance.set(prepared.luminance.subarray(begin,begin+tile.w),at);
     }
    }finally{outputs.release?.();}
   }finally{window.release?.();}
   onProgress?.({phase:'comprint-network',completed:++completed,total:tiles.length});
  }
 });
 await Promise.allSettled(jobs.map(job=>job.catch(error=>{failure??=error;throw error;})));if(failure)throw failure;
 const result={data:fingerprint,luminance,dims:[1,height,width,1],type:'float32',tiling:{coreSize,halo:20,tileCount:tiles.length,concurrency,resize:false,sourceWindows:true,globalPostprocess:true}};
 let released=false;Object.defineProperty(result,'release',{enumerable:false,value:()=>{if(released)return;released=true;result.data=null;result.luminance=null;luminanceOwner.release();fingerprintOwner.release();}});
 handedOff=true;return result;
 }finally{if(!handedOff){luminanceOwner?.release();fingerprintOwner?.release();}}
}
