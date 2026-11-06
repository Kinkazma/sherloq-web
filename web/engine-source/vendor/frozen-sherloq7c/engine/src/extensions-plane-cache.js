import {createSegmentedBytes} from './segmented-bytes.js';
import {extensionPlanes} from './extensions-result-surfaces.js';
import {checkAbort,controlCheckpoint,requireValue} from './errors.js';
const CHUNK=4*1024**2;

/** Lossless developer-independent browser storage. The cache owns one share;
 * every published surface owns another. No original tensor is retained. */
export async function persistExtensionResult(result,geometry,{budget,scheduler,getTemporarySession,signal,onProgress,metadata}={}){
 const inputs=extensionPlanes(result,geometry),planes=[];let admission;
 try{
  if(inputs.length)admission=await scheduler.acquire({cpu:1,signal,resourceOwner:'extensions/paged-results',label:'extensions-persist-result'});
  const total=inputs.reduce((n,p)=>n+p.data.byteLength,0);let copied=0;
  for(const input of inputs){
   checkAbort(signal);let store;
   try{
    store=await createSegmentedBytes(input.data.byteLength,{budget,storage:'temporary',getTemporarySession,signal,owner:'extensions/paged-results',label:'extensions-'+input.key});
    let low=Infinity,high=-Infinity;
    for(let offset=0;offset<input.data.byteLength;offset+=CHUNK){
     await controlCheckpoint(signal);const length=Math.min(CHUNK,input.data.byteLength-offset),bytes=new Uint8Array(input.data.buffer,input.data.byteOffset+offset,length);
     if(!input.range){const first=offset/input.data.BYTES_PER_ELEMENT,end=(offset+length)/input.data.BYTES_PER_ELEMENT;for(let i=first;i<end;i++){const value=input.data[i];if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}}}
     await store.write(bytes,offset);copied+=length;onProgress?.({phase:'persist-extension-result',method:result.method,plane:input.key,fraction:total?copied/total:1,bytes:copied,totalBytes:total});
    }
    await store.flush();checkAbort(signal);
    const{data,...descriptor}=input;planes.push({...descriptor,store,count:data.length,elementBytes:data.BYTES_PER_ELEMENT,byteLength:data.byteLength,range:input.range??(Number.isFinite(low)?[low,high]:[0,1])});store=null;
   }finally{await store?.dispose();}
  }
  let references=1,closed=false;const data=structuredClone(metadata),metrics=structuredClone(result.metrics??{});
  const release=async()=>{if(closed)return;requireValue(references>0,'Extension cache ownership mismatch.');if(--references)return;closed=true;await Promise.all(planes.map(p=>p.store.dispose()));};
  return{method:result.method,data,metrics,planes,byteLength:planes.reduce((n,p)=>n+p.byteLength,0),storage:planes.length?'temporary':'metadata',
   retain(){requireValue(!closed,'Paged extension cache disposed.');references++;let released=false;return()=>{if(released)return;released=true;return release();};},release};
 }catch(error){await Promise.allSettled(planes.map(p=>p.store.dispose()));throw error;}
 finally{admission?.release();}
}
