import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {samplePixels} from './display-sampling.js';
import {ZERO_PALETTE} from './zero-palette.js';
import {zeroParams} from './zero.js';
import {stereoParams} from './stereogram.js';
import {cvStereoPrepare,cvStereoView} from './opencv.js';
import {retireCompositeOwners} from './composite-owner-release.js';
const MiB=1024**2;
export const previewUnavailable=message=>{throw new EngineError('PREVIEW_UNAVAILABLE',message);};
export function previewRoom(budget){return Math.max(0,budget.limit-(budget.retained??0)-(budget.active??0)-(budget.cacheBytes??0));}
export function reservePreview(budget,bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid provisional workspace.');if(bytes>previewRoom(budget))throw new EngineError('MEMORY_LIMIT','No preview workspace without evicting the native result.');return budget.reserve(bytes);}
export function cachedPreviewGeometry(width,height,preview={},budget,{bytesPerPixel=96,fixedBytes=0,minimumSide=1,nestedReaderBytes=3*MiB+65536}={}){
 requireValue([width,height].every(v=>Number.isSafeInteger(v)&&v>0),'Invalid cached source geometry.');const {maxSide=128,maxPixels=2048**2,maxWorkingBytes=128*MiB}=preview;
 requireValue(Number.isSafeInteger(maxSide)&&maxSide>=minimumSide&&maxSide<=2048&&Number.isSafeInteger(maxPixels)&&maxPixels>0&&maxPixels<=2048**2&&Number.isSafeInteger(maxWorkingBytes)&&maxWorkingBytes>=0,'Invalid cached preview bounds.');
 // Byte stores may reserve their own bounded staging window (including the
 // ZERO masked-vote reader and two default IndexedDB read-cache pages).
 // Leave it genuinely free instead of double-paying
 // it in the outer reservation or evicting an authoritative cache on read.
 const available=Math.min(maxWorkingBytes,previewRoom(budget))-nestedReaderBytes,admittedPixels=Math.min(maxPixels,Math.floor((available-fixedBytes)/bytesPerPixel));if(admittedPixels<1)throw new EngineError('MEMORY_LIMIT','The native result leaves no admitted cached-preview workspace.');
 let low=Math.max(1,Math.ceil(Math.max(width,height)/maxSide)),high=Math.max(width,height);while(low<high){const mid=low+Math.floor((high-low)/2);if(Math.ceil(width/mid)*Math.ceil(height/mid)<=admittedPixels)high=mid;else low=mid+1;}
 const step=low,w=Math.ceil(width/step),h=Math.ceil(height/step),reservedBytes=fixedBytes+w*h*bytesPerPixel,bytes=reservedBytes+nestedReaderBytes;
 return{x:0,y:0,w:width,h:height,step,width:w,height:h,pixels:w*h,bytes,reservedBytes,nestedReaderBytes,admittedPixels};
}
const prepaid=()=>()=>{},prepaidBudget={reserve:prepaid};
// A failed source ACK remains attached to the exact source/master identity.
// Source owners must also call retireCachedPreviewSamples before forgetting
// their record or closing a retained-view master. No AbortSignal is retained.
const pendingSamples=new WeakMap(),sampleOwner=owner=>owner?.surface??owner;
export function hasCachedPreviewSamples(owner){return !!pendingSamples.get(sampleOwner(owner))?.size;}
export async function retireCachedPreviewSamples(owner){
 const pending=pendingSamples.get(sampleOwner(owner));if(!pending)return;
 await retireCompositeOwners([...pending].map(entry=>()=>entry.retire()));
}
function retainSample(owner){
 const key=sampleOwner(owner);requireValue(key&&typeof key==='object','A cached sample requires its source owner.');
 let pending=pendingSamples.get(key);if(!pending){pending=new Set();pendingSamples.set(key,pending);}
 let finish;const ready=new Promise(resolve=>finish=resolve),entry={frame:null,parent:null,retiring:null,complete:false,finish,
  retire(){
   if(entry.complete)return;if(entry.retiring)return entry.retiring;
   const task=(async()=>{await ready;if(entry.frame){await entry.frame.release?.();entry.frame=null;}if(entry.parent){await entry.parent.dispose();entry.parent=null;}entry.complete=true;pending.delete(entry);if(!pending.size&&pendingSamples.get(key)===pending)pendingSamples.delete(key);})();
   entry.retiring=task;void task.finally(()=>{if(entry.retiring===task)entry.retiring=null;}).catch(()=>{});return task;
  }
 };pending.add(entry);return entry;
}
async function copyCachedSample(owner,read,{signal,lease}={}){
 checkAbort(signal);await retireCachedPreviewSamples(owner);checkAbort(signal);
 const entry=retainSample(owner);let primary,pixels;
 try{entry.parent=lease?.();entry.frame=await read(entry.parent);checkAbort(signal);pixels={...entry.frame.pixels,data:entry.frame.pixels.data.slice()};}
 catch(error){primary=error;throw error;}
 finally{entry.finish();await retireCompositeOwners([()=>entry.retire()],primary?{primary}:{});}
 checkAbort(signal);return pixels;
}
export async function sampleCachedSource(image,tile,{signal}={}){
 const surface=image.surface,pixels=image.pixels;
 return copyCachedSample(surface??image,()=>{
  if(surface?.readSampledWindow)return surface.readSampledWindow(tile,{signal,reserve:prepaid,budget:prepaidBudget});
  if(pixels)return samplePixels(pixels,tile,{signal});
  previewUnavailable('The retained source has no sampled reader.');
 },{signal});
}
async function sampleLease(master,tile,signal){return copyCachedSample(master,lease=>{if(!lease.readSampledWindow)previewUnavailable('The retained view has no sampled reader.');return lease.readSampledWindow(tile,{signal,reserve:prepaid,budget:prepaidBudget});},{signal,lease:()=>master.lease()});}
const done=(pixels,g,metrics,details={})=>({pixels:{...pixels,logicalWidth:g.w,logicalHeight:g.h},exact:false,metrics:{cacheOnly:true,nativeAnalysisCalls:0,inferenceCalls:0,scientificFinalChanged:false,admittedPreviewBytes:g.bytes,sampleDimensions:[pixels.width,pixels.height],...metrics},preview:{provisional:true,...details}});
/** ZERO drafts borrow only the existing native analysis. They never rerun grid
 * voting, JPEG99, region detection, or a forensic analysis of resized bytes. */
export async function previewCachedZero(image,analysis,input,preview,{budget,signal}={}){
 const p=zeroParams(input);if(!analysis||analysis.missingEnabled!==p.missing)previewUnavailable('The requested native ZERO analysis is not retained.');const {width,height}=analysis,g=cachedPreviewGeometry(width,height,preview,budget,{bytesPerPixel:64,fixedBytes:Math.max(width*32,1024*1024)}),release=reservePreview(budget,g.reservedBytes);let unpin;
 try{
  checkAbort(signal);unpin=analysis.retain?.();const planes=analysis.planes??analysis.data,hasRegion=analysis.hasRegion??(planes.mask_f_reg.some(x=>x>0)||planes.mask_m_reg.some(x=>x>0)),data=new Uint8Array(g.pixels*3),keys=p.view===1?['votes']:p.view===2?['votes_jpeg']:p.view===3?['mask_f_reg']:p.view===4?['mask_m_reg']:['luminance','mask_f_reg','mask_m_reg'];
  const rows=Object.fromEntries(keys.map(key=>[key,new Float64Array(width)]));
  for(let y=0;y<g.height;y++){
   await controlCheckpoint(signal);const offset=y*g.step*width;
   for(const key of keys){const plane=planes[key],row=rows[key];if(plane.readInto){const bytes=new Uint8Array(width);await plane.readInto(bytes,offset);row.set(bytes);}else row.set(plane.subarray(offset,offset+width));}
   for(let x=0;x<g.width;x++){const source=x*g.step,at=(y*g.width+x)*3;
    if(p.view===1||p.view===2){const value=rows[keys[0]][source];if(value>=0&&value<64)data.set(ZERO_PALETTE.slice(value*3,value*3+3),at);}
    else if(p.view===3||p.view===4)data.fill(rows[keys[0]][source],at,at+3);
    else{data.fill(Math.trunc(rows.luminance[source]*(hasRegion?.2:1)),at,at+3);if(rows.mask_f_reg[source]>0)data[at]=255;else if(rows.mask_m_reg[source]>0)data[at+2]=255;}
   }
  }
  checkAbort(signal);return done({width:g.width,height:g.height,format:'rgb8',data},g,{exactNativeSamples:true,view:p.view},{view:p.view,nativeMissingGrid:p.missing});
 }finally{try{await unpin?.();}finally{release();}}
}
/** A draft keeps the detected native period fixed. New Farneback work is
 * confined to the sampled aligned pair; the native flow cache is never changed. */
export async function previewCachedStereo(image,cache,input,preview,{budget,signal}={}){
 const cooperate=createCooperator(signal),p=stereoParams(input),descriptor=image.surface?.descriptor??image.pixels,width=descriptor?.width,height=descriptor?.height,offset=cache?.offset;
 if(!cache||!Number.isInteger(offset)||offset<0)previewUnavailable('A retained native stereogram period is required.');requireValue(offset<width,'Invalid retained stereo period.');
 const g=cachedPreviewGeometry(width-offset,height,preview,budget,{bytesPerPixel:p.mode>=2?256:96,fixedBytes:32*MiB+Math.max(Math.max(width,height)*32,MiB)}),release=reservePreview(budget,g.reservedBytes);let pixels;
 try{
  checkAbort(signal);const nativeView=cache.views?.get(p.mode);if(nativeView){pixels=await sampleLease(nativeView,g,signal);checkAbort(signal);return done(pixels,g,{exactNativeSamples:true,viewCached:true,proxyFlow:false},{nativeOffset:offset,mode:p.mode});}
  let pattern;if(cache.views?.get(0))pattern=await sampleLease(cache.views.get(0),g,signal);else if(cache.pattern){const frame=await samplePixels(cache.pattern,g,{signal});try{pattern={...frame.pixels,data:frame.pixels.data.slice()};}finally{frame.release?.();}}else previewUnavailable('The retained native stereo pattern is unavailable.');
  let flow,proxyFlow=false;if(p.mode>=2){
   if(cache.flow?.values){flow=new Float32Array(g.pixels);for(let y=0;y<g.height;y++){await cooperate();for(let x=0;x<g.width;x++)flow[y*g.width+x]=cache.flow.values[y*g.step*g.w+x*g.step];}}
   else if(cache.flow?.plane){flow=new Float32Array(g.pixels);for(let y=0;y<g.height;y++){await cooperate();const row=await cache.flow.plane.read(0,y*g.step,g.w,1,{signal});for(let x=0;x<g.width;x++)flow[y*g.width+x]=row[x*g.step];}}
   else{
    const tile={x:0,y:0,w:g.w,h:g.h,step:g.step},left=await sampleCachedSource(image,tile,{signal}),right=await sampleCachedSource(image,{...tile,x:offset},{signal}),combined={width:g.width*2,height:g.height,format:'rgb8',data:new Uint8Array(g.pixels*6)};
    for(let y=0;y<g.height;y++){await cooperate();combined.data.set(left.data.subarray(y*g.width*3,(y+1)*g.width*3),y*g.width*6);combined.data.set(right.data.subarray(y*g.width*3,(y+1)*g.width*3),y*g.width*6+g.width*3);}flow=(await cvStereoPrepare(combined,2,g.width,{signal})).values;proxyFlow=true;
   }
  }
  pixels=await cvStereoView(pattern,p.mode,flow,{signal});checkAbort(signal);return done(pixels,g,{exactNativeSamples:p.mode===0,viewCached:false,proxyFlow},{nativeOffset:offset,mode:p.mode,periodSearchCalls:0,flowSampling:'bounded aligned native-pair samples'});
 }finally{release();}
}
