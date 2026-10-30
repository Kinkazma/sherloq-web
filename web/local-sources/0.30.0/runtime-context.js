import {errorEvidence} from './error-evidence.js?v=0.30.0';
import {resourceFetch} from './resilient-resource.js?v=0.30.0';
// One diagnostic channel per open workspace. No image bytes, cookies or network logging.
const KEY=Symbol.for('sherloq.runtime.context');
const stripTerminalColors=value=>value.replace(/\u001b\[[0-9;]*m/g,'');
const ortWarning=value=>typeof value==='string'&&!/\[E:onnxruntime(?:[:,\]])/.test(value)&&/^\s*(?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+)?\[W:onnxruntime(?:[:,\]])/.test(stripTerminalColors(value));
const resizeNotification=value=>value==='ResizeObserver loop completed with undelivered notifications.'||value==='ResizeObserver loop limit exceeded';
export function diagnosticScriptURL(value){
 if(typeof value!=='string')return null;
 try{const url=new URL(value);if(!/^https?:$/.test(url.protocol)||!/\.(?:m?js)$/i.test(url.pathname))return null;url.username='';url.password='';url.hash='';for(const key of url.searchParams.keys())if(/^(?:token|nonce|key|signature|email|fonts|home|authorization|password|access_token|api_key|file|filename)$/i.test(key))url.searchParams.set(key,'[redacted]');return diagnosticValue(url.href);}catch{return null;}
}
export function normalizeDiagnosticEvent(event){
 if(!event||typeof event!=='object')return event;
 if(event.kind==='worker.error'&&event.error==='C2pa(JumbfNotFound)'&&typeof event.worker==='string'&&/\/c2pa-worker\.js(?:[?#]|$)/.test(event.worker))return {...event,level:'info',classification:'c2pa-manifest-absent'};
 if(event.kind==='console'&&event.level==='error'&&Array.isArray(event.args)&&event.args.length&&event.args.every(ortWarning))return {...event,level:'warning',classification:'onnxruntime-warning'};
 if(event.kind==='uncaught'&&resizeNotification(event.error?.message))return {...event,level:'warning',classification:'resize-observer-notification'};
 if(event.kind==='operation.status'&&typeof event.message==='string'&&/^(?:Erreur\s*·|Error\s*·|Loupe\s*:\s*le traitement n[’']a pas abouti\.|Magnifier:\s*processing failed\.)/.test(event.message)){
  const code=/^(?:Erreur|Error)\s*·\s*([A-Z][A-Z0-9_]{2,})\b/.exec(event.message)?.[1]??'OPERATION_FAILED';
  return {...event,level:'error',error:event.error??{code,message:event.message,details:{reportedViaStatus:true}}};
 }
 return event;
}
export function diagnosticWorkerFailure(event={},workerURL){
 const sourceURL=diagnosticScriptURL(event.filename)??diagnosticScriptURL(workerURL),cause=event.error??event.cause;
 return {level:'error',kind:'worker.failure',worker:workerURL,error:{message:event.message||cause?.message||'Worker failed without a browser error message.',sourceURL,line:event.lineno??event.line,column:event.colno??event.column,type:event.type,stage:event.stage??event.executionPhase??cause?.details?.executionPhase,cause,browserMessageMissing:!event.message}};
}
export function diagnosticValue(value,depth=0,seen=new WeakSet()){
 if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='bigint')return String(value);
 if(typeof value==='string')return value.replace(/(?:blob:|data:)[^\s"']+/g,'[local resource]').replace(/([?&](?:token|nonce|key|signature|email|fonts|home)=)[^&\s"']*/gi,'$1[redacted]').slice(0,16000);
 if(typeof value!=='object')return String(value);
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer||typeof Blob!=='undefined'&&value instanceof Blob)return {type:value.constructor.name,byteLength:value.byteLength??value.size,omitted:'binary'};
 if(depth>10)return '[depth limit]';if(seen.has(value))return '[circular]';seen.add(value);
 if(value instanceof Error)return diagnosticValue(errorEvidence(value),depth+1,seen);
 if(Array.isArray(value))return value.length>128?{type:'array',length:value.length,omitted:'bulk values'}:value.map(v=>diagnosticValue(v,depth+1,seen));
 const out={};for(const [k,v]of Object.entries(value)){
  if(/^filename$/i.test(k)){out[k]=diagnosticScriptURL(v)??'[omitted]';continue;}
  if(/^(?:sourceURL|scriptURL)$/i.test(k)){out[k]=v==null?v:diagnosticScriptURL(v)??'[omitted]';continue;}
  if(/^(?:pixels|rgb|rgba|bytes|buffer|data|blob|file|originalBlob|imageData|tensor|weights|token|nonce|password|authorization|email)$/i.test(k)){out[k]='[omitted]';continue;}
  out[k]=diagnosticValue(v,depth+1,seen);
 }return out;
}
function setup(){
 const browser=typeof location!=='undefined'&&/^https?:$/.test(location.protocol);if(!browser)return {session:null,emit(){},retry(){return Promise.reject(Error('No interactive workspace'));}};
 const windowContext=typeof document!=='undefined';
 const session=windowContext?crypto.randomUUID():new URL(location.href).searchParams.get('sherloqSession');
 if(windowContext){const u=new URL(location.href);u.searchParams.set('sherloqSession',session);history.replaceState(history.state,'',u);}
 const context=crypto.randomUUID(),listeners=new Set(),retryWaiters=new Map();let sequence=0,waitSerial=0;
 const ownerPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,familyParam='sherloqDependencyOwner',inheritedFamily=windowContext?null:new URL(location.href).searchParams.get(familyParam),dependencyFamily=ownerPattern.test(inheritedFamily??'')?inheritedFamily:null;
 // Per-window live Worker handles only; no model bytes, retired tombstones or orphan owners.
 const activeFamilies=new Set(),workerFamilies=new WeakMap();
 const channel=session&&typeof BroadcastChannel==='function'?new BroadcastChannel('sherloq-session-'+session):null;
 const emit=entry=>{if(!session)return;const event={time:new Date().toISOString(),context,sequence:++sequence,...diagnosticValue(normalizeDiagnosticEvent(entry))};if(windowContext)for(const listener of listeners)try{listener(event);}catch{}else channel?.postMessage({type:'log',event});};
 channel?.addEventListener('message',({data})=>{if(data?.type==='log'&&windowContext){let event=data.event;const owner=event?.dependencyWaitOwner;if(event?.kind==='dependency.wait'&&owner?.schema==='sherloq.dependency-wait-owner/1'&&ownerPattern.test(owner.familyId??'')&&!activeFamilies.has(owner.familyId))event={...event,kind:'dependency.wait-inactive-owner',observedKind:'dependency.wait',diagnosticRetirementOnly:true,resourceAcknowledged:false};for(const listener of listeners)try{listener(event);}catch{}}if(data?.type==='retry'){const list=retryWaiters.get(data.key);retryWaiters.delete(data.key);for(const resolve of list||[])resolve();}});
 function retry(key,error,signal){
  if(!session||!channel)throw error;
  const dependencyWaitOwner={schema:'sherloq.dependency-wait-owner/1',context,requestId:++waitSerial,familyId:dependencyFamily};emit({level:'error',kind:'dependency.wait',key,error,dependencyWaitOwner});
  return new Promise((resolve,reject)=>{const list=retryWaiters.get(key)||[];const done=()=>{signal?.removeEventListener('abort',cancel);emit({level:'info',kind:'dependency.resumed',key,dependencyWaitOwner});resolve();};const cancel=()=>{const pending=retryWaiters.get(key)||[];const index=pending.indexOf(done);if(index>=0)pending.splice(index,1);if(!pending.length)retryWaiters.delete(key);emit({level:'info',kind:'dependency.cancelled',key,dependencyWaitOwner});reject(signal.reason);};if(signal?.aborted){cancel();return;}list.push(done);retryWaiters.set(key,list);signal?.addEventListener('abort',cancel,{once:true});});
 }
 const api={session,context,emit,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},retry,resume(key){emit({level:'info',kind:'dependency.retry',key});channel?.postMessage({type:'retry',key});if(windowContext)navigator.serviceWorker?.controller?.postMessage({type:'dependency-retry',key});const list=retryWaiters.get(key);retryWaiters.delete(key);for(const resolve of list||[])resolve();}};
 if(session&&typeof fetch==='function'){
  const nativeFetch=globalThis.fetch.bind(globalThis),resilient=resourceFetch(nativeFetch,{emit,wait:retry});
  const root=new URL('./',import.meta.url);
  globalThis.fetch=(input,init)=>{let url;try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return nativeFetch(input,init);}
   const local=url.origin===root.origin&&url.pathname.startsWith(root.pathname),relative=local?url.pathname.slice(root.pathname.length):'';
   return local&&/^(?:engine|energy-engine|composite-engine|composite-assets|unified-engine|unified-assets|individual-assets|extension-engine)\//.test(relative)&&(init?.method??(input instanceof Request?input.method:'GET'))==='GET'?resilient(input,init):nativeFetch(input,init);
  };
 }
 if(typeof Worker==='function'){
  const NativeWorker=globalThis.Worker;
  globalThis.Worker=class extends NativeWorker{
   constructor(url,options){let target=url,familyId=null;try{const u=new URL(url,location.href);if(session&&u.origin===location.origin&&/^https?:$/.test(u.protocol)){u.searchParams.set('sherloqSession',session);familyId=windowContext?crypto.randomUUID():dependencyFamily;if(familyId)u.searchParams.set(familyParam,familyId);target=u;}}catch{}super(target,options);if(familyId){workerFamilies.set(this,{familyId,root:windowContext});if(windowContext)activeFamilies.add(familyId);}
    this.addEventListener('message',({data:m})=>{if(!m||typeof m!=='object')return;if(m.error||m.fatal)emit({level:m.error?.code==='CANCELLED'?'info':'error',kind:'worker.error',worker:String(url),error:m.error??m.fatal,sequence:m.sequence??m.id});else if(m.progress)emit({level:'info',kind:'worker.progress',worker:String(url),progress:m.progress,sequence:m.sequence??m.id});else if(m.result!==undefined||m.done)emit({level:'info',kind:'worker.complete',worker:String(url),sequence:m.sequence??m.id,metrics:m.result?.metrics});});
    this.addEventListener('error',e=>emit(diagnosticWorkerFailure(e,String(target))));
   }
   terminate(...args){const value=super.terminate(...args),owner=workerFamilies.get(this);if(owner?.root){workerFamilies.delete(this);activeFamilies.delete(owner.familyId);emit({level:'info',kind:'dependency.owner-retired',familyId:owner.familyId,retirement:'worker-terminate-returned',diagnosticRetirementOnly:true,resourceAcknowledged:false});}return value;}
   postMessage(message,...rest){if(message?.method||message?.action)emit({level:'info',kind:'worker.request',dependencyOwnerFamily:workerFamilies.get(this)?.familyId,method:message.method??message.action,sequence:message.sequence??message.id,operation:message.args?.[0]?.operation,parameters:message.args?.[0]?.params});return super.postMessage(message,...rest);}
  };
 }
 if(windowContext&&navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',({data})=>{if(data?.type==='dependency-diagnostic'&&data.session===session)emit(data.event);});
 if(session){
  for(const method of ['log','info','warn','error','debug']){const original=console[method]?.bind(console);if(original)console[method]=(...args)=>{emit({level:method==='error'?'error':method==='warn'?'warning':'info',kind:'console',method,args});original(...args);};}
  globalThis.addEventListener?.('error',e=>emit({level:'error',kind:'uncaught',error:e.error??{message:e.message},sourceURL:diagnosticScriptURL(e.filename),line:e.lineno,column:e.colno}));
  globalThis.addEventListener?.('unhandledrejection',e=>emit({level:'error',kind:'unhandledrejection',error:e.reason}));
 }
 return api;
}
export const runtimeContext=globalThis[KEY]??=setup();
export const diagnostic=event=>runtimeContext.emit(event);
