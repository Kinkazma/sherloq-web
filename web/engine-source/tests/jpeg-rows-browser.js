import {removeTerminatedTemporarySession} from '../src/temporary-storage.js';
export async function jpegRowsBrowserTest(){
 const reference=await(await fetch('/.build/jpeg-12000x8000-reference.json')).json(),blob=await(await fetch('/.build/'+reference.file)).blob(),worker=new Worker(new URL('./jpeg-rows-worker.js',import.meta.url),{type:'module'});let id,backend;
 try{return await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>{if(data.sessionId){id=data.sessionId;backend=data.backend;}if(data.done){if(data.error)reject(Object.assign(Error(data.error.message),{code:data.error.code}));else resolve(data.result);}};worker.postMessage({blob,reference});});}
 finally{worker.terminate();if(id)await removeTerminatedTemporarySession(id,backend);}
}
