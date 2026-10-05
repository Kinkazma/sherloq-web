import {separationRows} from './separation-math.js';import {gray} from './pixel-utils.js';
// The job owns its input window. Residual creation happens before transferring
// output back, so original source/cache buffers never need to be detached.
export async function separationStage(image,p,start,rows,hooks={}){
 const began=performance.now(),bytes=await separationRows(image,p,start,rows,hooks),kernelMs=performance.now()-began,at=performance.now(),equalize=!p.denoised&&p.levels===0,histograms=equalize?new Float64Array(768):null;
 if(!p.denoised){
  const original=image.data,offset=start*image.width*3,lut=equalize?null:Uint8Array.from({length:256},(_,i)=>Math.min(255,Math.trunc(255*i/p.levels)));
  for(let i=0;i<bytes.length;i+=3){const j=offset+i,g=p.grayscale?gray(original[j],original[j+1],original[j+2]):0;for(let c=0;c<3;c++){const value=Math.abs((p.grayscale?g:original[j+c])-bytes[i+c]);if(equalize){histograms[c*256+value]++;bytes[i+c]=value;}else bytes[i+c]=lut[value];}}
 }
 return {bytes,histograms,kernelMs,postprocessMs:performance.now()-at};
}
