import {installTransformStripWorker} from './transform-strip-worker.js';
import {resamplingStreamMath,resamplingStreamHeapBytes} from './resampling-stream-math.js';
installTransformStripWorker(async data=>{const math=await resamplingStreamMath();let values;if(data.op==='axis')values=math.axis(data.values,data.length,data.lines,data.real);else if(data.op==='pyrup')values=math.pyrup(data.values,data.width,data.height);else throw Error('Unknown resampling strip operation');return {values,heapBytes:resamplingStreamHeapBytes()};},{label:'resampling-strip'});
