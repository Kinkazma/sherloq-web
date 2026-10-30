import "../../runtime-context.js?v=0.30.0";
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';
import {gray,equalizeHistogramLut} from './pixel-utils.js';
import {cvPixels} from './opencv.js';
import {segmentedSeparation} from './segmented-separation.js';
// Contiguous API adapter for the same bounded full-width pipeline used by
// segmented images. No source plane is detached or published as a result.
export async function separationComputeGpu(image,p,hooks={},context={}){
 const began=performance.now(),{budget,profile,backend='auto',cpuKernel='auto'}=context,{signal,onProgress}=hooks;
 if(!budget||backend==='cpu')return{pixels:await cvPixels(image,2,[p.mode,p.radius,p.sigma,+p.grayscale,+p.denoised,p.levels],hooks),semantics:'Original native separation filter, residual and global equalization.',engineMetrics:{backend:'cpu'}};
 const w=image.width,h=image.height;requireValue(image.data instanceof Uint8Array&&image.data.length===w*h*3,'Immutable original RGB8 separation image required');
 const original={surface:{descriptor:{width:w,height:h,format:'rgb8'},async readWindow({x=0,y=0,width=w,height=h}={},{signal}={}){
  checkAbort(signal);requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=w&&y+height<=h,'Separation memory window bounds');
  const free=budget.reserve(width*height*3);try{const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)data.set(image.data.subarray(((y+row)*w+x)*3,((y+row)*w+x+width)*3),row*width*3);let live=true;return{pixels:{width,height,format:'rgb8',data},release(){if(live){live=false;free();}}};}catch(error){free();throw error;}
 }}};
 let filterComputed=false;
 const computeFilter=async()=>{filterComputed=true;let result,window,copyCredit,failed=false,primary;try{result=await segmentedSeparation(original,{...p,denoised:true,levels:0},{budget,signal,onProgress:f=>onProgress?.(.9*f),backend,maxWorkers:cpuKernel==='auto'?(profile?.maxWorkers??1):1});window=await result.surface.readWindow({}, {signal});copyCredit=budget.reserve(w*h*3);const filtered=window.pixels.data.slice();checkAbort(signal);return{filtered,semantics:result.semantics,metrics:result.metrics};}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>window?.release(),()=>result?.surface.dispose(),()=>copyCredit?.()],failed?{primary}:{});}};
 // The digest includes the actual bounded RGB view, not merely its original
 // file identity: different same-sized ROIs cannot alias the useful cache.
 let filtered;
 if(context.memoImage&&globalThis.crypto?.subtle){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image.data)),v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);filtered=await context.memoImage('separation-filter-v1/'+[digest,w,h,p.mode,p.radius,p.mode===3?p.sigma:0,+p.grayscale].join('/'),computeFilter);}else filtered=await computeFilter();
 checkAbort(signal);const credit=budget.reserve(w*h*3+6144);
 try{const bytes=filtered.filtered.slice(),histograms=!p.denoised&&p.levels===0?new Float64Array(768):null,started=performance.now();
  if(!p.denoised){const lut=p.levels===0?null:Uint8Array.from({length:256},(_,i)=>Math.min(255,Math.trunc(255*i/p.levels)));for(let i=0;i<bytes.length;i+=3){const g=p.grayscale?gray(image.data[i],image.data[i+1],image.data[i+2]):0;for(let c=0;c<3;c++){const residual=Math.abs((p.grayscale?g:image.data[i+c])-bytes[i+c]);if(histograms){bytes[i+c]=residual;histograms[c*256+residual]++;}else bytes[i+c]=lut[residual];}}
   if(histograms){const tables=Array.from({length:3},(_,c)=>equalizeHistogramLut(histograms.subarray(c*256,(c+1)*256),w*h));for(let i=0;i<bytes.length;i++)bytes[i]=tables[i%3][bytes[i]];}}
  checkAbort(signal);onProgress?.(1);return{pixels:{width:w,height:h,format:'rgb8',data:bytes},semantics:filtered.semantics,engineMetrics:{...(filterComputed?filtered.metrics:{backend:'cached-native-separation-filter',filterOriginBackend:filtered.metrics.backend,gpu:null,readMs:0,kernelMs:0,writeMs:0,filterWallMs:0,sourceReads:0}),filterCacheHit:!filterComputed,renderMs:performance.now()-started,totalMs:performance.now()-began,layout:'bounded-windows-from-contiguous-original'}};
 }finally{credit();}
}
