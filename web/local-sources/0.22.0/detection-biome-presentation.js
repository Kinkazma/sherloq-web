import {createBatchScopeMask} from './batch-scope-mask.js?v=0.22.0';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';

const invalid=message=>new EngineError('INVALID_INPUT',message);
const rowsPerMask=32;
// Source RGB, derived RGB/mask, RGBA upload/readback and canvas backing. The
// caller admits this bound before reading a frame or allocating its canvas.
export function biomePresentationWorkingBytes(width,height,sourceWidth,sourceHeight,{scoped=false}={}){
 if(![width,height,sourceWidth,sourceHeight].every(value=>Number.isSafeInteger(value)&&value>0)||!Number.isSafeInteger(width*height*20+sourceWidth*Math.min(rowsPerMask,sourceHeight)))throw invalid('Invalid biome presentation window dimensions.');
 return width*height*20+(scoped?sourceWidth*Math.min(rowsPerMask,sourceHeight):0);
}
function eligibility(mask,frame,{x,y,step},signal){
 const result=new Uint8Array(frame.width*frame.height);let stripe;
 try{
  for(let row=0;row<frame.height;row++){
   checkAbort(signal);const originalY=y+row*step;if(!stripe||originalY>=stripe.top+stripe.height){stripe?.release();stripe=mask.readRows(originalY,Math.min(rowsPerMask,mask.policy.height-originalY),{signal});}
   const start=(originalY-stripe.top)*mask.policy.width+x;for(let column=0;column<frame.width;column++)result[row*frame.width+column]=stripe.data[start+column*step];
  }
  return result;
 }finally{stripe?.release();}
}

// Native group geometry is retained separately. Admission is computed on exact
// original pixel centres before composition; rejected samples keep their source
// RGB. Neither native pairs, scientific masks, NPZ nor edited hulls are changed.
export function composeBiomeWindow(frame,groups,{x=0,y=0,step=1}={}, {scope,source,signal,budget,canvasFactory=(width,height)=>new OffscreenCanvas(width,height),imageDataFactory=(data,width,height)=>new ImageData(data,width,height)}={}){
 checkAbort(signal);if(!frame||frame.format!=='rgb8'||!(frame.data instanceof Uint8Array)||![frame.width,frame.height].every(value=>Number.isSafeInteger(value)&&value>0)||frame.data.length!==frame.width*frame.height*3||![x,y,step].every(Number.isSafeInteger)||x<0||y<0||step<1||!Array.isArray(groups))throw invalid('Invalid biome presentation RGB window.');
 const original=source??(!scope?{width:x+(frame.width-1)*step+1,height:y+(frame.height-1)*step+1}:null);if(!original||![original.width,original.height].every(value=>Number.isSafeInteger(value)&&value>0)||x+(frame.width-1)*step>=original.width||y+(frame.height-1)*step>=original.height)throw invalid('Biome window differs from its original source dimensions.');
 const mask=scope?createBatchScopeMask(scope,{width:original.width,height:original.height,sourceSha256:original.sha256}):null;
 for(const group of groups)if(!Array.isArray(group?.color)||group.color.length!==3||!group.color.every(c=>Number.isInteger(c)&&c>=0&&c<=255)||!Array.isArray(group.polygons)||group.polygons.length!==2||group.polygons.some(poly=>!Array.isArray(poly)||!poly.length||poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))throw invalid('Native paired biome geometry is invalid.');
 if(!groups.length)return frame;
 const free=budget?.reserve(biomePresentationWorkingBytes(frame.width,frame.height,original.width,original.height,{scoped:!!mask}))??(()=>{});let canvas;
 try{
  const admitted=mask?eligibility(mask,frame,{x,y,step},signal):null;checkAbort(signal);canvas=canvasFactory(frame.width,frame.height);const ctx=canvas.getContext('2d');if(!ctx)throw invalid('Biome presentation canvas unavailable.');
  const rgba=new Uint8ClampedArray(frame.width*frame.height*4);for(let i=0;i<frame.width*frame.height;i++){rgba.set(frame.data.subarray(i*3,i*3+3),i*4);rgba[i*4+3]=255;}
  ctx.putImageData(imageDataFactory(rgba,frame.width,frame.height),0,0);ctx.save();ctx.scale(1/step,1/step);ctx.translate(-x,-y);
  for(const group of groups){checkAbort(signal);ctx.fillStyle=`rgba(${group.color.join(',')},0.28)`;ctx.strokeStyle=`rgb(${group.color.join(',')})`;ctx.lineWidth=2;for(const poly of group.polygons){ctx.beginPath();poly.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));if(poly.length>2){ctx.closePath();ctx.fill();}ctx.stroke();}}
  ctx.restore();checkAbort(signal);const pixels=ctx.getImageData(0,0,frame.width,frame.height).data,data=new Uint8Array(frame.width*frame.height*3);
  for(let i=0;i<frame.width*frame.height;i++){if(i%65536===0)checkAbort(signal);data.set(admitted&&!admitted[i]?frame.data.subarray(i*3,i*3+3):pixels.subarray(i*4,i*4+3),i*3);}return {...frame,data};
 }finally{if(canvas)canvas.width=canvas.height=1;free();}
}
