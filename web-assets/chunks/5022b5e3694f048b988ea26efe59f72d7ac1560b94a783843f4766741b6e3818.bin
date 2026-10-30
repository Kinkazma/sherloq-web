import "../../runtime-context.js?v=0.30.0";
import {Budget} from './cache.js';
import {allocateTypedArray} from './allocation.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
// One already certified native JPEG context. Geometry is decided upstream by
// the unchanged admitted-context planner, before this reader can see pixels.
export function ghostContextInputPlan(surface){
 const {width,height,sourceWidth=width}=surface.descriptor,rows=Math.min(32,height),rgbBytes=width*height*3,bandBytes=width*rows*3,scratchBytes=sourceWidth*3;
 requireValue(Number.isInteger(width)&&width>=16&&width<=65500&&Number.isInteger(height)&&height>=16&&height<=65500&&Number.isSafeInteger(rgbBytes)&&Number.isSafeInteger(scratchBytes)&&scratchBytes>=width*3,'Native Ghost RGB context required.');
 const scratchAllocationBytes=2*bandBytes+scratchBytes,temporaryBytes=bandBytes+1024**2+4096;
 return {width,height,rows,rgbBytes,bandBytes,scratchBytes,scratchAllocationBytes,temporaryBytes,totalBytes:rgbBytes+scratchAllocationBytes+temporaryBytes};
}
export async function readGhostContextInput(surface,{budget,signal,onProgress,registry}={}){
 const plan=ghostContextInputPlan(surface),free=budget.reserve(plan.totalBytes),loans=new Set(),owners=[];let owned,closed=false,closing;
 const entry={image:null,plan,release(){
  if(closed)return;if(closing)return closing;
  closing=(async()=>{for(const loan of [...loans]){await loan.release?.();loans.delete(loan);}if(owned)await owned.release();else await free();entry.image=null;closed=true;registry?.delete(entry);})().finally(()=>{closing=null;});return closing;
 }};registry?.add(entry);
 try{
  const rgb=allocateTypedArray(Uint8Array,plan.rgbBytes,{label:'Ghost-admitted-native-RGB'}),scratch=allocateTypedArray(Uint8Array,plan.scratchAllocationBytes,{label:'Ghost-native-source-scratch'}),ioBudget=new Budget(plan.temporaryBytes),cooperate=createCooperator(signal);
  owned=ownGpuArrays({data:rgb,scratch},free,owners,budget,{width:plan.width,height:plan.height,format:'rgb8'});
  for(const array of [rgb,scratch])owners.push({bytes:array.byteLength,release:budget.registerBacking?.('array-buffer',array.byteLength,{owner:'ela',label:'Ghost-admitted-source-input',identity:array.buffer})});entry.image=owned;
  for(let y=0;y<plan.height;y+=plan.rows){
   await cooperate();const count=Math.min(plan.rows,plan.height-y),rect={x:0,y,width:plan.width,height:count},target=rgb.subarray(y*plan.width*3,(y+count)*plan.width*3),options={signal,reserve:bytes=>ioBudget.reserve(bytes),scratch:scratch.subarray(2*plan.bandBytes),rollScratch:scratch.subarray(0,plan.bandBytes),owner:'ela'};let loan,rowFailed=false,rowPrimary;
   try{
    if(typeof surface.readWindowInto==='function')loan=await surface.readWindowInto(rect,target,options);
    else{loan=await surface.readWindow(rect,options);if(loan)loans.add(loan);requireValue(loan?.pixels?.data instanceof Uint8Array&&loan.pixels.data.length===target.length,'Complete admitted Ghost RGB rows required.');target.set(loan.pixels.data);}
    if(loan&&!loans.has(loan))loans.add(loan);checkAbort(signal);
   }catch(error){rowFailed=true;rowPrimary=error;}
   if(loan)try{await loan.release?.();loans.delete(loan);}catch(cleanup){if(!rowFailed){rowFailed=true;rowPrimary=cleanup;}else attachGpuCleanup(rowPrimary,cleanup);}
   if(rowFailed)throw rowPrimary;
   onProgress?.({phase:'ghost-gpu-source',completed:y+count,total:plan.height});
  }
  checkAbort(signal);return entry;
 }catch(primary){try{await entry.release();}catch(cleanup){attachGpuCleanup(primary,cleanup);}throw primary;}
}
