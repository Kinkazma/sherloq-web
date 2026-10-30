import "../../runtime-context.js?v=0.30.0";
// SHERLOQ source-domain caller geometry: preserve the Original stride32 phase without reading
// excluded RGB. Synthetic input is algebraic zero AFTER common normalization.
import {requireValue,controlCheckpoint} from './errors.js';
import {allocateTypedArray} from './allocation.js';
export function originalXfeatFrame(rect,origin,{evaluable=true,preservedRectangle=false}={}){
 requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.width>0&&rect.height>0&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger),'Invalid XFeat native frame.');
 const preparedWidth=evaluable?Math.floor(rect.width/32)*32:0,preparedHeight=evaluable?Math.floor(rect.height/32)*32:0;
 const pad=(coordinate)=>((coordinate%32)+32)%32;
 const anchored=evaluable&&!preservedRectangle;
 if(anchored)requireValue(preparedWidth===rect.width&&preparedHeight===rect.height,'A fragmented XFeat frame must keep its exact integer native lattice.');
 const left=anchored?pad(rect.x+origin[0]):0,top=anchored?pad(rect.y+origin[1]):0,width=preparedWidth?Math.ceil((left+preparedWidth)/32)*32:0,height=preparedHeight?Math.ceil((top+preparedHeight)/32)*32:0;
 return Object.freeze({preparedWidth,preparedHeight,width,height,left,top,right:width-left-preparedWidth,bottom:height-top-preparedHeight,origin:Object.freeze([rect.x-left,rect.y-top]),anchored,syntheticPixels:width*height-preparedWidth*preparedHeight,policy:anchored?'original-phase32-normalized-zero-extension/1':'unchanged-native-floor32/1'});
}
export function xfeatContextCoordinate(context,x,y){
 return[xfeatContextAxis(context,x,0),xfeatContextAxis(context,y,1)];
}
export function xfeatContextAxis(context,value,axis){
 const origin=context.nativeFrame?.origin?.[axis]??(axis?context.rect.y:context.rect.x);
 return Math.fround(value*(axis?context.scaleY:context.scaleX))+origin;
}
export async function writeXfeatNormalizedZeroPadding(record,mean,{budget,owner,signal}={}){
 const frame=record.nativeFrame;if(!record.evaluable||!frame.syntheticPixels)return;
 requireValue(Number.isFinite(mean)&&typeof owner?.own==='function'&&budget?.reserve,'XFeat padding requires the owned real-support population.');
 const free=budget.reserve(record.width*4);let row,backing,backingDone=false,creditDone=false;
 const release=async()=>{if(!backingDone){const bytes=await backing?.();backingDone=true;backing=null;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes??record.width*4);}if(!creditDone){const ack=await free();if(ack===false||ack===0)throw ack;creditDone=true;}row=null;};
 owner.own(release);row=allocateTypedArray(Float32Array,record.width,{label:'XFeat normalized-zero extension row'});backing=budget.registerBacking?.('array-buffer',row.byteLength,{owner:'xfeat-strict-padding',label:'normalized-zero extension row',identity:row.buffer});row.fill(mean);
 for(let y=0;y<record.height;y++){
  if(y%32===0)await controlCheckpoint(signal);
  if(y<frame.top||y>=frame.top+frame.preparedHeight)await record.gray.write(new Uint8Array(row.buffer),y*record.width*4,{signal});
  else{if(frame.left)await record.gray.write(new Uint8Array(row.buffer,0,frame.left*4),y*record.width*4,{signal});if(frame.right)await record.gray.write(new Uint8Array(row.buffer,0,frame.right*4),(y*record.width+frame.left+frame.preparedWidth)*4,{signal});}
 }
 await release();
}
