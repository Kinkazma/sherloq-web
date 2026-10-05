import "../../runtime-context.js?v=0.14.5";
import {createGrayStreamKernel} from './jpeg-gray-stream-kernel.js';
let serial=0;const waiting=new Map();
function io(kind,payload,transfer=[]){const id=++serial;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});self.postMessage({io:kind,id,...payload},transfer);});}
const kernel=createGrayStreamKernel({writeEncoded:async view=>{const bytes=view.slice();await io('write',{bytes},[bytes.buffer]);},readEncoded:async target=>{const bytes=await io('read',{length:target.length});target.set(bytes);return bytes.length;}});
self.onmessage=async({data})=>{
 if(data.ioReply){const job=waiting.get(data.id);if(job){waiting.delete(data.id);data.error?job.reject(Object.assign(Error(data.error.message),{code:data.error.code})):job.resolve(data.bytes);}return;}
 try{self.postMessage({result:await kernel.execute(data)});}catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}
};
