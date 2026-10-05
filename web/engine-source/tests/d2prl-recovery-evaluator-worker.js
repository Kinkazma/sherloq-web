// Development-only refusal after native tile work, at the output copy boundary.
const original=Float32Array.prototype.slice;let copies=0;
Float32Array.prototype.slice=function(...args){if(++copies===6)throw new RangeError('Array buffer allocation failed');return original.apply(this,args);};
import '../experiments/d2prl/evaluator-worker.js';
