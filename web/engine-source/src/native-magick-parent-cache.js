// The qualified Core cache store stays in Original's actual shared budget.
// This is codec-private I/O, not a second source/window reader API.
import {createPixelCacheStoreOwner}from'./native-magick-cache-store.js';
import {requireValue}from'./errors.js';
import {createSegmentedBytes}from'./segmented-bytes.js';
const ack=async fn=>{const v=await fn();if(v===0||v===false)throw v;return v;};
const checkedOwner=owner=>new Proxy(Object.create(null),{get(_t,key){if(key==='dispose')return()=>ack(()=>owner.dispose());const v=Reflect.get(owner,key,owner);return typeof v==='function'?v.bind(owner):v;}});
const checkedSession=session=>session&&new Proxy(Object.create(null),{get(_t,key){if(key==='create')return async(...a)=>checkedOwner(await session.create(...a));const v=Reflect.get(session,key,session);return typeof v==='function'?v.bind(session):v;}});
export function createParentCacheBridge({budget,maximumResidentBytes,maximumLogicalBytes,maximumTransferBytes,
 temporarySession,getTemporarySession}){
 const owner=createPixelCacheStoreOwner({budget,maximumResidentBytes,maximumLogicalBytes,temporarySession:checkedSession(temporarySession),
  ...(getTemporarySession?{getTemporarySession:async(...a)=>checkedSession(await getTemporarySession(...a))}:{}),
  createStore:async(...a)=>checkedOwner(await createSegmentedBytes(...a))});
 const files=new Map();let closed=false;
 const file=(id,create=false)=>{requireValue(Number.isSafeInteger(id)&&id>0,'Invalid private Core cache file id.');let f=files.get(id);if(!f&&create){f=owner.createFile();files.set(id,f);}requireValue(f,'Unknown private Core cache file.');return f;};
 return{
  async request(action,value){
   requireValue(!closed,'The private Core cache is retired.');
   if(action==='cache-grow'){await file(value.id,true).ensureLength(value.bytes);return{byteLength:value.bytes};}
   if(action==='cache-retire'){const f=files.get(value.id);if(f){await owner.retire(f);files.delete(value.id);}return{retired:true};}
   if(action==='cache-flush'){await file(value.id).flush();return{flushed:true};}
   requireValue(Number.isSafeInteger(value.offset)&&value.offset>=0&&Number.isSafeInteger(value.length)
    &&value.length>=0&&value.length<=maximumTransferBytes,'Private cache transfer exceeds its funded window.');
   if(action==='cache-read'){
    const bytes=new Uint8Array(value.length),count=await file(value.id).readInto(bytes,value.offset);
    return{cacheBytes:bytes,count};
   }
   requireValue(action==='cache-write'&&value.bytes instanceof Uint8Array&&value.bytes.byteLength===value.length,'Unexpected private Core cache operation.');
   const count=await file(value.id).write(value.bytes,value.offset);return{count};
  },
  metrics:()=>owner.metrics(),
  async dispose(){await ack(()=>owner.dispose());files.clear();closed=true;},
 };
}
