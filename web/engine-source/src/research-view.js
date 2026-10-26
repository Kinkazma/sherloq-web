import {INFERNO,SAFIRE_COLORS,safireGlobalColor} from './research-palettes.js';import {requireValue,controlCheckpoint} from './errors.js';
const even=x=>{const n=Math.floor(x),r=x-n;return r<.5?n:r>.5?n+1:n%2?n+1:n;};
export async function renderResearch(image,result,{mode='overlay'}={}, {signal,reserveMemory,origin=[0,0],sourceSize=[image.width,image.height],includeLegend=true,step=1}={}){
 if(Array.isArray(result.fragments))return renderFragments(image,result,{mode},{signal,reserveMemory,origin,sourceSize,step,includeLegend});
 const method=result.metadata.method,multisource=method==='safire'&&!result.metadata.binary;requireValue(['overlay','map',...(method==='adaifl'?['mask']:[]),...(multisource?['confidence']:[])].includes(mode),'Invalid research display mode.');requireValue(typeof reserveMemory==='function','Research display requires shared memory admission.');reserveMemory(image.data.byteLength);const output=new Uint8Array(image.data.byteLength),[height,width]=result.metadata.native_shape??[1024,1024];
 for(let y=0;y<image.height;y++){
  if(y%32===0)await controlCheckpoint(signal);const sy=Math.floor((y*step+origin[1])*height/sourceSize[1]);
  for(let x=0;x<image.width;x++){
   const i=sy*width+Math.floor((x*step+origin[0])*width/sourceSize[0]),at=(y*image.width+x)*3;let color;
   if(mode==='mask'){const v=result.mask[i]*255;color=[v,v,v];}
   else if(multisource&&mode!=='confidence')color=SAFIRE_COLORS[result.source_labels[i]];
   else{const p=even(Math.fround(Math.max(0,Math.min(1,result.map[i]))*255))*3;color=INFERNO.subarray(p,p+3);}
   for(let c=0;c<3;c++)output[at+c]=mode==='overlay'?even((image.data[at+c]+color[c])*.5):color[c];
  }
 }
 const counts=new Uint32Array(multisource&&includeLegend?result.metadata.sources:0);if(multisource&&includeLegend)for(const label of result.source_labels)counts[label]++;
 return {pixels:{format:'rgb8',width:image.width,height:image.height,data:output},style:{mode},legend:multisource&&includeLegend?SAFIRE_COLORS.slice(0,result.metadata.sources).map((rgb,i)=>({source:i,color:rgb,fraction:counts[i]/result.source_labels.length})):null};
}

async function renderFragments(image,result,view,{signal,reserveMemory,origin,sourceSize,step,includeLegend}){
 requireValue(result.metadata?.strictSourceRegions?.schema==='sherloq.strict-research/1'&&['safire','focal','adaifl'].includes(result.metadata.method)&&Number.isSafeInteger(step)&&step>0&&typeof reserveMemory==='function','Invalid strict research presentation.');
 const size=sourceSize.every(v=>v>0)?sourceSize:[result.width,result.height];requireValue(size.every(v=>Number.isSafeInteger(v)&&v>0),'Invalid strict research source grid.');
 const multisource=result.metadata.method==='safire'&&!result.metadata.binary;
 requireValue(['overlay','map',...(multisource?['confidence']:[]),...(result.metadata.method==='adaifl'?['mask']:[])].includes(view.mode),'Invalid strict research display mode.');
 reserveMemory(image.data.byteLength);const output=image.data.slice();
 for(const fragment of result.fragments){
  await controlCheckpoint(signal);const b=fragment.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]>b[1]&&b[2]<=size[0]&&b[3]<=size[1]&&fragment.metadata?.method===result.metadata.method,'Invalid strict research native fragment bounds.');
  const x0=Math.max(0,Math.ceil((b[0]-origin[0])/step)),y0=Math.max(0,Math.ceil((b[1]-origin[1])/step)),x1=Math.min(image.width,Math.ceil((b[2]-origin[0])/step)),y1=Math.min(image.height,Math.ceil((b[3]-origin[1])/step)),w=x1-x0,h=y1-y0;if(w<=0||h<=0)continue;
  const shape=fragment.metadata.native_shape;requireValue(Array.isArray(shape)&&shape.length===2&&shape.every(v=>Number.isSafeInteger(v)&&v>0)&&fragment.map?.length===shape[0]*shape[1]&&(view.mode!=='mask'||fragment.mask?.length===fragment.map.length),'Invalid strict research native grid.');
  for(let y=y0;y<y1;y++){
   if(y%32===0)await controlCheckpoint(signal);const row=Math.floor((origin[1]+y*step-b[1])*shape[0]/(b[3]-b[1]));
   for(let x=x0;x<x1;x++){
    const i=row*shape[1]+Math.floor((origin[0]+x*step-b[0])*shape[1]/(b[2]-b[0])),at=(y*image.width+x)*3;let color;
    if(result.metadata.method==='safire'&&(!multisource||view.mode==='confidence')&&fragment.analysis_scope?.[i]!==1)continue;
    if(multisource&&view.mode!=='confidence'){requireValue(fragment.source_labels instanceof Uint32Array&&fragment.source_labels.length===fragment.map.length,'Invalid global SAFIRE labels.');color=safireGlobalColor(fragment.source_labels[i]);}
    else 
    if(view.mode==='mask'){const v=fragment.mask[i]*255;color=[v,v,v];}else{const value=fragment.map[i];requireValue(Number.isFinite(value),'Non-finite native research fragment sample.');const p=even(Math.fround(Math.max(0,Math.min(1,value))*255))*3;color=INFERNO.subarray(p,p+3);}
    for(let c=0;c<3;c++)output[at+c]=view.mode==='overlay'?even((image.data[at+c]+color[c])*.5):color[c];
   }
  }
 }
 return{pixels:{format:'rgb8',width:image.width,height:image.height,data:output},style:{mode:view.mode,outsideDomain:'original-unanalysed'},legend:multisource&&includeLegend?(result.metadata.globalClasses??[]).map((value,id)=>({source:id,color:safireGlobalColor(id)})):null};
}
