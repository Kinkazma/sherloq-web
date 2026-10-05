import {WaveletStripPool} from './wavelet-strip-pool.js';
export class FrequencyStripPool extends WaveletStripPool{
 constructor(budget,profile={}){super(budget,{...profile,workerFactory:profile.workerFactory??(globalThis.Worker?()=>new Worker(new URL('./frequency-strip-worker.js',import.meta.url),{type:'module'}):null)});}
}
