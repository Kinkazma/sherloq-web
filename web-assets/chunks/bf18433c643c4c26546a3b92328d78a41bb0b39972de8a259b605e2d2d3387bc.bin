import "../../runtime-context.js?v=0.30.0";
// Keep module-load failures inside the request protocol. An external worker
// error event can omit its message and source when a static import fails.
let loadError,fatal,detachMessageError=()=>{};
const moduleURL=new URL('./m2-worker-host.js',import.meta.url).href;
function encode(error,fallback='M2_WORKER',seen=new Set()){
 if(seen.has(error))return {name:'Error',code:fallback,message:'Circular error cause'};seen.add(error);
 const value={name:error?.name||'Error',code:error?.code||fallback,message:error?.message||String(error)};if(error?.stack)value.stack=error.stack;if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:String(error.details)};}if(error?.cause!==undefined)value.cause=encode(error.cause,fallback,seen);return value;
}
const fail=error=>{if(fatal)return;fatal=error;detachMessageError();self.postMessage({fatal:true,error});};
const loaded=import('./m2-worker-host.js').then(({createM2WorkerHost})=>createM2WorkerHost({post:(message,transfer)=>self.postMessage(message,transfer)})).catch(error=>{loadError={name:'EngineError',code:'WORKER_LOAD_FAILED',message:error?.message||'M2 worker module could not be loaded.',stack:error?.stack,details:{moduleURL},cause:encode(error,'INTERNAL')};});
self.onmessage=event=>{
 if(fatal)return;
 let data;try{data=event.data;}catch(error){fail({name:'EngineError',code:'WORKER_MESSAGE_FAILED',message:'M2 worker command could not be read.',details:{transport:{label:'m2-endpoint',event:'message',reason:'unreadable-data'}},cause:encode(error,'INTERNAL')});return;}
 if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.id)||data.id<=0||typeof data.operation!=='string'||data.args!==undefined&&(!data.args||typeof data.args!=='object'||Array.isArray(data.args))){fail({name:'EngineError',code:'WORKER_MESSAGE_FAILED',message:'M2 worker command could not be read.',details:{transport:{label:'m2-endpoint',event:'message',reason:data===null?'null-data':'invalid-command'}}});return;}
 // Await only bootstrap, preserving early command order without serializing
 // useful host operations or preventing cancellation during an analysis.
 void loaded.then(host=>{if(fatal)return;return host?host.handle(data):self.postMessage({id:data.id,error:loadError});}).catch(error=>{if(!fatal)self.postMessage({id:data.id,error:encode(error)});});
};
const messageError=()=>fail({name:'EngineError',code:'WORKER_MESSAGE_FAILED',message:'M2 worker command could not be deserialized.',details:{transport:{label:'m2-endpoint',event:'messageerror',reason:'deserialization-failed'}}});
// No new static import before the guarded host bootstrap. WorkerGlobalScope
// is EventTarget; the property fallback exists only for simple test facades.
if(typeof self.addEventListener==='function'&&typeof self.removeEventListener==='function'){
 self.addEventListener('messageerror',messageError);
 let detached=false;detachMessageError=()=>{if(detached)return;detached=true;self.removeEventListener('messageerror',messageError);};
}else{
 self.onmessageerror=messageError;
 let detached=false;detachMessageError=()=>{if(detached)return;detached=true;if(self.onmessageerror===messageError)self.onmessageerror=null;};
}

