import {waveletStreamMath} from './wavelet-stream-math.js';
self.onmessage=async({data})=>{try{const math=await waveletStreamMath();let result;
 if(data.op==='down')result=math.down(data.values,data.width,data.height,data.wavelet,data.axis);
 else if(data.op==='up'){if(data.thresholdA)math.threshold(data.a,data.maximumA,data.percent,data.mode);if(data.thresholdD)math.threshold(data.d,data.maximumD,data.percent,data.mode);result=math.up(data.a,data.d,data.width,data.height,data.wavelet,data.axis);}
 else if(data.op==='noise')result=math.noise(data.values,data.width,data.height,data.block);
 else throw Error('Unknown wavelet strip operation');
 const buffers=[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer))];self.postMessage({result},buffers);
 }catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}};
