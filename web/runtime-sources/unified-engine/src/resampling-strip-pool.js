import "../../runtime-context.js?v=0.16.0";
import {WaveletStripPool} from './wavelet-strip-pool.js';
export class ResamplingStripPool extends WaveletStripPool{
 constructor(budget,profile={}){super(budget,{...profile,workerHeapBytes:12*1024**2,workerPixelBytes:192,workerURL:profile.workerURL??new URL('./resampling-strip-worker.js',import.meta.url),workerFactory:profile.workerFactory??(globalThis.Worker?()=>new Worker(new URL('./resampling-strip-worker.js',import.meta.url),{type:'module'}):null)});}
}
