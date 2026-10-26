import "../../runtime-context.js?v=0.25.0";
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {EngineError,checkAbort} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
/** Lazy result windows. Configuration contains URLs/data, never callbacks. */
export async function createM2WorkerClient(config,{workerFactory=url=>new Worker(url,{type:'module'})}={}){
 const worker=workerFactory(new URL('./m2-worker.js',import.meta.url)),pending=new Map();let next=1,disposed=false,disposing,gracefulClosing=false,gracefulHostAcknowledged=false,gracefulHostValue,gracefulCompletion;
 const rejectAll=error=>{for(const p of pending.values()){p.cleanup();p.reject(error);}pending.clear();};
 const stop=error=>{disposed=true;protocol.dispose();worker.onerror=null;worker.terminate();rejectAll(error);};
 const callbackFailed=(id,p,error)=>{if(pending.get(id)!==p)return;p.callbackError??=error;protocol.post({id:next++,operation:'cancel',args:{requestId:id}});};
 const protocol=installWorkerMessageProtocol(worker,async data=>{
  if(data.fatal===true){if(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('m2-client','message','invalid-fatal-response');throw deserializeEngineError(data.error);}
  if(!Number.isSafeInteger(data.id)||data.id<=0)throw workerMessageFailure('m2-client','message','invalid-response-id');
  const p=pending.get(data.id);if(!p)return;
  if(data.progress!==undefined){
   if(!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw workerMessageFailure('m2-client','message','invalid-progress-response');
   try{const callback=p.onProgress?.(data.progress);if(callback&&typeof callback.then==='function'){const completed=Promise.resolve(callback).catch(error=>callbackFailed(data.id,p,error));p.callbacks.add(completed);completed.finally(()=>p.callbacks.delete(completed)).catch(protocol.fail);}}catch(error){callbackFailed(data.id,p,error);}return;
  }
  if(data.error!==undefined&&(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string'))throw workerMessageFailure('m2-client','message','invalid-error-response');
  if(data.error===undefined&&!Object.hasOwn(data,'value'))throw workerMessageFailure('m2-client','message','missing-result-response');
  if(p.callbacks.size)await Promise.all(p.callbacks);if(pending.get(data.id)!==p)return;
  pending.delete(data.id);p.cleanup();if(p.callbackError){try{if(data.value?.id&&['analyze','analyzeBlob','analyzeNativeSource','beginExport'].includes(p.operation))protocol.post({id:next++,operation:p.operation!=='beginExport'?'releaseResult':'releaseExport',args:p.operation!=='beginExport'?{resultId:data.value.id}:{exportId:data.value.id}});}finally{p.reject(p.callbackError);}}else if(data.error)p.reject(deserializeEngineError(data.error));else p.resolve(data.value);
 },{label:'m2-client',onFailure:stop});
 worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event?.message||'M2 worker failed.',{cause:event?.error,details:{workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}}));
 function request(operation,args={},options={}){
  if(disposed||gracefulClosing&&!['dispose','memory'].includes(operation))return Promise.reject(new EngineError('DISPOSED','M2 worker client disposed.'));
  try{checkAbort(options.signal);}catch(e){return Promise.reject(e);}
  const id=next++;
  return new Promise((resolve,reject)=>{
   const abort=()=>{const p=pending.get(id);if(p)try{callbackFailed(id,p,new EngineError('CANCELLED','M2 analysis cancelled.'));}catch(error){protocol.fail(error);}},cleanup=()=>options.signal?.removeEventListener('abort',abort);
   pending.set(id,{operation,resolve,reject,cleanup,onProgress:options.onProgress,callbacks:new Set()});options.signal?.addEventListener('abort',abort,{once:true});
   try{protocol.post({id,operation,args},options.transfer??[]);options.onPosted?.();}catch(e){pending.delete(id);cleanup();reject(e);}
  });
 }
 let ready;try{ready=await request('initialize',config);}catch(e){stop(e);throw e;}
 // Opt-in dependency retirement: a rejected host ACK must keep the Worker alive.
 function disposeGracefully(afterHostAcknowledged){
  if(disposing)return disposing;if(disposed)return Promise.resolve();gracefulClosing=true;
  if(afterHostAcknowledged)gracefulCompletion=afterHostAcknowledged;
  const task=(async()=>{if(!gracefulHostAcknowledged){gracefulHostValue=await request('dispose',{gracefulNativeSources:true});gracefulHostAcknowledged=true;}await gracefulCompletion?.();gracefulCompletion=undefined;stop(new EngineError('CANCELLED','M2 worker disposed.'));return gracefulHostValue;})();
  disposing=task.then(value=>value,error=>{disposing=undefined;throw error;});return disposing;
 }
 return {
  ready,disposeGracefully,
  reserveExternalMemory:args=>request('reserveExternalMemory',args),
  releaseExternalMemory:id=>request('releaseExternalMemory',{id}),
  analyze(method,image,params={},options={}){return request('analyze',{method,image,params,backend:options.backend??'auto'},{...options,transfer:options.transferSource?[image.data.buffer]:[]});},
  analyzeBlob(method,blob,params={},options={}){return request('analyzeBlob',{method,blob,params,backend:options.backend??'auto',...(options.expectedSourceSha256===undefined?{}:{expectedSourceSha256:options.expectedSourceSha256}),...(method==='composite'&&options.sourceRegionDomain?{sourceRegionDomain:options.sourceRegionDomain}:{})},options);},
  analyzeNativeSource(method,image,params={},options={}){return request('analyzeNativeSource',{method,image,params,backend:options.backend??'auto'},{...options,transfer:[image.port]});},
  readArray(resultId,field,offset,count){return request('readArray',{resultId,field,offset,count});},
  async metadata(result){const chunks=[];for(let offset=0;offset<result.metadataBytes;offset+=ready.windowBytes)chunks.push(await request('readMetadata',{resultId:result.id,offset,count:Math.min(ready.windowBytes,result.metadataBytes-offset)}));const data=new Uint8Array(result.metadataBytes);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(data));},
  render(resultId,view,options={}){return request('render',{resultId,view,options});},
  readDisplay(resultId,view,tile,options={}){return request('readDisplay',{resultId,view,tile,options});},
  renderWindow(resultId,view,rect,options={}){return request('render',{resultId,view,rect,options});},
  beginExport(resultId,options={}){return request('beginExport',{resultId},options);},
  readExport(exportId,offset,count){return request('readExport',{exportId,offset,count});},
  releaseExport(exportId){return request('releaseExport',{exportId});},
  async exportTo(resultId,writable,{signal}={}){
   checkAbort(signal);const output=await request('beginExport',{resultId},{signal});let writer;
   try{writer=writable.getWriter();for(let offset=0;offset<output.bytes;offset+=ready.windowBytes){checkAbort(signal);await writer.write(await request('readExport',{exportId:output.id,offset,count:Math.min(ready.windowBytes,output.bytes-offset)}));}await writer.close();return {mime:output.mime,bytes:output.bytes};}
   catch(e){try{await writer?.abort(e);}catch{}throw e;}finally{writer?.releaseLock();await request('releaseExport',{exportId:output.id});}
  },
  release(resultId){return request('releaseResult',{resultId});},clearCache(){return request('clearCache');},memory(){return request('memory');},
  dispose(){if(gracefulClosing)return disposeGracefully();if(disposing)return disposing;if(disposed)return Promise.resolve();const cleaned=request('dispose');disposed=true;disposing=cleaned.finally(()=>stop(new EngineError('CANCELLED','M2 worker disposed.')));return disposing;}
 };
}
