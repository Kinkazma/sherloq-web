import '../src/dense-sift-stream-worker.js';
if(new URL(import.meta.url).searchParams.has('fail')){
 // Large banks are now reused, and the WASM module defines its own memory.
 // Refuse the actual owned weights copy after native gradients have run.
 const Native=Float32Array;let refused=false;
 Native.prototype.constructor=new Proxy(Native,{construct(target,args){if(!refused&&args.length===1&&args[0]===4){refused=true;throw new RangeError('Array buffer allocation failed');}return Reflect.construct(target,args);}});
}
