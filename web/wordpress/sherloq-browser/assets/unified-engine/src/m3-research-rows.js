import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {validateRgbRows} from './rgb-row-source.js';
import {pillowCoefficients} from './adaifl-prepare.js';
const side=1024,f=Math.fround,even=x=>{const n=Math.floor(x),r=x-n;return r<.5?n:r>.5?n+1:n%2?n+1:n;};
export function researchRows(image){
 if(typeof image.readRows==='function')return image;
 return {width:image.width,height:image.height,async readRows(y,count){return {pixels:{format:'rgb8',width:image.width,height:count,data:image.data.subarray(y*image.width*3,(y+count)*image.width*3)},release(){}};}};
}

// Fixed native 1024 preparation from immutable source rows. The reduction is
// the method's own preprocessing; the detector input is never resized to fit RAM.
export async function prepareResearchRows(source,{method,budget,signal,onProgress}={}){
 const {width:w,height:h}=source;requireValue(['safire','focal','adaifl'].includes(method)&&[w,h].every(v=>Number.isSafeInteger(v)&&v>0)&&typeof source.readRows==='function','Qualified research source rows required.');
 const pillow=method==='adaifl',verticalFirst=pillow&&h>w*100&&side<h,yStride=2*Math.ceil(Math.max(1,h/side))+1;
 const free=budget.reserve(side*side*12);let scratch,complete=false,reads=0,stamp=performance.now();
 try{
  scratch=budget.reserve(pillow?(w+h)*32+side*128+yStride*side*3+w*24:side*128);
  const output=new Float32Array(side*side*3),rows=new Map();
  const read=async y=>{checkAbort(signal);const view=await source.readRows(y,1,{signal});reads++;try{return {view,data:validateRgbRows(view,w,1)};}catch(error){view.release();throw error;}};
  const emit=(y,x,c,value)=>{output[c*side*side+y*side+x]=method==='safire'?value:value/255;};
  if(pillow){
   const cx=pillowCoefficients(w,side),cy=pillowCoefficients(h,side);
   const horizontal=data=>{const row=new Uint8Array(side*3);for(let x=0;x<side;x++)for(let c=0;c<3;c++){let sum=2097152;const {start,weights}=cx[x];for(let k=0;k<weights.length;k++)sum+=data[(start+k)*3+c]*weights[k];row[x*3+c]=sum>>22;}return row;};
   for(let y=0;y<side;y++){
    if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}const {start,weights}=cy[y];
    if(verticalFirst){
     const sums=new Float64Array(w*3).fill(2097152),vertical=new Uint8Array(w*3);
     for(let k=0;k<weights.length;k++){const {view,data}=await read(start+k);try{for(let i=0;i<data.length;i++)sums[i]+=data[i]*weights[k];}finally{view.release();}}
     for(let i=0;i<vertical.length;i++)vertical[i]=sums[i]>>22;const row=horizontal(vertical);for(let x=0;x<side;x++)for(let c=0;c<3;c++)emit(y,x,c,row[x*3+c]);
    }else{
     for(const key of rows.keys())if(key<start||key>=start+weights.length)rows.delete(key);
     for(let k=0;k<weights.length;k++)if(!rows.has(start+k)){const {view,data}=await read(start+k);try{rows.set(start+k,horizontal(data));}finally{view.release();}}
     for(let x=0;x<side;x++)for(let c=0;c<3;c++){let sum=2097152;for(let k=0;k<weights.length;k++)sum+=rows.get(start+k)[x*3+c]*weights[k];emit(y,x,c,sum>>22);}
    }
    if(y%32===31)onProgress?.({phase:'research-preparation',fraction:(y+1)/side});
   }
  }else{
   const xs=new Int32Array(side),alpha=new Int32Array(side*2);
   for(let x=0;x<side;x++){let fx=f((x+.5)*(w/side)-.5),sx=Math.floor(fx);fx=f(fx-sx);if(sx<0){sx=0;fx=0;}if(sx>=w-1){sx=w-1;fx=0;}xs[x]=sx;alpha[x*2]=even(f(f(1-fx)*2048));alpha[x*2+1]=even(f(fx*2048));}
   for(let y=0;y<side;y++){
    if(y%32===0)await controlCheckpoint(signal);let fy=f((y+.5)*(h/side)-.5),sy=Math.floor(fy);fy=f(fy-sy);const b0=even(f(f(1-fy)*2048)),b1=even(f(fy*2048)),y0=Math.max(0,Math.min(h-1,sy)),y1=Math.max(0,Math.min(h-1,sy+1));
    for(const key of rows.keys())if(key!==y0&&key!==y1)rows.delete(key);
    for(const key of [y0,y1])if(!rows.has(key)){const {view,data}=await read(key);try{const row=new Int32Array(side*3);for(let x=0;x<side;x++)for(let c=0;c<3;c++)row[x*3+c]=data[xs[x]*3+c]*alpha[x*2]+data[Math.min(w-1,xs[x]+1)*3+c]*alpha[x*2+1];rows.set(key,row);}finally{view.release();}}
    const a=rows.get(y0),b=rows.get(y1);for(let x=0;x<side;x++)for(let c=0;c<3;c++){const i=x*3+c,value=(((b0*(a[i]>>4))>>16)+((b1*(b[i]>>4))>>16)+2)>>2;emit(y,x,c,value);}
    if(y%32===31)onProgress?.({phase:'research-preparation',fraction:(y+1)/side});
   }
  }
  checkAbort(signal);complete=true;return {tensor:output,release:free,metrics:{sourceReads:reads,sourceLayout:'rows',verticalFirst,preparedShape:[1,3,side,side]}};
 }finally{scratch?.();if(!complete)free();}
}
