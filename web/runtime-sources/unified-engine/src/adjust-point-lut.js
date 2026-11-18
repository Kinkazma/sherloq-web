import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {ADJUST_GAMMA16_CORRECTIONS} from './adjust-gamma-corrections.js';

// UI code-unit controls remain on their existing 0..255 scale. Native16 uses
// their full normalized domain; in particular floor(257*width/2), rather than
// importing the old 8-bit half-window quantization into the new word domain.
export const ADJUST_POINT_POLICY='native-code-normalized-window/1';
export function adjustPointLutPlan(depth){
 requireValue(depth===8||depth===16,'Adjustment point depth must be 8 or 16.');
 const sampleBytes=depth/8,maximum=depth===16?65535:255,bins=maximum+1;
 return{known:true,depth,sampleBytes,maximum,bins,lutBytes:bins*sampleBytes,scratchBytes:0,outputStorageBytes:0,policy:ADJUST_POINT_POLICY};
}
function layout(depth){const p=adjustPointLutPlan(depth);return{...p,Type:depth===16?Uint16Array:Uint8Array};}
function integer(value,defaultValue,low,high,name){
 const n=value??defaultValue;requireValue(Number.isInteger(n)&&n>=low&&n<=high,'Invalid adjustment '+name+'.');return n;
}
function toneParameters(input={}){
 return{gamma:integer(input.gamma,10,1,50,'gamma'),shadows:integer(input.shadows,0,-100,100,'shadows'),highlights:integer(input.highlights,0,-100,100,'highlights'),sweep:integer(input.sweep,127,0,255,'window center'),width:integer(input.width,255,0,255,'window width')};
}
function finishParameters(input={}){
 const threshold=integer(input.threshold,255,0,255,'threshold'),invert=input.invert??false;
 requireValue(typeof invert==='boolean','Invalid adjustment inversion.');return{threshold,invert};
}
function overlaps(a,b){return a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;}
function destination(target,l,label){
 if(target!==undefined){requireValue(target instanceof l.Type&&target.length===l.bins,'Adjustment LUT destination has another type or extent.');return target;}
 return allocateTypedArray(l.Type,l.bins,{label});
}
// Same native utility.create_lut numerator/division/truncation order; only the
// maximum code changes. This is a scalar composition, not a rebinned LUT8.
function linearCode(value,low,high,maximum){
 const x1=Math.max(low,0),y1=Math.max(-low,0),x2=high>=0?maximum-high:maximum,y2=high>=0?maximum:maximum+high;
 return x1===x2?maximum:Math.trunc(Math.max(0,Math.min(maximum,(value*(y1-y2)+x1*y2-y1*x2)/(x1-x2))));
}
function gammaCodes(gamma,l,target,table){
 if(table!==undefined){
  requireValue(table instanceof l.Type&&table.length===l.bins,'Canonical adjustment gamma table has another type or extent.');
  requireValue(!overlaps(table,target),'A borrowed canonical gamma table cannot be the mutable destination.');target.set(table);return;
 }
 // The existing byte engine uses its frozen Python/native table. Do not
 // replace that finite canon with a new JavaScript power implementation.
 if(l.depth===8)throw new EngineError('INVALID_INPUT','The 8-bit adjustment stage requires its canonical gamma table.');
 const inverse=1/(gamma/10);
 for(let code=0;code<l.bins;code++)target[code]=Math.trunc(Math.pow(code/l.maximum,inverse)*l.maximum);
 for(const[code,value]of ADJUST_GAMMA16_CORRECTIONS[gamma]??[])target[code]=value;
}
function resolveThreshold(p,l,resolvedThreshold){
 if(p.threshold===255)return null;
 if(p.threshold!==0)return p.threshold*(l.maximum/255);
 if(!Number.isInteger(resolvedThreshold)||resolvedThreshold<0||resolvedThreshold>l.maximum)throw new EngineError('UNSUPPORTED_PRECISION','Automatic threshold requires the separately qualified global Otsu result.');
 return resolvedThreshold;
}
function finishCode(value,p,threshold,maximum){const v=threshold===null?value:value>threshold?maximum:0;return p.invert?maximum-v:v;}

// Pure arithmetic: the calling producer finances the declared LUT before
// construction. Source windows, retained owners and presentation are separate.
export function adjustToneLut(input,{depth,gammaTable,target}={}){
 const l=layout(depth),p=toneParameters(input),out=destination(target,l,'adjust-tone-lut'),maximum=l.maximum;
 gammaCodes(p.gamma,l,out,gammaTable);
 const low=Math.trunc(p.shadows/100*maximum),high=Math.trunc(p.highlights/100*maximum),windowWidth=p.width*(maximum/255),center=p.sweep*(maximum/255),radius=Math.floor(windowWidth/2),windowLow=Math.max(center-radius,0),windowHigh=maximum-Math.min(center+radius,maximum);
 for(let code=0;code<out.length;code++){
  let v=out[code];if(p.shadows)v=linearCode(v,low,0,maximum);if(p.highlights)v=linearCode(v,0,high,maximum);if(p.width<255)v=linearCode(v,windowLow,windowHigh,maximum);out[code]=v;
 }
 return out;
}
// Threshold/inversion stay after the HSV/value equalization stage. The LUT
// accepts an already resolved Otsu threshold, never a tile-local estimate.
export function adjustFinishLut(input,{depth,resolvedThreshold,target}={}){
 const l=layout(depth),p=finishParameters(input),threshold=resolveThreshold(p,l,resolvedThreshold),out=destination(target,l,'adjust-finish-lut');
 for(let code=0;code<out.length;code++)out[code]=finishCode(code,p,threshold,l.maximum);return out;
}
// Point-only frames can fuse both stages without another table or full image.
// If a HSV/value equalizer intervenes, call tone and finish in their order.
export function adjustPointLut(input,options={}){
 const l=layout(options.depth),p=finishParameters(input),threshold=resolveThreshold(p,l,options.resolvedThreshold),out=adjustToneLut(input,options);
 if(threshold!==null||p.invert)for(let code=0;code<out.length;code++)out[code]=finishCode(out[code],p,threshold,l.maximum);return out;
}
function mapBytes(samples,lut,out){for(let i=0;i<samples.length;i++)out[i]=lut[samples[i]];return out;}
function mapWords(samples,lut,out){for(let i=0;i<samples.length;i++)out[i]=lut[samples[i]];return out;}
export function applyAdjustPointLut(samples,lut,{target}={}){
 const depth=samples instanceof Uint16Array?16:samples instanceof Uint8Array?8:null,l=layout(depth);
 requireValue(lut instanceof l.Type&&lut.length===l.bins,'Adjustment lookup has another code domain.');
 if(target===undefined)target=allocateTypedArray(l.Type,samples.length,{label:'adjust-point-output'});
 requireValue(target instanceof l.Type&&target.length===samples.length,'Adjustment output has another sample type or extent.');
 requireValue(!overlaps(target,lut),'Adjustment output must not mutate its immutable lookup table.');
 requireValue(!overlaps(target,samples)||target.byteOffset===samples.byteOffset,'Shifted sample overlap requires a separate destination.');
 return depth===8?mapBytes(samples,lut,target):mapWords(samples,lut,target);
}
