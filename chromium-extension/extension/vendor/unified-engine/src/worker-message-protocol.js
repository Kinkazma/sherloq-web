import "../../runtime-context.js?v=0.17.2";
import {EngineError,normalizeResourceError} from './errors.js';

// Reinstallation replaces the old error listener, as IDL properties do.
const messageErrorListeners=new WeakMap();

export function workerMessageFailure(label,event='message',reason='unreadable-data'){
 return new EngineError('WORKER_MESSAGE_FAILED','Worker message could not be read ('+label+': '+reason+').',{details:{transport:{label,event,reason}}});
}

// A null payload is not a valid engine command. Chromium can return it when
// deserialization fails; it does not reveal whether allocation was the cause.
// Async event handlers must be observed explicitly: their rejected promises do
// not reliably reach Worker.onerror and must never leave a CPU lease orphaned.
export function installWorkerMessageProtocol(target,handle,{label='worker',onFailure}={}){
 let failure;
 const fail=error=>{if(failure)return;failure=normalizeResourceError(error);onFailure?.(failure);};
 const message=event=>{
  if(failure)return;
  try{const data=event.data;if(!data||typeof data!=='object'||Array.isArray(data))throw workerMessageFailure(label,'message',data===null?'null-data':'invalid-envelope');const result=handle(data);if(result&&typeof result.then==='function')Promise.resolve(result).catch(fail);}catch(error){fail(error);}
 };
 const messageerror=()=>fail(workerMessageFailure(label,'messageerror','deserialization-failed'));
 target.onmessage=message;target.onmessageerror=messageerror;
 const previous=messageErrorListeners.get(target);
 if(previous){target.removeEventListener('messageerror',previous);messageErrorListeners.delete(target);}
 if(typeof target.addEventListener==='function'&&typeof target.removeEventListener==='function'){
  target.addEventListener('messageerror',messageerror);messageErrorListeners.set(target,messageerror);
 }
 return {get failed(){return !!failure;},get error(){return failure;},fail,
  post(data,transfer=[]){if(failure)throw failure;target.postMessage(data,transfer);},
  dispose(){if(target.onmessage===message)target.onmessage=null;if(target.onmessageerror===messageerror)target.onmessageerror=null;if(messageErrorListeners.get(target)===messageerror){target.removeEventListener('messageerror',messageerror);messageErrorListeners.delete(target);}}
 };
}

// Private attachment only. No message parser, error/code change or native work.
// Chromium Worker does not expose an onmessageerror IDL property; its ordinary
// expando is inert. EventTarget also works on WorkerGlobalScope and MessagePort.
const directMessageErrorAttachments=new WeakMap();
export function attachWorkerMessageError(target,listener){
 directMessageErrorAttachments.get(target)?.();
 let closed=false;
 const handler=event=>{if(!closed)listener(event);};
 const events=typeof target.addEventListener==='function'&&typeof target.removeEventListener==='function';
 if(events)target.addEventListener('messageerror',handler);else target.onmessageerror=handler;
 const detach=()=>{
  if(closed)return;closed=true;
  if(events)target.removeEventListener('messageerror',handler);
  else if(target.onmessageerror===handler)target.onmessageerror=null;
  if(directMessageErrorAttachments.get(target)===detach)directMessageErrorAttachments.delete(target);
 };
 directMessageErrorAttachments.set(target,detach);return detach;
}
