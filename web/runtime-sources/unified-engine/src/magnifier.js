import "../../runtime-context.js?v=0.33.3";
import {parameters,gray,equalizeHistogramLut} from './pixel-utils.js';import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
export function magnifierParams(input={}){const p=parameters(input,{mode:'equalize',percent:20,channel:false,bounds:null},{percent:[0,100]},{mode:['equalize','contrast','identity']},['channel']);requireValue(p.bounds===null||(Array.isArray(p.bounds)&&p.bounds.length===4&&p.bounds.every(Number.isSafeInteger)&&p.bounds[2]>=p.bounds[0]&&p.bounds[3]>=p.bounds[1]),'Bounds must be ordered integer half-open coordinates.');return p;}
export function magnifierRegion(image,p){const bounds=(p.bounds??[0,0,image.width,image.height]).map((v,i)=>Math.max(0,Math.min(i%2?image.height:image.width,v)));return{bounds,width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]};}
// Storage depth changes the code domain, never the histogram/LUT algorithm.
export function magnifierLayout(image){
 const native=image?.format==='rgb16',maximum=native?65535:255,Type=native?Uint16Array:Uint8Array;
 if(native&&image.data!==undefined)requireValue(image.data instanceof Uint16Array,'Magnifier RGB16 requires real unsigned word samples.');
 return{native,depth:native?16:8,maximum,bins:maximum+1,Type,sampleBytes:Type.BYTES_PER_ELEMENT,histogramBytes:4*(maximum+1)*4,lutBytes:3*(maximum+1)*Type.BYTES_PER_ELEMENT};
}
async function magnifierByteRows(image,p,hooks={}){
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
// Keep8-bit arithmetic feedback monomorphic after a native16 calculation.
// Both type specializations retain the same ROI/histogram/LUT algorithm.
export function magnifierMetadataBytes(descriptor){
 const seen=new Set();function size(value){if(value===null||value===undefined)return 8;if(typeof value==='string')return value.length*2;if(typeof value!=='object')return 8;if(seen.has(value))return 0;seen.add(value);if(ArrayBuffer.isView(value))return value.byteLength;if(value instanceof ArrayBuffer)return value.byteLength;return Object.entries(value).reduce((n,[k,v])=>n+k.length*2+32+size(v),64);}
 return size(descriptor?.color)+size(descriptor?.provenance);
}
export async function magnifier(image,p,hooks={}){
 if(image?.format!=='rgb16')return magnifierByteRows(image,p,hooks);
 checkAbort(hooks.signal);const {bounds,width,height}=magnifierRegion(image,p),[x1,y1]=bounds;
 if(!width||!height)return {data:{bounds,empty:true},semantics:'Empty clipped magnifier region; original unchanged.'};
 const layout=magnifierLayout(image),{Type,bins,maximum}=layout,n=width*height,cached=!!hooks.histogram,hist=hooks.histogram??Array.from({length:4},()=>new Uint32Array(bins)),data=new Type(n*3),cooperate=createCooperator(hooks.signal);
 // An internal histogram is owned by the immutable source/revision/bounds cache.
 // It is never published with a mutable result or accepted as a task parameter.
 await controlCheckpoint(hooks.signal);
 if(!cached)for(let y=0;y<height;y++){await cooperate();const row=y*width*3,source=((y+y1)*image.width+x1)*3;data.set(image.data.subarray(source,source+width*3),row);for(let x=0;x<width;x++){const i=row+x*3;for(let c=0;c<3;c++)hist[c][data[i+c]]++;hist[3][gray(data[i],data[i+1],data[i+2])]++;}}
 hooks.onHistogram?.(hist);checkAbort(hooks.signal);const luts=magnifierLuts(hist,n,p,layout),input=cached?image.data:data;
 for(let y=0;y<height;y++){await cooperate();const row=y*width*3,source=cached?((y+y1)*image.width+x1)*3:row;for(let x=0;x<width;x++)for(let c=0;c<3;c++)data[row+x*3+c]=luts[c][input[source+x*3+c]];hooks.onProgress?.((y+1)/height);}
 checkAbort(hooks.signal);return {pixels:{width,height,format:layout.native?'rgb16':'rgb8',data,...(layout.native?{depth:16,sourceDepth:image.sourceDepth??16,channels:3,space:'RGB',range:[0,maximum],color:image.color??null,provenance:image.provenance??null}:{})},data:{bounds,empty:false},layers:[{id:'inspection.magnifier',kind:'rgb',origin:[x1,y1],range:[0,maximum]}],semantics:'Native clipped ROI enhancement; no resizing. Region origin is carried separately from its pixels.'};
}
export function magnifierLuts(hist,n,p,{maximum=255,Type=Uint8Array}={}){
 const bins=maximum+1;
 if(p.mode==='identity')return Array.from({length:3},()=>Type.from({length:bins},(_,i)=>i));
 function table(h){if(p.mode==='equalize')return equalizeHistogramLut(h,n,maximum);
  const lut=new Type(bins);let low=0,high=maximum;while(!h[low])low++;while(!h[high])high--;
  if(p.percent){let sum=0;for(let i=0;i<bins;i++){sum+=h[i]/n;if(sum>=p.percent/200){low=i;break;}}sum=0;for(let i=maximum;i>=0;i--){sum+=h[i]/n;if(sum>=p.percent/200){high=i;break;}}}
  for(let i=0;i<bins;i++)lut[i]=low===high?maximum:Math.trunc(Math.max(0,Math.min(maximum,(maximum*(low-i))/(low-high))));return lut;
 }
 return p.mode==='equalize'||p.channel?hist.slice(0,3).map(table):Array(3).fill(table(hist[3]));
}
