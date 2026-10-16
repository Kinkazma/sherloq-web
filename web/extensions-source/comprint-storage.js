/** OPFS handles live in a dedicated worker; this is lossless local storage. */
export async function createComprintTemporarySession({budget}={}){
 const release=budget?.reserve(16*1024**2),pending=new Map();let next=1,disposed=false,terminalError,worker,disposal;
 try{worker=new Worker(new URL('./comprint-storage-worker.js',import.meta.url),{type:'module'});}catch(error){release?.();throw error;}
 const call=(operation,fields={},transfer=[])=>{
  if(terminalError||disposed)return Promise.reject(terminalError??new Error('Comprint storage disposed'));
  return new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});try{worker.postMessage({id,operation,...fields},transfer);}catch(error){pending.delete(id);reject(error);}});
 };
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);if(data.error)p.reject(Object.assign(new Error(data.error.message),data.error));else p.resolve(data.result);};
 const failed=e=>{terminalError=Object.assign(new Error(e.message??'Comprint storage worker failed'),{code:'STORAGE_IO'});for(const p of pending.values())p.reject(terminalError);pending.clear();};worker.onerror=failed;worker.onmessageerror=failed;
 try{
  const initialized=await call('init');
  return {backend:initialized.backend,async create(byteLength){const {key}=await call('create',{bytes:byteLength});let removed=false;return {byteLength,
   async write(source,offset=0){const bytes=new Uint8Array(source.buffer,source.byteOffset,source.byteLength).slice();await call('write',{key,offset,bytes},[bytes.buffer]);},
   async readInto(target,offset=0){const {bytes}=await call('read',{key,offset,length:target.byteLength});new Uint8Array(target.buffer,target.byteOffset,target.byteLength).set(bytes);return target;},
   flush:()=>call('flush',{key}),async dispose(){if(removed||disposed)return;removed=true;await call('remove',{key});}};},
   dispose(){if(disposal)return disposal;disposal=(async()=>{try{await call('dispose');}finally{disposed=true;for(const p of pending.values())p.reject(terminalError??new DOMException('Comprint storage disposed','AbortError'));pending.clear();worker.terminate();release?.();}})();return disposal;}
  };
 }catch(e){worker.terminate();release?.();throw e;}
}
