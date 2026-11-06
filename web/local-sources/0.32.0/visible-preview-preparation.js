// Optional preparation follows attention. It never owns a scientific result.
export function createVisiblePreviewPreparation({read,prepare,release,changed=()=>{},report=()=>{},
 schedule=callback=>globalThis.requestIdleCallback?requestIdleCallback(callback,{timeout:250}):setTimeout(callback,32),
 cancel=handle=>globalThis.cancelIdleCallback?cancelIdleCallback(handle):clearTimeout(handle),
 retry=callback=>setTimeout(callback,250),cancelRetry=clearTimeout}={}){
 let closed=false,scheduled=null,flight=null,controller=null,owner=null,attempted=null,retirement=null,failedOwner=null,retryHandle=null,retries=0;
 const notify=()=>{try{changed();}catch{}};
 const evidence=value=>{try{report(value);}catch{}};
 const snapshot=()=>closed?{active:false,allowed:false,key:null}:read();
 const unschedule=()=>{if(scheduled!==null){cancel(scheduled);scheduled=null;}};
 function retire(value){
  if(retirement)return retirement;
  const held=value??failedOwner??owner;if(!held)return Promise.resolve();
  unschedule();controller?.abort();attempted=null;if(owner===held)owner=null;failedOwner=held;
  const pending=flight;
  // Biomes input captures outlive command cancellation. Send their Source park
  // now so the worker can abort its private owner before its serial queue, then
  // await both the capture terminal reply and the retirement ACK. Other owners
  // retain their historical command-before-release ordering.
  const retiringOwner=held.context?.retainWhileBusy?Promise.allSettled([pending,Promise.resolve().then(()=>release(held.context))]).then(results=>{if(results[1].status==='rejected')throw results[1].reason;return results[1].value;}):Promise.resolve(pending).catch(()=>{}).then(()=>release(held.context));
  const task=retiringOwner.then(ack=>{
   if(ack===false||ack===0||ack?.parked===false)throw Object.assign(Error('Preview preparation retirement was not acknowledged.'),{code:'PREVIEW_RELEASE_UNACKNOWLEDGED'});
  });
  retirement=task.then(()=>{if(failedOwner===held)failedOwner=null;retries=0;evidence({phase:'released',key:held.key});},error=>{
   evidence({phase:'release-unavailable',key:held.key,code:error?.code,message:error?.message});
   if(!closed&&retries++<2&&retryHandle===null)retryHandle=retry(()=>{retryHandle=null;void retire();});
   throw error;
  }).finally(()=>{retirement=null;notify();if(!closed&&!failedOwner)update();});
  notify();retirement.catch(()=>{});return retirement;
 }
 function start(){
  scheduled=null;const state=snapshot();
  if(!state.active||!state.allowed||!state.key||flight||retirement||failedOwner)return;
  const held=owner??{key:state.key,context:state.context};owner=held;
  if(held.key!==state.key){void retire(held);return;}
  // A fresh adopted native result may use the same immutable source key.
  held.context=state.context;const own=controller=new AbortController();
  const sourceCurrent=()=>{const now=snapshot();return owner===held&&now.active&&now.key===held.key;};
  const current=()=>!own.signal.aborted&&sourceCurrent()&&snapshot().allowed;
  const task=Promise.resolve().then(()=>{if(!current())return null;return prepare(held.context,{signal:own.signal,isCurrent:current});});
  flight=task.then(result=>{
   if(current()||result?.retained===true&&held.context.retainWhileBusy&&sourceCurrent()){attempted=held.key;evidence({phase:'prepared',key:held.key,metrics:result});}
  },error=>{if(current()){attempted=held.key;evidence({phase:'preparation-unavailable',key:held.key,code:error?.code,message:error?.message});}}).finally(()=>{
   if(controller===own)controller=null;flight=null;notify();if(!closed)update();
  });
  notify();
 }
 function update(){
  const state=snapshot();
  if(!state.active||!state.key){unschedule();controller?.abort();attempted=null;if(owner&&!retirement)void retire(owner);return;}
  if(owner&&owner.key!==state.key){void retire(owner);return;}
  if(failedOwner||retirement)return;
  if(!state.allowed){unschedule();controller?.abort();if(!owner?.context.retainWhileBusy)attempted=null;return;}
  if(attempted===state.key||scheduled!==null||flight)return;
  scheduled=schedule(start);
 }
 return{
  update,
  invalidate(){attempted=null;update();},
  get busy(){return !!flight;},
  get retiring(){return !!retirement||!!failedOwner;},
  get state(){return{scheduled:scheduled!==null,preparing:!!flight,retiring:!!retirement||!!failedOwner,preparedKey:attempted,ownerKey:owner?.key??failedOwner?.key??null};},
  async dispose(){closed=true;unschedule();controller?.abort();if(retryHandle!==null){cancelRetry(retryHandle);retryHandle=null;}await retire();},
 };
}
