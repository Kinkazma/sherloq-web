import "../../runtime-context.js?v=0.25.0";
import {denseGray,denseDescriptorShape,canonicalDenseSift} from './dense-math.js';
import {alignDenseSupports} from './dense-links.js';
import {checkAbort,requireValue} from './errors.js';

// Same native branch as dense-worker's float32 descriptor path. This helper
// receives one complete admitted RGB context, never a black-filled envelope.
export function strictDenseDescriptors({rgb,width,height,pass,texture=2,regions=[]},{math,eligibility,signal}={}){
 checkAbort(signal);
 requireValue(rgb instanceof Uint8Array&&rgb.length===width*height*3,'A complete native dense RGB context is required.');
 const support=Math.max(pass.patch,pass.targetPatch);
 denseDescriptorShape(width,height,pass.method,support);
 const {mask}=eligibility.allowed({width,height,data:rgb},{method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch,texture,regions,signal});
 const gray=denseGray(rgb),reflection=pass.reflection&&pass.targetPatch===pass.patch;
 let descriptors=math.features(gray,width,height,{method:pass.method,patch:pass.patch,reflection,signal});
 if(pass.targetPatch!==pass.patch){
  const target=math.features(gray,width,height,{method:1,patch:pass.targetPatch,reflection:pass.reflection,signal});
  descriptors=alignDenseSupports(descriptors,target,pass.patch,pass.targetPatch);
 }
 if(pass.quarterTurn){
  const a=canonicalDenseSift(descriptors.first),b=descriptors.first===descriptors.second?a:canonicalDenseSift(descriptors.second);
  for(let i=0;i<mask.length;i++)if(!a[i]||!b[i])mask[i]=0;
 }
 checkAbort(signal);
 return{...descriptors,mask,heapBytes:math.heapBytes+eligibility.heapBytes};
}
