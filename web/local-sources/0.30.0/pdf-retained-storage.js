import {installWorkerMessageProtocol,workerMessageFailure} from './unified-engine/src/worker-message-protocol.js';
const cancelled=()=>Object.assign(Error('PDF retained storage closed.'),{code:'CANCELLED'});
const envelope=()=>workerMessageFailure('pdf-retained-storage','message','invalid-response');
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function createPdfRetainedStorage({memoryBudgetBytes,workerFactory=url=>new Worker(url,{type:'module'})}={}){
 const worker=workerFactory(new URL('./pdf-retained-storage-worker.js?v=0.30.0',import.meta.url)),pending=new Map(),formats=new Map();let ticket=0,closed=false,closing,failure,retired=false;
 const retire=()=>{if(retired)return;retired=true;protocol.dispose();worker.onerror=null;worker.terminate();};
 function fail(error){if(failure)return;failure=error;for(const job of pending.values())job.reject(error);pending.clear();formats.clear();retire();}
 const protocol=installWorkerMessageProtocol(worker,data=>{
  if(!Number.isSafeInteger(data.ticket)||data.ticket<1||data.ticket>ticket)throw envelope();
  const job=pending.get(data.ticket);if(!job)return;
  if(data.error){if(!object(data.error)||typeof data.error.message!=='string')throw envelope();const error=Object.assign(Error(data.error.message),data.error);pending.delete(data.ticket);job.reject(error);if(job.action==='initialize')fail(error);return;}
  const result=data.result;if(!object(result))throw envelope();
  if(job.action==='read'||job.action==='sample'){
   const p=result.pixels,expected=job.action==='sample'?[job.value.width,job.value.height]:[job.value.rect.width,job.value.rect.height],format=formats.get(job.value.id),expectedFormat=job.action==='sample'&&format!=='rgb8'?'rgba8':format,channels={rgb8:3,rgba8:4,mask8:1}[p?.format];
   if(!format||!p||!channels||expectedFormat&&p.format!==expectedFormat||p.width!==expected[0]||p.height!==expected[1]||!(p.data instanceof Uint8Array)||p.data.length!==p.width*p.height*channels)throw envelope();
  }
  if(job.action==='create'&&(typeof result.storage!=='string'||!Number.isSafeInteger(result.bytes)||result.bytes<0))throw envelope();
  if(job.action==='write'&&typeof result.storage!=='string')throw envelope();
  if(job.action==='close'&&result.closed!==true)throw envelope();
  pending.delete(data.ticket);if(job.action==='create')formats.set(job.value.id,job.value.format);if(job.action==='dispose')formats.delete(job.value.id);job.resolve(result);
 },{label:'pdf-retained-storage',onFailure:fail});
 worker.onerror=event=>{event.preventDefault?.();fail(Object.assign(Error(event.message??'PDF retained storage worker failed.'),{code:'PDF_STORAGE_WORKER'}));};
 function send(action,value={},transfer=[]){if(closed||failure)return Promise.reject(failure??cancelled());const id=++ticket;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,action,value});try{protocol.post({ticket:id,action,...value},transfer);}catch(error){fail(error);}});}
 const initialized=send('initialize',{memoryBudgetBytes});initialized.catch(()=>{});
 return{memoryBudgetBytes,async create(id,width,height,blockSide,format='rgb8',blocks){await initialized;return send('create',{id,width,height,blockSide,format,blocks});},write(id,index,pixels){return send('write',{id,index,pixels},[pixels.data.buffer]);},read(id,rect){return send('read',{id,rect});},sample(id,rect,width,height){return send('sample',{id,rect,width,height});},dispose(id){return send('dispose',{id});},close(){return closing??=(async()=>{try{await initialized;return await send('close');}finally{closed=true;formats.clear();retire();for(const job of pending.values())job.reject(failure??cancelled());pending.clear();}})();}};
}
