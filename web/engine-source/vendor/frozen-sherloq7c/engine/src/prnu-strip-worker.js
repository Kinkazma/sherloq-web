import {installTransformStripWorker} from './transform-strip-worker.js';
import {prnuStreamMath,prnuStreamHeapBytes} from './prnu-stream-math.js';
installTransformStripWorker(async data=>{const math=await prnuStreamMath();let values;
 if(data.op==='axis')values=math.axis(data.values,data.length,data.lines,data.mode,data.factor);
 else if(data.op==='convolution')values=math.axis(math.multiply(math.axis(data.values,data.length,data.lines,1),math.axis(data.kernel,data.length,data.lines,1)),data.length,data.lines,2);
 else throw Error('Unknown PRNU strip operation');return {values,heapBytes:prnuStreamHeapBytes()};
},{label:'prnu-strip'});
