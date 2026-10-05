import "../../runtime-context.js?v=0.14.5";
// Port of core/ela.py and core/utility.py; codec is a separate reference boundary.
import { requireValue, checkpoint, checkAbort } from './errors.js';
export const DEFAULT_ELA_PARAMS = Object.freeze({quality:75,scale:50,contrast:20,linear:false,grayscale:false});
export const DEFAULT_ENERGY_PROFILE = Object.freeze({id:'standard',name:'Conservateur',percentiles:Object.freeze([1,99]),deviations:Object.freeze([5,5]),adaptive:false,available:true});
export function validateParams(input = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Parameters must be an object.');
  requireValue(Object.keys(input).every(k => Object.hasOwn(DEFAULT_ELA_PARAMS,k)), 'Unknown ELA parameter.');
  const p = {...DEFAULT_ELA_PARAMS,...input};
  for (const [key,lo,hi] of [['quality',1,100],['scale',1,100],['contrast',0,100]])
    requireValue(Number.isInteger(p[key]) && p[key]>=lo && p[key]<=hi, `Invalid ${key}.`);
  requireValue(typeof p.linear === 'boolean' && typeof p.grayscale === 'boolean', 'Boolean controls required.');
  return p;
}
export function validatePixels(p) {
  requireValue(p?.format === 'rgb8' && Number.isSafeInteger(p.width) && Number.isSafeInteger(p.height) && p.width>0 && p.height>0, 'Expected positive RGB8 dimensions.');
  requireValue(Number.isSafeInteger(p.width*p.height*3) && p.data instanceof Uint8Array && p.data.length === p.width*p.height*3, 'Invalid RGB8 buffer.');
}
function roundEven(x) { const n=Math.floor(x), d=x-n; return d===0.5 ? n+(n%2) : Math.floor(x+0.5); }
// Avoid algebraic abs(a-b)/255: native rounds each operand before subtraction.
export async function elaBase(original,recompressed,linear,{signal,onProgress}={}) {
  requireValue(original instanceof Uint8Array && recompressed instanceof Uint8Array && original.length===recompressed.length, 'Mismatched input pair.');
  checkAbort(signal);
  const out=linear ? new Uint8Array(original.length) : new Float32Array(original.length);
  const f=Math.fround;
  for(let start=0;start<out.length;start+=196608) {
    await checkpoint(signal);
    const end=Math.min(out.length,start+196608);
    for(let i=start;i<end;i++) out[i]=linear ? Math.abs(original[i]-recompressed[i]) : f(f(Math.sqrt(Math.abs(f(f(original[i]/255)-f(recompressed[i]/255)))))*255);
    onProgress?.(end/out.length);
  }
  return out;
}
export async function elaRender(base,params,{signal,onProgress}={}) {
  const p=validateParams(params), c=Math.min(127,Math.trunc(p.contrast/100*128));
  const lut=new Uint8Array(256);
  for(let x=0;x<256;x++) lut[x]=Math.max(0,Math.min(255,(x*(-255)+c*255)/(2*c-255)));
  const out=new Uint8Array(base.length), factor=Math.fround(p.linear?p.scale:p.scale/20);
  for(let start=0;start<out.length;start+=196608) {
    await checkpoint(signal);
    const end=Math.min(out.length,start+196608);
    for(let i=start;i<end;i++) out[i]=lut[Math.min(255,roundEven(Math.fround(base[i]*factor)))];
    if(p.grayscale) for(let i=start;i<end;i+=3) {
      // OpenCV RGB2GRAY integer coefficients, 15-bit fixed point.
      const y=(out[i]*9798+out[i+1]*19235+out[i+2]*3735+16384)>>15;
      out[i]=out[i+1]=out[i+2]=y;
    }
    onProgress?.(end/out.length);
  }
  return out;
}
