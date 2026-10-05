// Development-only transport/allocation injection around the real native worker.
const fault=new URL(location.href).searchParams.get('fault'),send=globalThis.postMessage.bind(globalThis);let injected=false;
if(fault==='null')globalThis.postMessage=(message,...rest)=>{if(!injected&&message?.base){injected=true;send(null);return;}send(message,...rest);};
if(fault==='allocation'){
 const NativeFloat32Array=globalThis.Float32Array;
 globalThis.Float32Array=new Proxy(NativeFloat32Array,{construct(target,args){if(!injected&&args[0]===256){injected=true;throw new RangeError('Array buffer allocation failed');}return Reflect.construct(target,args);}});
}
const queued=[];globalThis.onmessage=event=>queued.push(event);
await import('../src/sift-paged-worker.js');
for(const event of queued)globalThis.onmessage(event);
