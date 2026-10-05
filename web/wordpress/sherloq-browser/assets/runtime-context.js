import {resourceFetch} from './resilient-resource.js';
// One diagnostic channel per open workspace. No image bytes, cookies or network logging.
const KEY=Symbol.for('sherloq.runtime.context');
export function diagnosticValue(value,depth=0,seen=new WeakSet()){
 if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='bigint')return String(value);
 if(typeof value==='string')return value.replace(/(?:blob:|data:)[^\s"']+/g,'[local resource]').replace(/([?&](?:token|nonce|key|signature|email|fonts|home)=)[^&\s"']*/gi,'$1[redacted]').slice(0,16000);
 if(typeof value!=='object')return String(value);
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer||typeof Blob!=='undefined'&&value instanceof Blob)return {type:value.constructor.name,byteLength:value.byteLength??value.size,omitted:'binary'};
 if(depth>10)return '[depth limit]';if(seen.has(value))return '[circular]';seen.add(value);
 if(value instanceof Error)return diagnosticValue({name:value.name,code:value.code,message:value.message,stack:value.stack,details:value.details,cause:value.cause},depth+1,seen);
 if(Array.isArray(value))return value.length>128?{type:'array',length:value.length,omitted:'bulk values'}:value.map(v=>diagnosticValue(v,depth+1,seen));
 const out={};for(const [k,v]of Object.entries(value)){
  if(/^(?:pixels|rgb|rgba|bytes|buffer|data|blob|file|filename|originalBlob|imageData|tensor|weights|token|nonce|password|authorization|email)$/i.test(k)){out[k]='[omitted]';continue;}
  out[k]=diagnosticValue(v,depth+1,seen);
 }return out;
}
function setup(){
 const browser=typeof location!=='undefined'&&/^https?:$/.test(location.protocol);if(!browser)return {session:null,emit(){},retry(){return Promise.reject(Error('No interactive workspace'));}};
 const windowContext=typeof document!=='undefined';
 const session=windowContext?crypto.randomUUID():new URL(location.href).searchParams.get('sherloqSession');
 if(windowContext){const u=new URL(location.href);u.searchParams.set('sherloqSession',session);history.replaceState(history.state,'',u);}
 const context=crypto.randomUUID(),listeners=new Set(),retryWaiters=new Map();let sequence=0;
 const channel=session&&typeof BroadcastChannel==='function'?new BroadcastChannel('sherloq-session-'+session):null;
 const emit=entry=>{if(!session)return;const event={time:new Date().toISOString(),context,sequence:++sequence,...diagnosticValue(entry)};if(windowContext)for(const listener of listeners)try{listener(event);}catch{}else channel?.postMessage({type:'log',event});};
 channel?.addEventListener('message',({data})=>{if(data?.type==='log'&&windowContext){for(const listener of listeners)try{listener(data.event);}catch{}}if(data?.type==='retry'){const list=retryWaiters.get(data.key);retryWaiters.delete(data.key);for(const resolve of list||[])resolve();}});
 function retry(key,error,signal){
  if(!session||!channel)throw error;
  emit({level:'error',kind:'dependency.wait',key,error});
  return new Promise((resolve,reject)=>{const list=retryWaiters.get(key)||[];const done=()=>{signal?.removeEventListener('abort',cancel);resolve();};const cancel=()=>{const pending=retryWaiters.get(key)||[];const index=pending.indexOf(done);if(index>=0)pending.splice(index,1);if(!pending.length)retryWaiters.delete(key);emit({level:'info',kind:'dependency.cancelled',key});reject(signal.reason);};if(signal?.aborted){cancel();return;}list.push(done);retryWaiters.set(key,list);signal?.addEventListener('abort',cancel,{once:true});});
 }
 const api={session,context,emit,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},retry,resume(key){emit({level:'info',kind:'dependency.retry',key});channel?.postMessage({type:'retry',key});if(windowContext)navigator.serviceWorker?.controller?.postMessage({type:'dependency-retry',key});const list=retryWaiters.get(key);retryWaiters.delete(key);for(const resolve of list||[])resolve();}};
 if(session&&typeof fetch==='function'){
  const nativeFetch=globalThis.fetch.bind(globalThis),resilient=resourceFetch(nativeFetch,{emit,wait:retry});
  const root=new URL('./',import.meta.url);
  globalThis.fetch=(input,init)=>{let url;try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return nativeFetch(input,init);}
   const local=url.origin===root.origin&&url.pathname.startsWith(root.pathname),relative=local?url.pathname.slice(root.pathname.length):'';
   return local&&/^(?:engine|energy-engine|composite-engine|composite-assets|unified-engine|unified-assets|individual-assets)\//.test(relative)&&(init?.method??(input instanceof Request?input.method:'GET'))==='GET'?resilient(input,init):nativeFetch(input,init);
  };
 }
 if(typeof Worker==='function'){
  const NativeWorker=globalThis.Worker;
  globalThis.Worker=class extends NativeWorker{
   constructor(url,options){let target=url;try{const u=new URL(url,location.href);if(session&&u.origin===location.origin&&/^https?:$/.test(u.protocol)){u.searchParams.set('sherloqSession',session);target=u;}}catch{}super(target,options);
    this.addEventListener('message',({data:m})=>{if(!m||typeof m!=='object')return;if(m.error||m.fatal)emit({level:m.error?.code==='CANCELLED'?'info':'error',kind:'worker.error',worker:String(url),error:m.error??m.fatal,sequence:m.sequence??m.id});else if(m.progress)emit({level:'info',kind:'worker.progress',worker:String(url),progress:m.progress,sequence:m.sequence??m.id});else if(m.result!==undefined||m.done)emit({level:'info',kind:'worker.complete',worker:String(url),sequence:m.sequence??m.id,metrics:m.result?.metrics});});
    this.addEventListener('error',e=>emit({level:'error',kind:'worker.failure',worker:String(url),error:{message:e.message,filename:e.filename,line:e.lineno}}));
   }
   postMessage(message,...rest){if(message?.method||message?.action)emit({level:'info',kind:'worker.request',method:message.method??message.action,sequence:message.sequence??message.id,operation:message.args?.[0]?.operation,parameters:message.args?.[0]?.params});return super.postMessage(message,...rest);}
  };
 }
 if(windowContext&&navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',({data})=>{if(data?.type==='dependency-diagnostic'&&data.session===session)emit(data.event);});
 if(session){
  for(const method of ['log','info','warn','error','debug']){const original=console[method]?.bind(console);if(original)console[method]=(...args)=>{emit({level:method==='error'?'error':method==='warn'?'warning':'info',kind:'console',method,args});original(...args);};}
  globalThis.addEventListener?.('error',e=>emit({level:'error',kind:'uncaught',error:e.error??{message:e.message}}));
  globalThis.addEventListener?.('unhandledrejection',e=>emit({level:'error',kind:'unhandledrejection',error:e.reason}));
 }
 return api;
}
export const runtimeContext=globalThis[KEY]??=setup();
export const diagnostic=event=>runtimeContext.emit(event);
