import "../../../../../runtime-context.js?v=0.31.0";
import {createRgbSurface} from './rgb-surface.js';
import {validateParams} from './ela.js';
import {roundEven} from './pixel-utils.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateTypedArray} from './allocation.js';

// Median bytes are already rendered/HE RGB8. This is only the existing linear
// gain/contrast/gray presentation; every export/window uses the same mapping.
export function elaSynthesisPresentationLut(params){
 const p=validateParams({quality:75,linear:true,scale:params.scale??1,contrast:params.contrast??0,grayscale:false}),c=Math.min(127,Math.trunc(p.contrast/100*128)),contrast=new Uint8Array(256),lut=new Uint8Array(256),factor=Math.fround(p.scale);
 for(let x=0;x<256;x++)contrast[x]=Math.max(0,Math.min(255,(x*(-255)+c*255)/(2*c-255)));
 for(let x=0;x<256;x++)lut[x]=contrast[Math.min(255,roundEven(Math.fround(x*factor)))];return lut;
}
export function elaSynthesisPresentation(reader,{budget,presentation={},contains}={}){
 requireValue(presentation&&Object.keys(presentation).every(key=>['scale','contrast','grayscale'].includes(key)),'Unknown synthesis presentation option.');
 const params=validateParams({quality:75,scale:presentation.scale??1,contrast:presentation.contrast??0,grayscale:presentation.grayscale??false,linear:true}),identity=params.scale===1&&params.contrast===0&&!params.grayscale,{width,height}=reader.meta;
 const lutFree=budget.reserve(512),pending=new Set();let closing,lut;try{lut=elaSynthesisPresentationLut(params);}catch(error){lutFree();throw error;}
 async function readInto(target,offset,options={}){
  requireValue(!closing,'Synthesis presentation is retiring.');
  checkAbort(options.signal);if(identity){await reader.readInto(target,offset);checkAbort(options.signal);return target;}
  // Generic RGB surfaces may split at4MiB, in the middle of an RGB triple.
  // Read only the at-most-two-byte halo at each edge; grayscale still sees
  // exactly the same complete native triple as a whole-image render.
  const start=Math.floor(offset/3)*3,end=Math.min(reader.byteLength,Math.ceil((offset+target.length)/3)*3),length=end-start,aligned=start===offset&&length===target.length,release=aligned?null:budget.reserve(length);
  try{const original=aligned?target:allocateTypedArray(Uint8Array,length,{label:'synthesis-presentation-RGB-halo'});await reader.readInto(original,start);checkAbort(options.signal);const cooperate=createCooperator(options.signal);
   for(let i=0;i<original.length;i+=3){if((i%49152)===0)await cooperate();const pixel=(start+i)/3;if(contains&&!contains(pixel%width,Math.floor(pixel/width)))continue;const r=lut[original[i]],g=lut[original[i+1]],b=lut[original[i+2]];if(params.grayscale){const gray=(r*9798+g*19235+b*3735+16384)>>15;original[i]=original[i+1]=original[i+2]=gray;}else{original[i]=r;original[i+1]=g;original[i+2]=b;}}
   if(!aligned)target.set(original.subarray(offset-start,offset-start+target.length));return target;
  }finally{release?.();}
 }
 const store={byteLength:reader.byteLength,storage:'verified-synthesis-cache',readInto(target,offset,options){const task=readInto(target,offset,options);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;},dispose(){if(closing)return closing;const task=(async()=>{await Promise.allSettled([...pending]);await reader.close();lutFree();})();closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;}};
 return{surface:createRgbSurface(store,{width,height,budget}),metrics:{presentationOnly:true,recompressions:0,presentation:params,presentationIdentity:identity}};
}
