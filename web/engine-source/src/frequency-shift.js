import {requireValue,controlCheckpoint,checkAbort} from './errors.js';
// Circular views avoid materializing fftshift/ifftshift copies of global planes.
export function shiftedComplex(plane,inverse=false){
 const {width,height}=plane,dx=inverse?Math.floor(width/2):Math.ceil(width/2),dy=inverse?Math.floor(height/2):Math.ceil(height/2);
 return {width,height,ArrayType:plane.ArrayType??Float32Array,async read(x,y,w,h,{signal,cooperate}={}){
  requireValue(x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Invalid shifted frequency window.');requireValue(cooperate===undefined||typeof cooperate==='function','Invalid shifted transfer cooperator.');if(cooperate)checkAbort(signal);const out=new (plane.ArrayType??Float32Array)(w*h*2);let doneY=0;
  while(doneY<h){const sy=(y+doneY+dy)%height,hh=Math.min(h-doneY,height-sy);let doneX=0;while(doneX<w){if(cooperate)checkAbort(signal);await (cooperate??controlCheckpoint)(signal);if(cooperate)checkAbort(signal);const sx=(x+doneX+dx)%width,ww=Math.min(w-doneX,width-sx),part=await plane.read(sx,sy,ww,hh,{signal,cooperate});for(let row=0;row<hh;row++)out.set(part.subarray(row*ww*2,(row+1)*ww*2),((doneY+row)*w+doneX)*2);doneX+=ww;}doneY+=hh;}if(cooperate)checkAbort(signal);return out;
 }};
}
