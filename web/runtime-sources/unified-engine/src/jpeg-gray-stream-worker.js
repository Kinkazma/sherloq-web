import {byteLength,byteView} from './memory-range.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError,deserializeEngineError} from './errors.js';
import {createGrayStreamKernel} from './jpeg-gray-stream-kernel.js';
let serial=0;const waiting=new Map();
function io(kind,payload,transfer=[]){const id=++serial;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});try{protocol.post({io:kind,id,...payload},transfer);}catch(error){waiting.delete(id);reject(error);}});}
const kernel=createGrayStreamKernel({writeEncoded:async view=>{const bytes=byteView(view).slice();await io('write',{bytes},[bytes.buffer]);},readEncoded:async target=>{const bytes=await io('read',{length:byteLength(target)});byteView(target,0,bytes.length).set(bytes);return bytes.length;}});
const protocol=installWorkerMessageProtocol(self,async data=>{
 if(data.ioReply){const job=waiting.get(data.id);if(job){waiting.delete(data.id);data.error?job.reject(deserializeEngineError(data.error)):job.resolve(data.bytes);}return;}
 try{protocol.post({result:await kernel.execute(data)});}catch(error){if(!protocol.failed)protocol.post({error:serializeEngineError(error,'WORKER_FAILED')});}
},{label:'jpeg-gray-stream-worker.js',onFailure(error){for(const job of waiting.values())job.reject(error);waiting.clear();self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}});
