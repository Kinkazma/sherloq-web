import {installTransformStripWorker} from './transform-strip-worker.js';
import {pcaStreamMath,pcaStreamHeapBytes} from './pca-stream-math.js';
installTransformStripWorker(async job=>{
 const math=await pcaStreamMath();
 return {values:math.covarianceRange(job.bytes,job.mean,job.cov,job.first,job.last),heapBytes:pcaStreamHeapBytes()};
},{label:'pca-covariance'});
