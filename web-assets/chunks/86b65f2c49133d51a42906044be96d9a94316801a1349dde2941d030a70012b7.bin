import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkpoint} from './errors.js';

export const gray=(r,g,b)=>(r*9798+g*19235+b*3735+16384)>>15;
export function roundEven(x){const n=Math.floor(x),d=x-n;return d===0.5?n+(n%2):Math.floor(x+0.5);}
// OpenCV equalizeHist converts integer population and cumulative counts to
// float32 before division/multiplication, including populations above2^24.
export function equalizeHistogramLut(bins,count){
 const lut=new Uint8Array(256);let first=0;while(first<255&&!bins[first])first++;
 if(bins[first]===count){lut.fill(first);return lut;}
 const scale=Math.fround(255/Math.fround(count-bins[first]));let sum=0;
 for(let i=first+1;i<256;i++){sum+=bins[i];lut[i]=Math.max(0,Math.min(255,roundEven(Math.fround(Math.fround(sum)*scale))));}
 return lut;
}
export const round2=x=>roundEven(x*100)/100;
export function parameters(input,defaults,integers={},choices={},booleans=[]){
 requireValue(input!==null&&typeof input==='object'&&!Array.isArray(input),'Parameters must be an object.');
 requireValue(Object.keys(input).every(k=>Object.hasOwn(defaults,k)),'Unknown parameter.');
 const p={...defaults,...input};
 for(const [k,[lo,hi]] of Object.entries(integers))requireValue(Number.isInteger(p[k])&&p[k]>=lo&&p[k]<=hi,`Invalid ${k}.`);
 for(const [k,values] of Object.entries(choices))requireValue(values.includes(p[k]),`Invalid ${k}.`);
 for(const k of booleans)requireValue(typeof p[k]==='boolean',`Invalid ${k}.`);
 return p;
}
export function channelValue(rgb,i,channel,normModulo=false){
 if(channel>=1&&channel<=3)return rgb[i+channel-1];
 if(channel===0)return gray(rgb[i],rgb[i+1],rgb[i+2]);
 const squared=rgb[i]**2+rgb[i+1]**2+rgb[i+2]**2;
 return normModulo?Math.trunc(Math.sqrt(squared))%256:squared;
}
export function reflect101(i,size){if(size===1)return 0;return i<0?-i:i>=size?2*size-i-2:i;}
export async function rows(height,hooks,callback){
 for(let y=0;y<height;y++){
  if(y%32===0)await checkpoint(hooks.signal);
  callback(y);if((y+1)%32===0||y===height-1)hooks.onProgress?.((y+1)/height);
 }
}
export const rgbPixels=(p,data)=>({width:p.width,height:p.height,format:'rgb8',data});
export function binaryMask(p,data,semantics){return {width:p.width,height:p.height,format:'mask8',data,range:[0,1],semantics};}

// Normalize integer input to CV_8U, preserving OpenCV's float32 conversion.
export function normalizeU8(input,maximum=255){
 let low=Infinity,high=-Infinity;for(const x of input){low=Math.min(low,x);high=Math.max(high,x);}
 const scale=high===low?0:maximum/(high-low),s=Math.fround(scale),shift=Math.fround(-low*scale);
 const out=new Uint8Array(input.length);
 for(let i=0;i<out.length;i++)out[i]=Math.max(0,Math.min(maximum,roundEven(Math.fround(Math.fround(input[i]*s)+shift))));
 return out;
}
