import "../../runtime-context.js?v=0.30.0";
import {retireCompositeOwners} from './composite-owner-release.js';
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
export async function sourceRegionObservedSeparation(view,domain,core,p,{signal,gpu,cooperate}={}){
 requireValue(core.observedBoundary&&core.height===1&&core.width>0,'An observed separation boundary row is required.');
 const yieldUseful=cooperate??(()=>controlCheckpoint(signal));
 const radius=separationHalo(p),support=sourceRegionLocalSupport(domain,core,radius),lease=await view.readMaskedWindow(support,{signal});
 let gpuResult,failed=false,primary;try{const {data,membership}=lease.pixels;let filtered;
  if(p.mode<4){gpuResult=await gpu?.run(lease.pixels,p,core.y-support.y,1,{signal,membership,nativeOriginX:support.x,nativeWidth:domain.width});const all=gpuResult?.bytes??await separationObservedRows(lease.pixels,p,core.y-support.y,1,membership,{signal,nativeOriginX:support.x,nativeWidth:domain.width});filtered=all.slice((core.x-support.x)*3,(core.x-support.x+core.width)*3);}
  else{const side=2*radius+1,atlasWidth=core.width*side,atlas=new Uint8Array(atlasWidth*side*3),observed=(x,y)=>membership[(y-support.y)*support.width+x-support.x]===1;
   for(let i=0;i<core.width;i++){if((i&15)===0)await yieldUseful();const x=core.x+i,y=core.y;requireValue(observed(x,y),'A separation centre is absent from its domain.');for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    let sx=reflect(x+dx,domain.width),sy=reflect(y+dy,domain.height);if(!observed(sx,sy)){sx=reflect(x-dx,domain.width);sy=reflect(y-dy,domain.height);if(!observed(sx,sy)){sx=x;sy=y;}}const at=((sy-support.y)*support.width+sx-support.x)*3;const target=((dy+radius)*atlasWidth+i*side+dx+radius)*3;atlas[target]=data[at];atlas[target+1]=data[at+1];atlas[target+2]=data[at+2];
   }}
   const image={width:atlasWidth,height:side,format:'rgb8',data:atlas};gpuResult=gpu?.compute?await gpu.compute(image,p,13,1,{signal,points:true},()=>separationNlmPoints(image,p,{signal,...(cooperate?{cooperate}:{})})):await gpu?.run(image,p,13,1,{signal,points:true});const native=gpuResult?.bytes??await separationNlmPoints(image,p,{signal,...(cooperate?{cooperate}:{})});filtered=new Uint8Array(core.width*3);for(let i=0;i<core.width;i++)filtered.set(native.subarray((i*side+radius)*3,(i*side+radius+1)*3),i*3);
  }
  checkAbort(signal);if(!p.denoised)for(let i=0;i<core.width;i++){const at=((core.y-support.y)*support.width+core.x-support.x+i)*3,g=p.grayscale?gray(data[at],data[at+1],data[at+2]):0;for(let c=0;c<3;c++)filtered[i*3+c]=Math.abs((p.grayscale?g:data[at+c])-filtered[i*3+c]);}return filtered;
 }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>gpuResult?.release(),()=>lease.release()],failed?{primary}:{});}
}
