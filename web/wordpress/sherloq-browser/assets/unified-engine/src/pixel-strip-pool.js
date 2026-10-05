import "../../runtime-context.js?v=0.14.5";
import {WaveletStripPool} from './wavelet-strip-pool.js';
export function pixelStripPool(image,budget,{maxWorkers=1,heapBytes=64*1024**2,pixelBytes=32}={}){
 return new WaveletStripPool(budget,{maxWorkers,adaptive:image.pixelScheduling??=new Map(),workerHeapBytes:heapBytes,workerPixelBytes:pixelBytes,workerFactory:globalThis.Worker?()=>new Worker(new URL('./pixel-strip-worker.js',import.meta.url),{type:'module'}):null});
}
