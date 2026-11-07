import "../../runtime-context.js?v=0.33.1";
import {requireValue,checkAbort} from './errors.js';
const f=Math.fround;
export function cropFor(featureHeight,outputHeight,top,rows){return {start:Math.max(0,Math.floor(((2*top+1)*featureHeight-outputHeight)/(2*outputHeight))),stop:Math.min(featureHeight,Math.floor(((2*(top+rows)-1)*featureHeight-outputHeight)/(2*outputHeight))+2)};}
export function sampleGrid(fh,fw,height,width,top,rows,start,stop,budget){
 const release=budget.reserve(rows*width*8);
 try{const data=new Float32Array(rows*width*2),ch=stop-start;
  for(let y=0;y<rows;y++){const sy=f(Math.min(fh-1,Math.max(0,f(f((top+y+.5)*f(fh/height))-.5)))-start),gy=f(f(f(sy+.5)*f(2/ch))-1);
   for(let x=0;x<width;x++){const sx=Math.min(fw-1,Math.max(0,f(f((x+.5)*f(fw/width))-.5))),gx=f(f(f(sx+.5)*f(2/fw))-1),at=(y*width+x)*2;data[at]=gx;data[at+1]=gy;}}
  return {data,dims:[1,rows,width,2],release};
 }catch(e){release();throw e;}
}
