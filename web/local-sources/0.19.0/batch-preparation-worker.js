// Dynamic bootstrap keeps module-load failures inside the M2 request protocol.
let loadError,fatal;
const moduleURL=new URL('./batch-preparation-host.js?v=0.19.0',import.meta.url).href;
function encode(error,fallback='BATCH_PREPARATION_WORKER',seen=new Set()){
 if(seen.has(error))return {name:'Error',code:fallback,message:'Circular error cause'};seen.add(error);const value={name:error?.name||'Error',code:error?.code||fallback,message:error?.message||String(error)};if(error?.stack)value.stack=error.stack;if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:String(error.details)};}if(error?.cause!==undefined)value.cause=encode(error.cause,fallback,seen);return value;
}
const fail=error=>{if(fatal)return;fatal=error;self.postMessage({fatal:true,error});};
const loaded=import('./batch-preparation-host.js?v=0.19.0').then(({createBatchPreparationHost})=>createBatchPreparationHost({post:(message,transfer)=>self.postMessage(message,transfer)})).catch(error=>{loadError={name:'EngineError',code:'WORKER_LOAD_FAILED',message:error?.message||'Batch preparation module could not be loaded.',stack:error?.stack,details:{moduleURL},cause:encode(error,'INTERNAL')};});
self.onmessage=({data})=>{
 if(fatal)return;
 if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.id)||data.id<=0||typeof data.operation!=='string'||data.args!==undefined&&(!data.args||typeof data.args!=='object'||Array.isArray(data.args))){fail({name:'EngineError',code:'WORKER_MESSAGE_FAILED',message:'Batch preparation command could not be read.',details:{transport:{label:'batch-preparation-endpoint',event:'message',reason:data===null?'null-data':'invalid-command'}}});return;}
 void loaded.then(async host=>{if(fatal)return;if(!host){self.postMessage({id:data.id,error:loadError});return;}await host.handle(data);if(data.operation==='dispose')self.close();}).catch(error=>{if(!fatal)self.postMessage({id:data.id,error:encode(error)});});
};
self.onmessageerror=()=>fail({name:'EngineError',code:'WORKER_MESSAGE_FAILED',message:'Batch preparation command could not be deserialized.',details:{transport:{label:'batch-preparation-endpoint',event:'messageerror',reason:'deserialization-failed'}}});
