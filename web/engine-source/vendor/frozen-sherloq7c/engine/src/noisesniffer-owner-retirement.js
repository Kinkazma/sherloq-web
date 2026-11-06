// A refused storage ACK still owns its bank. Keep only unfinished retirements
// and retry those; independent successful ACKs must never run a second time.
export function noisesnifferOwnerRetirement(actions,{onRetired}={}){
 const pending=new Set(actions);let closing,retired=false,started=false;
 const dispose=()=>{
  if(retired)return Promise.resolve();if(closing)return closing;started=true;
  const task=(async()=>{let failed=false,primary;for(const retire of pending)try{await retire();pending.delete(retire);}catch(error){if(!failed){failed=true;primary=error;}else if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{(primary.cleanupErrors??=[]).push({code:error?.code,message:String(error?.message??error)});}catch{}}
   if(failed)throw primary;onRetired?.();retired=true;
  })();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
 };
 Object.defineProperties(dispose,{started:{get:()=>started},retired:{get:()=>retired}});return dispose;
}
