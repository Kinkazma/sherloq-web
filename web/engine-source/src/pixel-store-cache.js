import {createSegmentedBytes} from './segmented-bytes.js';
// One private temporary cache per pixel family, outside the synchronous RAM LRU.
// Published results always have their own storage; source disposal owns caches.
export async function createPixelStoreCache(image,family,key,byteLength,metadata,{budget,signal}){
 const store=await createSegmentedBytes(byteLength,{budget,signal,storage:'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession});let published=false;
 const record={key,byteLength:0,storedBytes:byteLength,value:{...metadata,byteLength,write:(bytes,offset)=>store.write(bytes,offset),read:(bytes,offset)=>store.readInto(bytes,offset),store},dispose:()=>store.dispose()};
 return {record,async publish(){await store.flush();const previous=image.pixelStoreCaches?.get(family);(image.pixelStoreCaches??=new Map()).set(family,record);published=true;await previous?.dispose();},async cleanup(){if(!published)await record.dispose();}};
}
export async function disposePixelStoreCaches(image){await Promise.all([...(image.pixelStoreCaches?.values()??[])].map(r=>r.dispose()));image.pixelStoreCaches?.clear();}
