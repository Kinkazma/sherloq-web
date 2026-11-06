import {EngineError,checkAbort} from './errors.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};};

// Only the dispatcher opens this gate: every native task has then flushed its
// output pages and is waiting for its next command. A hold never resets a task.
export function createDenseInputBarrier({signal}={}){
 let handler,atBoundary=false,finished=false,tail=Promise.resolve(),wake=deferred();
 const installed=deferred(),boundary=new Set(),holds=new Map();
 const serial=work=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};
 const idle=()=>{checkAbort(signal);if(atBoundary||finished)return Promise.resolve();const wait=deferred();boundary.add(wait);return wait.promise;};
 const announce=()=>{for(const wait of boundary)wait.resolve();boundary.clear();};
 const abort=()=>{const error=new EngineError('CANCELLED','Dense input migration cancelled.');installed.reject(error);for(const wait of boundary)wait.reject(error);boundary.clear();wake.reject(error);};
 signal?.addEventListener('abort',abort,{once:true});
 return {
  install(value){handler=value;installed.resolve();},
  async tryPause(token,ids){
   checkAbort(signal);
   // Allocation recovery may be waiting on this very dispatcher. Never queue
   // a hold behind a running native command: negotiate only an existing safe
   // boundary, synchronously, before allowing another native command to start.
   if(!handler||!atBoundary&&!finished)return false;
   await this.pause(token,ids);return true;
  },
  async pause(token,ids){
   checkAbort(signal);if(holds.has(token))return holds.get(token).paused;
   const hold={ids};holds.set(token,hold);
   hold.paused=(async()=>{await installed.promise;await idle();checkAbort(signal);await serial(()=>handler.detach(ids));})();hold.paused.catch(()=>{});
   return hold.paused;
  },
  async resume(token,entries){
   const hold=holds.get(token);if(!hold)return;
   try{await hold.paused;await serial(()=>handler.attach(entries));}
   finally{holds.delete(token);if(!holds.size){wake.resolve();wake=deferred();}}
  },
  async checkpoint(){
   checkAbort(signal);atBoundary=true;announce();
   try{while(holds.size){const waiting=wake.promise;await waiting;checkAbort(signal);}await tail;}
   finally{atBoundary=false;}
  },
  async admit(acquire){
   checkAbort(signal);atBoundary=true;announce();
   try{for(;;){while(holds.size){await wake.promise;checkAbort(signal);}await tail;const lease=await acquire();if(!holds.size&&!signal?.aborted)return lease;await lease.release?.();checkAbort(signal);}}
   finally{atBoundary=false;}
  },
  async waitAtBoundary(work){
   checkAbort(signal);atBoundary=true;announce();
   try{const result=await work();while(holds.size){await wake.promise;checkAbort(signal);}await tail;return result;}
   finally{atBoundary=false;}
  },
  async finish(){finished=true;atBoundary=true;announce();try{while(holds.size)await wake.promise;await tail;}finally{signal?.removeEventListener('abort',abort);}},
  get pending(){return holds.size>0;},
 };
}
