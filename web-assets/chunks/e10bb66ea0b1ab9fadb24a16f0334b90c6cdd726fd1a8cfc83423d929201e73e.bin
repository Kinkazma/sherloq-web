import "../../../../../runtime-context.js?v=0.31.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {gradientDerivatives,gradientHeapBytes} from './gradient-math.js';

// A derivative endpoint needs no OpenCV operations or other pixel-tool modules.
// Arithmetic, complete-row halos and resource admission remain with its owner.
installTransformStripWorker(async job=>{
 if(job.op!=='gradient-derivatives')throw Error('Unknown gradient strip stage');
 const result=await gradientDerivatives({width:job.width,height:job.height,format:'rgb8',data:job.rgb},job.start,job.rows,{method:job.method});
 return {...result,heapBytes:gradientHeapBytes()};
},{label:'gradient-strip'});
