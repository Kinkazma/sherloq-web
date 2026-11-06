import "../../runtime-context.js?v=0.33.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {neuralQuantiles} from './neural-quantiles.js';
import {TRUFOR_PALETTE} from './trufor-palette.js';

/** Presentation only: retained native Mini map or its own pruned NPP field.
 * The map always uses the fixed TruFor palette. NPP display quantiles span
 * the complete native field, including when only a window is requested.
 */
export async function renderTruforMini(result,view='map',rect,{budget,signal,onProgress}={}){
 const cooperate=createCooperator(signal),data=result.data,tensor=data?.[view];
 requireValue(['map','noiseprint_pp'].includes(view)&&tensor?.readInto,'Unknown TruFor Mini view.');
 const {x=0,y=0,width=data.width,height=data.height}=rect??{};
 requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=data.width-width&&y<=data.height-height,'Invalid TruFor Mini view window.');
 const release=budget.reserve(width*height*3+width*4);let low=0,den=1;
 try{
  if(view==='noiseprint_pp'){
   const quantiles=result.displayQuantiles??await neuralQuantiles(tensor,[.01,.99],{budget,signal,onProgress});result.displayQuantiles=quantiles;
   low=Math.fround(quantiles[0]);den=Math.fround(Math.max(quantiles[1]-quantiles[0],1e-8));
  }
  const pixels=new Uint8Array(width*height*3),row=new Float32Array(width),f=Math.fround,clip=value=>Math.max(0,Math.min(1,value));
  for(let yy=0;yy<height;yy++){
   if(yy%32===0)await cooperate();await tensor.readInto(row,(y+yy)*data.width+x,{signal});
   for(let xx=0;xx<width;xx++){
    const value=row[xx],at=(yy*width+xx)*3;requireValue(Number.isFinite(value),'Nonfinite TruFor Mini display value.');
    if(view==='map'){const index=Math.min(255,Math.trunc(f(clip(value)*256)))*3;pixels.set(TRUFOR_PALETTE.subarray(index,index+3),at);}
    else{const gray=Math.trunc(f(clip(f(f(value-low)/den))*255));pixels[at]=pixels[at+1]=pixels[at+2]=gray;}
   }
  }
  checkAbort(signal);return {width,height,origin:[x,y],format:'rgb8',data:pixels,release};
 }catch(error){release();throw error;}
}
