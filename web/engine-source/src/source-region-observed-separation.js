import {checkAbort,controlCheckpoint,requireValue} from './errors.js';
import {gray} from './pixel-utils.js';
import {sourceRegionLocalSupport} from './source-region-local-support.js';
import {sourceRegionDerivativeBoundaryRuns} from './source-region-observed-derivatives.js';
import {separationObservedRows,separationNlmPoints,separationHalo} from './separation-math.js';
export {sourceRegionDerivativeBoundaryRuns as sourceRegionSeparationBoundaryRuns};
const reflect=(x,n)=>{if(n===1)return 0;const period=2*n-2;let v=x%period;if(v<0)v+=period;return v<n?v:period-v;};
export const observedSeparationWorkingBytes=(width,radius)=>width*((2*radius+1)**2*3+(2*radius+1)*3+3)+(width+2*radius)*(2*radius+1)*4+256;
// Only observed boundary centres use this policy. Complete native support keeps
// the unchanged filter. NLM keeps its7x7 template and21x21 search on a centred
// reflected patch; the native point primitive visits only required centres with identical fixed-point sums.
export async function sourceRegionObservedSeparation(view,domain,core,p,{signal}={}){
 requireValue(core.observedBoundary&&core.height===1&&core.width>0,'An observed separation boundary row is required.');
 const radius=separationHalo(p),support=sourceRegionLocalSupport(domain,core,radius),lease=await view.readMaskedWindow(support,{signal});
 try{const {data,membership}=lease.pixels;let filtered;
  if(p.mode<4){const all=await separationObservedRows(lease.pixels,p,core.y-support.y,1,membership,{signal,nativeOriginX:support.x,nativeWidth:domain.width});filtered=all.slice((core.x-support.x)*3,(core.x-support.x+core.width)*3);}
  else{const side=2*radius+1,atlasWidth=core.width*side,atlas=new Uint8Array(atlasWidth*side*3),observed=(x,y)=>membership[(y-support.y)*support.width+x-support.x]===1;
   for(let i=0;i<core.width;i++){if((i&15)===0)await controlCheckpoint(signal);const x=core.x+i,y=core.y;requireValue(observed(x,y),'A separation centre is absent from its domain.');for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    let sx=reflect(x+dx,domain.width),sy=reflect(y+dy,domain.height);if(!observed(sx,sy)){sx=reflect(x-dx,domain.width);sy=reflect(y-dy,domain.height);if(!observed(sx,sy)){sx=x;sy=y;}}const at=((sy-support.y)*support.width+sx-support.x)*3;atlas.set(data.subarray(at,at+3),((dy+radius)*atlasWidth+i*side+dx+radius)*3);
   }}
   const native=await separationNlmPoints({width:atlasWidth,height:side,format:'rgb8',data:atlas},p,{signal});filtered=new Uint8Array(core.width*3);for(let i=0;i<core.width;i++)filtered.set(native.subarray((i*side+radius)*3,(i*side+radius+1)*3),i*3);
  }
  checkAbort(signal);if(!p.denoised)for(let i=0;i<core.width;i++){const at=((core.y-support.y)*support.width+core.x-support.x+i)*3,g=p.grayscale?gray(data[at],data[at+1],data[at+2]):0;for(let c=0;c<3;c++)filtered[i*3+c]=Math.abs((p.grayscale?g:data[at+c])-filtered[i*3+c]);}return filtered;
 }finally{lease.release();}
}
