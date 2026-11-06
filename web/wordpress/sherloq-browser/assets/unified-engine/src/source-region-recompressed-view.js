import "../../runtime-context.js?v=0.31.0";
import {checkAbort,requireValue,EngineError} from './errors.js';

// The store was filled by encoding complete admitted Original contexts. This
// reader only changes their pixel supplier; it keeps the existing membership
// and never reads sparse storage belonging to an excluded observation.
export function createRecompressedSourceRegionView(view,domain,store,{budget,signal}={}){
 requireValue(view&&typeof view.admittedRectangles==='function'&&typeof view.includesRectangle==='function'&&typeof store?.readInto==='function'&&typeof budget?.reserve==='function','An admitted source view, recompressed store and shared budget are required.');
 function rectangle(value){
  requireValue(value&&['x','y','width','height'].every(k=>Number.isSafeInteger(value[k]))&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&value.x+value.width<=domain.width&&value.y+value.height<=domain.height,'A recompressed source window must remain inside its admitted native grid.');
  requireValue(Number.isSafeInteger(value.width*value.height*4),'Recompressed source window exceeds exact integer addressing.');
  if(view.maxReadPixels!==undefined&&value.width*value.height>view.maxReadPixels)throw new EngineError('SOURCE_REGION_WINDOW_LIMIT','Split this native window instead of reducing its resolution.');
  return value;
 }
 async function read(value,masked,{signal:extra}={}){
  checkAbort(signal);checkAbort(extra);const rect=rectangle(value),count=rect.width*rect.height;
  if(!masked&&!view.includesRectangle(rect))throw new EngineError('SOURCE_REGION_PARTIAL_WINDOW','This operation must use admitted spans or its explicit membership-aware adapter.');
  const release=budget.reserve(count*(masked?4:3));let committed=false;
  try{
   const data=new Uint8Array(count*3),membership=masked?new Uint8Array(count):null;let included=0;
   for(const part of view.admittedRectangles(rect))for(let row=0;row<part.height;row++){
    checkAbort(signal);checkAbort(extra);const destination=(part.y+row-rect.y)*rect.width+part.x-rect.x;
    await store.readInto(data.subarray(destination*3,(destination+part.width)*3),((part.y+row)*domain.width+part.x)*3);
    membership?.fill(1,destination,destination+part.width);included+=part.width;
   }
   checkAbort(signal);checkAbort(extra);if(!masked)requireValue(included===count,'A native recompressed window lost admitted observations.');
   let released=false;committed=true;
   return {pixels:{width:rect.width,height:rect.height,format:masked?'rgb8-membership':'rgb8',data,...(masked?{membership}:{})},included,origin:[rect.x,rect.y],originalOrigin:domain.toOriginal?.([rect.x,rect.y])??[domain.origin[0]+rect.x,domain.origin[1]+rect.y],release(){if(!released){released=true;release();}}};
  }finally{if(!committed)release();}
 }
 return {descriptor:view.descriptor,domain,maxReadPixels:view.maxReadPixels,readWindow:(rect,hooks)=>read(rect,false,hooks),readMaskedWindow:(rect,hooks)=>read(rect,true,hooks)};
}
