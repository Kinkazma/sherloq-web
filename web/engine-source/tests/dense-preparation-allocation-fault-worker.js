// Development-only useful allocation fault. The real worker and serializer run
// unchanged, and its transferred input is consumed by the actual browser.
import '../src/dense-zernike-tile-worker.js';
if(new URL(import.meta.url).searchParams.has('fail')){
 const Native=globalThis.Float32Array;let refused=false;
 globalThis.Float32Array=new Proxy(Native,{construct(target,args){if(!refused&&typeof args[0]==='number'&&args[0]>4096){refused=true;throw new RangeError('Array buffer allocation failed');}return Reflect.construct(target,args);}});
}
