import {requireValue} from './errors.js';
// These are declarations of the encoded samples, not evidence of an embedded ICC.
export function pngColorChunk(kind,bytes,color={}){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(kind==='sRGB'&&bytes.length===1)color.srgb=true;
 else if(kind==='gAMA'&&bytes.length===4)color.gamma=view.getUint32(0)/100000;
 else if(kind==='cHRM'&&bytes.length===32)color.chromaticities=Array.from({length:8},(_,k)=>view.getUint32(4*k)/100000);
 else if(kind==='cICP'&&bytes.length===4)color.cicp={colorPrimaries:bytes[0],transferCharacteristics:bytes[1],matrixCoefficients:bytes[2],fullRange:bytes[3]};
 return color;
}
export function pngColorimetry(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),color={};
 for(let at=8;at+12<=bytes.length;){const n=view.getUint32(at),kind=String.fromCharCode(...bytes.subarray(at+4,at+8));requireValue(n<=bytes.length-at-12,'PNG colorimetry outside original source.');
  if(['sRGB','gAMA','cHRM','cICP'].includes(kind))pngColorChunk(kind,bytes.subarray(at+8,at+8+n),color);at+=n+12;if(kind==='IEND')break;
 }return color;
}
export function needsPngColorDisplay8(header){
 // ICC and sRGB carry their own higher-priority interpretation. cICP keeps
 // its prior import route; this adapter owns gAMA/cHRM only.
 const c=header?.colorimetry;return header?.format==='png'&&header.depth<=8&&!header.icc&&!c?.srgb&&!c?.cicp&&!!(c?.gamma||c?.chromaticities);
}
