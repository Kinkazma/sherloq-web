import {EngineError,checkAbort} from './errors.js';
export async function verifyM3Bytes(data,identity,signal){
 checkAbort(signal);if(!(data instanceof Uint8Array)||data.length!==identity.bytes)throw new EngineError('ASSET_INTEGRITY','Learned asset size mismatch.');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');checkAbort(signal);
 if(sha!==identity.sha256)throw new EngineError('ASSET_INTEGRITY','Learned asset identity mismatch.');return data;
}
export async function fetchM3Asset(url,identity,signal){
 const response=await fetch(url,{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Learned runtime could not load.');
 const reader=response.body.getReader(),data=new Uint8Array(identity.bytes);let size=0;
 try{for(;;){checkAbort(signal);const {done,value}=await reader.read();if(done)break;if(size+value.length>data.length)throw new EngineError('ASSET_INTEGRITY','Learned runtime exceeds pinned size.');data.set(value,size);size+=value.length;}}finally{await reader.cancel();}
 if(size!==data.length)throw new EngineError('ASSET_INTEGRITY','Learned runtime is incomplete.');return verifyM3Bytes(data,identity,signal);
}
