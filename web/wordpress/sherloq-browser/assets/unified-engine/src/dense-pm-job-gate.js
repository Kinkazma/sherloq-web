import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort,requireValue} from './errors.js';
import {densePmReverseHeapBound} from './dense-pm-reverse.js';
const gates=new WeakMap();
// One full-bank dense matching body per shared Budget. This is a memory gate,
// not another GPU slot: the producer still uses the common execution scheduler.
// CPU descriptors from other admitted lanes can proceed while this gate waits.
export function acquireDensePmJob(budget,signal){
 checkAbort(signal);let gate=gates.get(budget);if(!gate){gate={active:false,queue:[]};gates.set(budget,gate);}
 return new Promise((resolve,reject)=>{
  const waiter={resolve,reject,signal,abort:null,granted:false};
  const pump=()=>{if(gate.active)return;while(gate.queue.length){const next=gate.queue.shift();next.signal?.removeEventListener('abort',next.abort);if(next.signal?.aborted){next.reject(new EngineError('CANCELLED','Dense GPU memory gate cancelled'));continue;}gate.active=true;next.granted=true;let done=false;next.resolve(()=>{if(done)return;done=true;gate.active=false;pump();});return;}};
  waiter.abort=()=>{if(waiter.granted)return;const index=gate.queue.indexOf(waiter);if(index>=0)gate.queue.splice(index,1);signal?.removeEventListener('abort',waiter.abort);reject(new EngineError('CANCELLED','Dense GPU memory gate cancelled'));};gate.queue.push(waiter);signal?.addEventListener('abort',waiter.abort,{once:true});pump();
 });
}
// Planning only, without image reads or an allocation probe. The exact provider
// reserves its actual allocations individually. Include bank publication,
// reverse heap, GPU bank/upload, field/readback/mapping, uniforms/groups and
// conservative concurrent workgroup scratch. Pipeline high-water is per lane.
export function densePmGpuMemoryBound(width,height,dimensions,iterations,second=false,axesBytes=0){
 requireValue([width,height,dimensions,iterations,axesBytes].every(Number.isSafeInteger)&&axesBytes>=0&&width>0&&height>0&&[12,128].includes(dimensions)&&iterations>0,'Invalid dense GPU memory shape');
 const n=width*height,bank=n*dimensions*4*(second?2:1),reverse=densePmReverseHeapBound(second?n*dimensions*4:0,second?n*dimensions*4:0,n,axesBytes),steps=1+iterations*Math.ceil((width+2*height-2)/4),bytes=bank*3+reverse+n*128+steps*2048+Math.ceil(height/4)*16384+16*1024**2;
 return Number.isSafeInteger(bytes)&&reverse<2**31?bytes:Infinity;
}
