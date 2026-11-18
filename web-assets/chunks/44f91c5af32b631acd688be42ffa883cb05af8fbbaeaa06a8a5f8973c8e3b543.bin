import "../../runtime-context.js?v=0.33.2";
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {checkAbort,requireValue} from './errors.js';

// Partition independent matrix entries, NEVER observations or partial sums.
// Every entry keeps the complete original pixel order and native fused adds.
export function createPcaCovariancePool({budget,maxWorkers=1,blockPixels,total,inputDepth=8}){
 const lanes=Math.min(3,Math.max(1,Math.floor(maxWorkers))),sampleBytes=inputDepth===16?2:1,sharedBytes=blockPixels*3*sampleBytes;
 requireValue(inputDepth===8||inputDepth===16,'Invalid PCA covariance depth.');
 if(total<1024*1024||lanes<2||typeof Worker!=='function'||budget.limit-budget.total()<lanes*(8*1024**2+blockPixels*(inputDepth===16?16:8))+sharedBytes)return null;
 const canShare=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function',release=canShare?budget.reserve(sharedBytes):()=>{};let shared,backing;
 try{if(canShare){shared=new (inputDepth===16?Uint16Array:Uint8Array)(new SharedArrayBuffer(sharedBytes));backing=budget.registerBacking?.('array-buffer',sharedBytes,{owner:'pca-covariance',label:'shared-input-band',reclaimable:false});}}
 catch(error){release();throw error;}
 const pool=new WaveletStripPool(budget,{resourceOwner:'pca-covariance',maxWorkers:lanes,workerHeapBytes:8*1024**2,workerPixelBytes:inputDepth===16?16:8,workerURL:new URL('./pca-covariance-worker.js',import.meta.url)});
 const cleanup=pool.ownCleanup(async()=>{shared=null;backing?.();backing=null;release();});
 const pairs=[0,1,2,4,5,8];let closed=false;
 return {
  async add(bytes,mean,cov,math,signal){
   requireValue(!closed&&bytes.byteLength<=sharedBytes&&(inputDepth===16?bytes instanceof Uint16Array:bytes instanceof Uint8Array),'PCA covariance band exceeds its owned workspace.');checkAbort(signal);shared?.set(bytes);const input=shared?.subarray(0,bytes.length);
   await pool.run({count:lanes,pixels:bytes.length/3,key:'pca-covariance/'+lanes+(inputDepth===16?'/16':''),signal,
    prepare:async index=>({bytes:input??bytes.slice(),mean:mean.slice(),cov:cov.slice(),first:Math.floor(index*6/lanes),last:Math.floor((index+1)*6/lanes)}),
    local:job=>({values:math.covarianceRange(job.bytes,job.mean,job.cov,job.first,job.last)}),
    consume:async(result,index)=>{requireValue(result.values instanceof Float64Array&&result.values.length===9,'Invalid PCA covariance worker result.');for(let entry=Math.floor(index*6/lanes);entry<Math.floor((index+1)*6/lanes);entry++)cov[pairs[entry]]=result.values[pairs[entry]];}
   });return cov;
  },
  metrics(){return {...pool.metrics(),transport:canShare?'shared-bounded-band':'transferred-bounded-band'};},
  async dispose(){await cleanup.retire({endpoints:true,retryEndpoints:true});closed=true;}
 };
}
