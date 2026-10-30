import "../../runtime-context.js?v=0.30.0";
import {denseGray,denseDescriptorShape} from './dense-math.js';
import {checkAbort,requireValue} from './errors.js';

// Reconstruct the existing lossless native provider a bounded row at a time.
// No RGB context, support, descriptor or canonical SIFT frame is changed.
export async function streamStrictDenseDescriptors({rgb,width,height,pass,texture=2,regions=[]},{math,eligibility,publish,signal}={}){
 requireValue(rgb instanceof Uint8Array&&rgb.length===width*height*3&&typeof publish==='function','Complete native RGB and an acknowledged descriptor sink are required.');
 const support=Math.max(pass.patch,pass.targetPatch),shape=denseDescriptorShape(width,height,pass.method,support);
 let {mask}=eligibility.allowed({width,height,data:rgb},{method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch,texture,regions,signal});
 const gray=denseGray(rgb),second=pass.reflection||pass.patch!==pass.targetPatch;let token=0;
 try{
  if(pass.method===1){
   math.compactPrepare(gray,width,height,{patch:pass.patch,support,quarterTurn:pass.quarterTurn,slot:0,signal});
   if(second)math.compactPrepare(gray,width,height,{patch:pass.targetPatch,support,reflection:pass.reflection,quarterTurn:pass.quarterTurn,slot:1,signal});
   if(pass.quarterTurn)mask=math.compactFilterMask(mask,{second:second?1:0,signal});
  }else math.residentPrepare(gray,width,height,{patch:pass.patch,reflection:pass.reflection,signal});
  const unpack=(slot,offset,length)=>pass.method===1?math.compactUnpack(slot,offset,length):math.residentUnpack(slot,offset,length);
  for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x+=8192){
   checkAbort(signal);const length=Math.min(8192,shape.width-x),offset=y*shape.width+x,first=unpack(0,offset,length),target=second?unpack(1,offset,length):first;
   await publish({token:++token,...shape,x,y,length,first,second:target,mask:mask.slice(offset,offset+length)});
  }
  checkAbort(signal);return{...shape,streamed:true,chunks:token,descriptorStorage:pass.method===1?'lossless-compact-sift':'resident-zernike',heapBytes:math.heapBytes+eligibility.heapBytes};
 }finally{if(pass.method===1)math.compactRelease();else math.residentRelease();}
}
