// One worker shared by every document; one running job and one replaceable next
// request. Slider/pointer events cannot form an ever-growing computation queue.
export function createLoupeEffectQueue(workerFactory=()=>new Worker(new URL('./loupe-effects-worker.js',import.meta.url),{type:'module'})){
 let worker=null,running=null,next=null,serial=0,retained=null,idleTimer=0;
 function dispose(){clearTimeout(idleTimer);worker?.terminate();worker=null;retained=null;running?.resolve(null);next?.resolve(null);running=next=null;}
 function pump(){if(running||!next)return;clearTimeout(idleTimer);const job=next;next=null;running=job;
  try{if(!worker){worker=workerFactory();worker.onmessage=({data})=>{if(data.ticket!==running?.ticket)return;const complete=running;running=null;if(data.error){retained=null;complete.reject(Object.assign(Error(data.error.message),data.error));}else{retained=complete.id;complete.resolve(data);}pump();if(!running)idleTimer=setTimeout(dispose,15000);};worker.onerror=e=>{const failed=running;running=null;worker?.terminate();worker=null;retained=null;failed?.reject(Error(e.message||'Loupe worker failed'));pump();};}
   const frames=retained===job.id?null:job.capture();worker.postMessage({ticket:job.ticket,id:job.id,frames,effects:job.effects},frames?.map(v=>v.data.buffer)??[]);
  }catch(error){running=null;retained=null;job.reject(error);pump();if(!running)idleTimer=setTimeout(dispose,15000);}
 }
 return{run(id,effects,capture,owner){return new Promise((resolve,reject)=>{next?.resolve(null);next={id,effects,capture,owner,resolve,reject,ticket:++serial};pump();});},cancel(owner){if(next?.owner===owner){next.resolve(null);next=null;}if(running?.owner===owner){running.resolve(null);running.resolve=()=>{};running.reject=()=>{};}},dispose};
}
export const loupeEffectQueue=createLoupeEffectQueue();
