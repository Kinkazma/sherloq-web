// One worker shared by every document; one running job and one replaceable next
// request. Slider/pointer events cannot form an ever-growing computation queue.
export function createLoupeEffectQueue(workerFactory=()=>new Worker(new URL('./loupe-effects-worker.js?v=0.31.0',import.meta.url),{type:'module'})){
 let worker=null,running=null,next=null,serial=0,retained=null,idleTimer=0;
 const failure=(message,cause,code='WORKER_MESSAGE_FAILED')=>Object.assign(Error(message,{cause}),{code});
 const validFrames=frames=>Array.isArray(frames)&&frames.length===3&&frames.every(f=>f&&Number.isInteger(f.width)&&Number.isInteger(f.height)&&f.width>0&&f.height>0&&f.width<=1024&&f.height<=1024&&f.data instanceof Uint8ClampedArray&&f.data.length===f.width*f.height*4);
 function closeWorker(){const previous=worker;worker=null;retained=null;if(previous){previous.onmessage=previous.onerror=previous.onmessageerror=null;previous.terminate();}}
 function dispose(){clearTimeout(idleTimer);closeWorker();running?.resolve(null);next?.resolve(null);running=next=null;}
 function idle(){if(!running&&worker)idleTimer=setTimeout(dispose,15000);}
 function fail(created,error){if(worker!==created)return;const job=running;running=null;closeWorker();job?.reject(error);pump();idle();}
 function pump(){if(running||!next)return;clearTimeout(idleTimer);const job=next;next=null;running=job;
  let frames;try{frames=retained===job.id?null:job.capture();}catch(error){running=null;job.reject(error);pump();idle();return;}
  try{if(!worker){const created=workerFactory();worker=created;
   created.onmessage=({data})=>{
    if(worker!==created)return;
    if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.ticket)||data.ticket<=0){fail(created,failure('Invalid loupe worker response.'));return;}
    if(running&&data.ticket>running.ticket){fail(created,failure('Loupe worker response has an unknown request identity.'));return;}
    if(data.ticket!==running?.ticket)return;
    if(data.error){if(typeof data.error!=='object'||Array.isArray(data.error)||typeof data.error.message!=='string'){fail(created,failure('Invalid loupe worker error.'));return;}const complete=running;running=null;retained=null;complete.reject(Object.assign(Error(data.error.message),data.error));pump();idle();return;}
    if(!validFrames(data.frames)){fail(created,failure('Invalid loupe worker frames.'));return;}
    const complete=running;running=null;retained=complete.id;complete.resolve(data);pump();idle();
   };
   created.onerror=event=>fail(created,failure(event.message||'Loupe worker failed',event.error,'WORKER_FAILED'));
   created.onmessageerror=event=>fail(created,failure('Loupe worker response could not be decoded.',event.error));
  }
   worker.postMessage({ticket:job.ticket,id:job.id,frames,effects:job.effects},frames?.map(v=>v.data.buffer)??[]);
  }catch(error){if(worker)fail(worker,failure('Loupe worker request could not be sent.',error));else{running=null;retained=null;job.reject(failure('Loupe worker could not start.',error,'WORKER_FAILED'));pump();}}
 }
 return{run(id,effects,capture,owner){return new Promise((resolve,reject)=>{next?.resolve(null);next={id,effects,capture,owner,resolve,reject,ticket:++serial};pump();});},cancel(owner){if(next?.owner===owner){next.resolve(null);next=null;}if(running?.owner===owner){running.resolve(null);running.resolve=()=>{};running.reject=()=>{};}},dispose};
}
export const loupeEffectQueue=createLoupeEffectQueue();
