import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {neuralQuantiles} from './neural-quantiles.js';import {TRUFOR_PALETTE} from './trufor-palette.js';
export async function renderTruforSegmented(result,view,rect,{budget,signal,onProgress}={}){
 const cooperate=createCooperator(signal);
 const d=result.data,tensor=d[view];requireValue(['map','confidence','noiseprint_pp'].includes(view)&&tensor?.readInto,'Unknown segmented TruFor view.');
 const {x=0,y=0,width=d.width,height=d.height}=rect??{};requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=d.width-width&&y<=d.height-height,'Invalid TruFor view window.');
 const release=budget.reserve(width*height*3+width*4);let low=0,den=1;
 try{
  if(view==='noiseprint_pp'){const q=result.displayQuantiles??await neuralQuantiles(tensor,[.01,.99],{budget,signal,onProgress});result.displayQuantiles=q;low=Math.fround(q[0]);den=Math.fround(Math.max(q[1]-q[0],1e-8));}
  const data=new Uint8Array(width*height*3),row=new Float32Array(width),f=Math.fround,clip=v=>Math.max(0,Math.min(1,v));
  for(let yy=0;yy<height;yy++){if(yy%32===0)await cooperate();await tensor.readInto(row,(y+yy)*d.width+x,{signal});for(let xx=0;xx<width;xx++){const value=row[xx],at=(yy*width+xx)*3;requireValue(Number.isFinite(value),'Nonfinite TruFor display value.');if(view==='map'){const i=Math.min(255,Math.trunc(f(clip(value)*256)))*3;data.set(TRUFOR_PALETTE.subarray(i,i+3),at);}else{const gray=Math.trunc(f((view==='confidence'?clip(value):clip(f(f(value-low)/den)))*255));data[at]=data[at+1]=data[at+2]=gray;}}}
  checkAbort(signal);return {width,height,origin:[x,y],format:'rgb8',data,release};
 }catch(e){release();throw e;}
}
