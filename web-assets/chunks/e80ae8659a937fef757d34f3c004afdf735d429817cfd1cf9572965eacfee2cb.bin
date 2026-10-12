import "../../runtime-context.js?v=0.15.1";
import {WaveletStripPool} from './wavelet-strip-pool.js';
export class PrnuStripPool extends WaveletStripPool{
 constructor(budget,profile={}){super(budget,{...profile,workerHeapBytes:32*1024**2,workerPixelBytes:256,workerURL:profile.workerURL??new URL('./prnu-strip-worker.js',import.meta.url),workerFactory:profile.workerFactory??(globalThis.Worker?()=>new Worker(new URL('./prnu-strip-worker.js',import.meta.url),{type:'module'}):null)});}
}
