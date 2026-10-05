import "../../runtime-context.js?v=0.14.5";
import {INFERNO,SAFIRE_COLORS} from './research-palettes.js';import {requireValue,controlCheckpoint} from './errors.js';
const even=x=>{const n=Math.floor(x),r=x-n;return r<.5?n:r>.5?n+1:n%2?n+1:n;};
export async function renderResearch(image,result,{mode='overlay'}={}, {signal,reserveMemory,origin=[0,0],sourceSize=[image.width,image.height],includeLegend=true}={}){
 const method=result.metadata.method,multisource=method==='safire'&&!result.metadata.binary;requireValue(['overlay','map',...(method==='adaifl'?['mask']:[]),...(multisource?['confidence']:[])].includes(mode),'Invalid research display mode.');requireValue(typeof reserveMemory==='function','Research display requires shared memory admission.');reserveMemory(image.data.byteLength);const output=new Uint8Array(image.data.byteLength),[height,width]=result.metadata.native_shape??[1024,1024];
 for(let y=0;y<image.height;y++){
  if(y%32===0)await controlCheckpoint(signal);const sy=Math.floor((y+origin[1])*height/sourceSize[1]);
  for(let x=0;x<image.width;x++){
   const i=sy*width+Math.floor((x+origin[0])*width/sourceSize[0]),at=(y*image.width+x)*3;let color;
   if(mode==='mask'){const v=result.mask[i]*255;color=[v,v,v];}
   else if(multisource&&mode!=='confidence')color=SAFIRE_COLORS[result.source_labels[i]];
   else{const p=even(Math.fround(Math.max(0,Math.min(1,result.map[i]))*255))*3;color=INFERNO.subarray(p,p+3);}
   for(let c=0;c<3;c++)output[at+c]=mode==='overlay'?even((image.data[at+c]+color[c])*.5):color[c];
  }
 }
 const counts=new Uint32Array(multisource&&includeLegend?result.metadata.sources:0);if(multisource&&includeLegend)for(const label of result.source_labels)counts[label]++;
 return {pixels:{format:'rgb8',width:image.width,height:image.height,data:output},style:{mode},legend:multisource&&includeLegend?SAFIRE_COLORS.slice(0,result.metadata.sources).map((rgb,i)=>({source:i,color:rgb,fraction:counts[i]/result.source_labels.length})):null};
}
