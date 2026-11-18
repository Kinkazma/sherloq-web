import {requireValue,checkAbort} from './errors.js';
import {gray} from './pixel-utils.js';

export const NATIVE16_ADJUST_OTSU_BINS=65536;
export const NATIVE16_ADJUST_OTSU_HISTOGRAM_BYTES=NATIVE16_ADJUST_OTSU_BINS*Float64Array.BYTES_PER_ELEMENT;
const FLT_EPSILON=2**-23;
export function native16AdjustOtsuPlan(){return{known:true,bins:NATIVE16_ADJUST_OTSU_BINS,histogramBytes:NATIVE16_ADJUST_OTSU_HISTOGRAM_BYTES,histogramType:'Float64Array',scratchBytes:0,inputDepth:16,grayscale:'BT601-coded-integer',scope:'one-global-toned-image'};}
function histogramShape(histogram){requireValue((histogram instanceof Float64Array||histogram instanceof Int32Array)&&histogram.length===NATIVE16_ADJUST_OTSU_BINS,'Native16 adjustment Otsu requires its complete 65536-bin histogram.');}
// The producer finances/owns one histogram and visits the complete toned bank.
// Rows only accumulate observations; none chooses a separate local threshold.
export function addNative16AdjustOtsuHistogram(histogram,samples,{signal}={}){
 histogramShape(histogram);requireValue(samples instanceof Uint16Array&&samples.length%3===0,'Native16 Otsu observations must be exact coded RGB16.');checkAbort(signal);
 for(let i=0;i<samples.length;i+=3)histogram[gray(samples[i],samples[i+1],samples[i+2])]++;
 checkAbort(signal);return samples.length/3;
}
// Generalization of native/adjust-bands.cpp::_adjust_otsu with the identical
// binary64 evaluation order, FLT_EPSILON guard and strict first-improving tie.
export function native16AdjustOtsu(histogram,count,{signal}={}){
 histogramShape(histogram);requireValue(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(count*65535),'Native16 Otsu population exceeds its exact integer mean domain.');checkAbort(signal);
 let observed=0,mu=0;const scale=1/count;
 for(let i=0;i<NATIVE16_ADJUST_OTSU_BINS;i++){const value=histogram[i];requireValue(Number.isSafeInteger(value)&&value>=0,'Native16 Otsu counts must be nonnegative exact integers.');observed+=value;mu+=i*value;}
 requireValue(observed===count,'Native16 Otsu histogram population differs from its complete image.');mu*=scale;
 let mu1=0,q1=0,maxSigma=0,maxValue=0;
 for(let i=0;i<NATIVE16_ADJUST_OTSU_BINS;i++){
  const pi=histogram[i]*scale;mu1*=q1;q1+=pi;const q2=1-q1;
  if(Math.min(q1,q2)<FLT_EPSILON||Math.max(q1,q2)>1-FLT_EPSILON)continue;
  mu1=(mu1+i*pi)/q1;const mu2=(mu-q1*mu1)/q2,sigma=q1*q2*(mu1-mu2)*(mu1-mu2);
  if(sigma>maxSigma){maxSigma=sigma;maxValue=i;}
 }
 checkAbort(signal);return maxValue;
}
