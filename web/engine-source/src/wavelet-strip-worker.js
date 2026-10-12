import {installTransformStripWorker} from './transform-strip-worker.js';
import {waveletStreamMath,waveletStreamHeapBytes} from './wavelet-stream-math.js';
installTransformStripWorker(async data=>{const math=await waveletStreamMath();let result;
 if(data.op==='down')result=math.down(data.values,data.width,data.height,data.wavelet,data.axis);
 else if(data.op==='up'){if(data.thresholdA)math.threshold(data.a,data.maximumA,data.percent,data.mode);if(data.thresholdD)math.threshold(data.d,data.maximumD,data.percent,data.mode);result=math.up(data.a,data.d,data.width,data.height,data.wavelet,data.axis);}
 else if(data.op==='noise')result=math.noise(data.values,data.width,data.height,data.block);
 else throw Error('Unknown wavelet strip operation');
 return {...result,heapBytes:waveletStreamHeapBytes()};
},{label:'wavelet-strip'});
