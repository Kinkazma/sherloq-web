import {checkAbort} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {equalizationSurface} from './equalization-presentation.js';
// Adapter for the existing bounded provisional views. Final images use surfaces.
export async function equalizationPixels(pixels,plan,hooks){
 const {budget,signal}=hooks,{width,height}=pixels;
 const source={descriptor:{width,height},async readWindow({x=0,y=0,width:w=width,height:h=height},{signal}={}){
  checkAbort(signal);const owner=allocateOwnedTypedArray(Uint8Array,w*h*3,{budget,owner:'equalization-preview',label:'equalization-window'});
  try{for(let row=0;row<h;row++)owner.data.set(pixels.data.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);return{pixels:{width:w,height:h,format:'rgb8',data:owner.data},release:owner.release};}catch(error){owner.release();throw error;}
 }};
 let result,window;try{result=await equalizationSurface(source,plan,hooks);window=await result.surface.readWindow({}, {signal});return{...pixels,data:window.pixels.data};}finally{window?.release();await result?.surface.dispose();}
}
