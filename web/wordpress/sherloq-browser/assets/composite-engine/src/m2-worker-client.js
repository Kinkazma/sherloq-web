import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort} from './errors.js';
/** Lazy result windows. Configuration contains URLs/data, never callbacks. */
export async function createM2WorkerClient(config,{workerFactory=url=>new Worker(url,{type:'module'})}={}){
 const worker=workerFactory(new URL('./m2-worker.js',import.meta.url)),pending=new Map();let next=1,disposed=false,disposing;
 const rejectAll=error=>{for(const p of pending.values()){p.cleanup();p.reject(error);}pending.clear();};
 worker.onerror=()=>{disposed=true;worker.terminate();rejectAll(new EngineError('WORKER_FAILED','M2 worker failed.'));};
 worker.onmessage=({data})=>{
  const p=pending.get(data.id);if(!p)return;
  if(data.progress){try{p.onProgress?.(data.progress);}catch(error){p.callbackError=error;worker.postMessage({id:next++,operation:'cancel',args:{requestId:data.id}});}return;}
  pending.delete(data.id);p.cleanup();if(p.callbackError){if(data.value?.id&&['analyze','analyzeBlob','beginExport'].includes(p.operation))worker.postMessage({id:next++,operation:p.operation!=='beginExport'?'releaseResult':'releaseExport',args:p.operation!=='beginExport'?{resultId:data.value.id}:{exportId:data.value.id}});p.reject(p.callbackError);}else if(data.error)p.reject(new EngineError(data.error.code,data.error.message));else p.resolve(data.value);
 };
 function request(operation,args={},options={}){
  if(disposed)return Promise.reject(new EngineError('DISPOSED','M2 worker client disposed.'));
  try{checkAbort(options.signal);}catch(e){return Promise.reject(e);}
  const id=next++;
  return new Promise((resolve,reject)=>{
   const abort=()=>{const p=pending.get(id);if(p)p.callbackError=new EngineError('CANCELLED','M2 analysis cancelled.');worker.postMessage({id:next++,operation:'cancel',args:{requestId:id}});},cleanup=()=>options.signal?.removeEventListener('abort',abort);
   pending.set(id,{operation,resolve,reject,cleanup,onProgress:options.onProgress});options.signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({id,operation,args},options.transfer??[]);}catch(e){pending.delete(id);cleanup();reject(e);}
  });
 }
 let ready;try{ready=await request('initialize',config);}catch(e){worker.terminate();throw e;}
 return {
  ready,
  analyze(method,image,params={},options={}){return request('analyze',{method,image,params,backend:options.backend??'auto'},{...options,transfer:options.transferSource?[image.data.buffer]:[]});},
  analyzeBlob(method,blob,params={},options={}){return request('analyzeBlob',{method,blob,params,backend:options.backend??'auto'},options);},
  readArray(resultId,field,offset,count){return request('readArray',{resultId,field,offset,count});},
  async metadata(result){const chunks=[];for(let offset=0;offset<result.metadataBytes;offset+=ready.windowBytes)chunks.push(await request('readMetadata',{resultId:result.id,offset,count:Math.min(ready.windowBytes,result.metadataBytes-offset)}));const data=new Uint8Array(result.metadataBytes);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(data));},
  render(resultId,view,options={}){return request('render',{resultId,view,options});},
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
  dispose(){if(disposing)return disposing;if(disposed)return Promise.resolve();const cleaned=request('dispose');disposed=true;disposing=cleaned.finally(()=>{worker.terminate();rejectAll(new EngineError('CANCELLED','M2 worker disposed.'));});return disposing;}
 };
}
