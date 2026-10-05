import "../../runtime-context.js?v=0.14.5";
// Reference primitive study only. No callable ELA-energy operation is enabled.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const f=Math.fround,BLUE=f(.114),GREEN=f(.587),RED=f(.299);
// Products of RGB8 differences and float32 coefficients fit exactly in binary64.
// Native SIMD and scalar C++ tails contract different first products.
export function energyGrayPixel(r,g,b,scalar=false){return scalar?f(r*RED+f(b*BLUE+f(g*GREEN))):f(r*RED+f(g*GREEN+f(b*BLUE)));}
function reflect101(index,size){if(size===1)return 0;while(index<0||index>=size)index=index<0?-index:2*size-index-2;return index;}
export async function describeEnergy(image,compressed,{signal,account=()=>{}}={}){
 const {width:w,height:h,data:a}=image,b=compressed.data,n=w*h;
 requireValue(image.format==='rgb8'&&compressed.format==='rgb8'&&compressed.width===w&&compressed.height===h&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&Number.isSafeInteger(n)&&a instanceof Uint8Array&&b instanceof Uint8Array&&a.length===n*3&&b.length===n*3,'Matching RGB8 original and recompression required.');
 checkAbort(signal);account(n*16);const gray=new Float32Array(n),horizontal=new Float64Array(n),energy=new Float32Array(n),vectorEnd=w-w%4;
 let yielded=performance.now();const checkpoint=async()=>{checkAbort(signal);if(performance.now()-yielded>=8){await controlCheckpoint(signal);yielded=performance.now();}};
 for(let y=0;y<h;y++){
  for(let x=0;x<w;x++){const i=y*w+x,j=i*3;gray[i]=energyGrayPixel(Math.abs(a[j]-b[j]),Math.abs(a[j+1]-b[j+1]),Math.abs(a[j+2]-b[j+2]),x>=vectorEnd);}
  await checkpoint();
 }
 // Native CV_32F box filter accumulates rows/columns in binary64; retain its
 // rolling order and REFLECT_101 at tiny images and outer edges.
 for(let y=0;y<h;y++){
  let sum=0;for(let k=-3;k<=3;k++)sum+=gray[y*w+reflect101(k,w)];horizontal[y*w]=sum;
  for(let x=1;x<w;x++){sum+=gray[y*w+reflect101(x+3,w)]-gray[y*w+reflect101(x-4,w)];horizontal[y*w+x]=sum;}
  await checkpoint();
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let k=-3;k<3;k++)sum+=horizontal[reflect101(k,h)*w+x];
  for(let y=0;y<h;y++){const current=sum+horizontal[reflect101(y+3,h)*w+x];energy[y*w+x]=current*(1/49);sum=current-horizontal[reflect101(y-3,h)*w+x];}
  await checkpoint();
 }
 checkAbort(signal);return {gray,energy};
}
