import "../../runtime-context.js?v=0.25.0";
import {parameters,gray,equalizeHistogramLut} from './pixel-utils.js';import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
export function magnifierParams(input={}){const p=parameters(input,{mode:'equalize',percent:20,channel:false,bounds:null},{percent:[0,100]},{mode:['equalize','contrast']},['channel']);requireValue(p.bounds===null||(Array.isArray(p.bounds)&&p.bounds.length===4&&p.bounds.every(Number.isSafeInteger)&&p.bounds[2]>=p.bounds[0]&&p.bounds[3]>=p.bounds[1]),'Bounds must be ordered integer half-open coordinates.');return p;}
export function magnifierRegion(image,p){const bounds=(p.bounds??[0,0,image.width,image.height]).map((v,i)=>Math.max(0,Math.min(i%2?image.height:image.width,v)));return{bounds,width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]};}
export async function magnifier(image,p,hooks={}){
 checkAbort(hooks.signal);const {bounds,width,height}=magnifierRegion(image,p),[x1,y1]=bounds;
 if(!width||!height)return {data:{bounds,empty:true},semantics:'Empty clipped magnifier region; original unchanged.'};
 const n=width*height,cached=!!hooks.histogram,hist=hooks.histogram??Array.from({length:4},()=>new Uint32Array(256)),data=new Uint8Array(n*3),cooperate=createCooperator(hooks.signal);
 // An internal histogram is owned by the immutable source/revision/bounds cache.
 // It is never published with a mutable result or accepted as a task parameter.
 await controlCheckpoint(hooks.signal);
 if(!cached)for(let y=0;y<height;y++){await cooperate();const row=y*width*3,source=((y+y1)*image.width+x1)*3;data.set(image.data.subarray(source,source+width*3),row);for(let x=0;x<width;x++){const i=row+x*3;for(let c=0;c<3;c++)hist[c][data[i+c]]++;hist[3][gray(data[i],data[i+1],data[i+2])]++;}}
 hooks.onHistogram?.(hist);checkAbort(hooks.signal);const luts=magnifierLuts(hist,n,p),input=cached?image.data:data;
 for(let y=0;y<height;y++){await cooperate();const row=y*width*3,source=cached?((y+y1)*image.width+x1)*3:row;for(let x=0;x<width;x++)for(let c=0;c<3;c++)data[row+x*3+c]=luts[c][input[source+x*3+c]];hooks.onProgress?.((y+1)/height);}
 checkAbort(hooks.signal);return {pixels:{width,height,format:'rgb8',data},data:{bounds,empty:false},layers:[{id:'inspection.magnifier',kind:'rgb',origin:[x1,y1],range:[0,255]}],semantics:'Native clipped ROI enhancement; no resizing. Region origin is carried separately from its pixels.'};
}
export function magnifierLuts(hist,n,p){
 function table(h){const lut=new Uint8Array(256);let low=0,high=255;while(!h[low])low++;while(!h[high])high--;
  if(p.mode==='equalize')return equalizeHistogramLut(h,n);
  if(p.percent){let sum=0;for(let i=0;i<256;i++){sum+=h[i]/n;if(sum>=p.percent/200){low=i;break;}}sum=0;for(let i=255;i>=0;i--){sum+=h[i]/n;if(sum>=p.percent/200){high=i;break;}}}
  for(let i=0;i<256;i++)lut[i]=low===high?255:Math.trunc(Math.max(0,Math.min(255,(255*(low-i))/(low-high))));return lut;
 }
 return p.mode==='equalize'||p.channel?hist.slice(0,3).map(table):Array(3).fill(table(hist[3]));
}
