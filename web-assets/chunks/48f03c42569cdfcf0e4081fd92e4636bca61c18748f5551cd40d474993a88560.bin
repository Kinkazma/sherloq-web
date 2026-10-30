import "../../runtime-context.js?v=0.30.0";
import {attachObservedNlmCleanup} from './observed-nlm-gpu-retirement.js';
import {requireValue} from './errors.js';
import {separationRows} from './separation-math.js';import {gray} from './pixel-utils.js';
// Input/source cache buffers remain owned by the caller. A GPU result keeps its
// independent output credit until the row/core consumer finishes copying it.
export async function separationStage(image,p,start,rows,hooks={}){
 let gpu;
 try{
  const began=performance.now();gpu=hooks.gpu?.compute?await hooks.gpu.compute(image,p,start,rows,hooks,()=>separationRows(image,p,start,rows,hooks)):await hooks.gpu?.run(image,p,start,rows,hooks);if(gpu)requireValue(gpu.bytes instanceof Uint8Array&&gpu.bytes.length===image.width*rows*3&&typeof gpu.release==='function','Owned GPU separation output extent differs');const bytes=gpu?.bytes??await separationRows(image,p,start,rows,hooks),kernelMs=performance.now()-began,at=performance.now(),equalize=!p.denoised&&p.levels===0,histograms=equalize?new Float64Array(768):null;
  if(!p.denoised){const original=image.data,offset=start*image.width*3,lut=equalize?null:Uint8Array.from({length:256},(_,i)=>Math.min(255,Math.trunc(255*i/p.levels)));
   for(let i=0;i<bytes.length;i+=3){const j=offset+i,g=p.grayscale?gray(original[j],original[j+1],original[j+2]):0;for(let c=0;c<3;c++){const value=Math.abs((p.grayscale?g:original[j+c])-bytes[i+c]);if(equalize){histograms[c*256+value]++;bytes[i+c]=value;}else bytes[i+c]=lut[value];}}
  }
  return{bytes,histograms,kernelMs,postprocessMs:performance.now()-at,...(gpu?{release:gpu.release,precisionRepairs:gpu.precisionRepairs}:{})};
 }catch(error){try{await gpu?.release();}catch(cleanup){attachObservedNlmCleanup(error,cleanup);}throw error;}
}
