import "../../runtime-context.js?v=0.16.0";
import {WaveletStripPool} from './wavelet-strip-pool.js';
export class FrequencyStripPool extends WaveletStripPool{
 constructor(budget,profile={}){super(budget,{...profile,workerURL:profile.workerURL??new URL('./frequency-strip-worker.js',import.meta.url),workerFactory:profile.workerFactory??(globalThis.Worker?()=>new Worker(new URL('./frequency-strip-worker.js',import.meta.url),{type:'module'}):null)});}
}
