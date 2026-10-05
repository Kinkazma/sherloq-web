import '../experiments/d2prl/convolution-cpu-worker.js';
const original=Float32Array.prototype.slice;let copies=0;
Float32Array.prototype.slice=function(...args){if(++copies===2)throw new RangeError('Array buffer allocation failed');return original.apply(this,args);};
