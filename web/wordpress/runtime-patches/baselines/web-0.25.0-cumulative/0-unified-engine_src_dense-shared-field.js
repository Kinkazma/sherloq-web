import {sharedSegmentedReader} from './shared-segmented-reader.js';
import {createRebindableByteReader} from './rebindable-byte-reader.js';

const planes=['hist','norms','turns','diverse','bounds','boundSamples'];
const attributes=['kind','width','height','patch','offset','viewWidth','viewHeight','mirror','quarter','weights'];
export function portableDenseInputStagingBytes(input){
 const stores=new Set(),add=value=>{if(value)stores.add(value);},descriptor=value=>{if(value?.kind==='compact-sift')for(const name of planes)add(value[name]);else add(value);};
 descriptor(input.first);descriptor(input.second??input.first);add(input.mask);for(const axis of input.axes??[])add(axis);let bytes=0;for(const store of stores)bytes+=2*Math.min(64*1024,store.byteLength);return bytes;
}

// Export immutable existing banks; never manufacture a second full copy just
// to start another worker. A failed export releases all pins acquired so far.
export function exportSharedDenseInput(input){
 const pins=[],ids=new Map(),stores=[];
 const store=value=>{if(value==null)return null;if(ids.has(value))return ids.get(value);const pin=value.exportSharedReadOnly?.();if(!pin)throw Error('Dense plane is not shared.');const id=stores.length;ids.set(value,id);stores.push(pin.descriptor);pins.push(pin);return id;};
 const descriptor=value=>{if(value.kind!=='compact-sift')return {store:store(value)};const result=Object.fromEntries(attributes.map(key=>[key,value[key]]));for(const key of planes)result[key]=store(value[key]);return result;};
 try{const first=descriptor(input.first),second=input.second&&input.second!==input.first?descriptor(input.second):first,mask=store(input.mask);return {value:{first,second,mask,stores,width:input.width,height:input.height,dimensions:input.dimensions,axes:input.axes},release(){for(const pin of pins)pin.release();pins.length=0;stores.length=0;ids.clear();}};}
 catch{for(const pin of pins)pin.release();return null;}
}

export function readSharedDenseInput(value){
 const stores=value.stores.map(sharedSegmentedReader);
 const descriptor=d=>{if(d.kind!=='compact-sift')return stores[d.store];const out={...d};for(const key of planes)out[key]=d[key]===null?undefined:stores[d[key]];return out;};
 return {first:descriptor(value.first),second:value.second===value.first?descriptor(value.first):descriptor(value.second),mask:stores[value.mask],width:value.width,height:value.height,dimensions:value.dimensions,axes:value.axes};
}

// Portable immutable publication also covers OPFS and IndexedDB. Workers keep
// their own handles or a batched broker channel; paging no longer forces the
// whole hypothesis onto the coordinator's JavaScript event loop.
export async function exportPortableDenseInput(input,{budget,signal,forceBroker=false,cache,control,immediateControl=false}={}){
 const {exportByteStore}=await import('./portable-byte-store.js'),pins=[],ids=new Map(),stores=[],transfer=[],transports=[];
 let released=false;
 const store=async value=>{
  if(value==null)return null;if(ids.has(value))return ids.get(value);
  const id=stores.length;ids.set(value,id);stores.push(null);pins.push(null);let ready;const initialized=new Promise(resolve=>{ready=resolve;});
  const publish=async()=>{const pin=await exportByteStore(value,{budget,signal,forceBroker,revocable:control?consumer:undefined});pins[id]=pin;stores[id]={...pin.descriptor,cacheStoreId:cache?.storeId(value)};transports[id]=pin.descriptor.kind;return pin;};
  const consumer={
   immediateQuiescence:immediateControl,
   async quiesce({immediate=false}={}){await initialized;if(released||!pins[id])return true;try{if(await control({action:'detach',id,immediate})===false)return false;}catch(error){if(released)return true;throw error;}if(released)return true;await pins[id]?.release();pins[id]=null;stores[id]=null;return true;},
   async resume(){if(released||pins[id])return;const pin=await publish();if(released){await pin.release();pins[id]=null;stores[id]=null;return;}await control({action:'attach',id,descriptor:stores[id]},pin.transfer);if(stores[id]?.kind!=='shared')connection?.activate?.();},
  };
  try{const pin=await publish();transfer.push(...pin.transfer);return id;}finally{ready();}
 };
 const descriptor=async value=>{if(value.kind!=='compact-sift')return {store:await store(value)};const result=Object.fromEntries(attributes.map(key=>[key,value[key]]));for(const key of planes)result[key]=await store(value[key]);return result;};
 let connection;
 try{const first=await descriptor(input.first),second=input.second&&input.second!==input.first?await descriptor(input.second):first,mask=await store(input.mask),axes=input.axes?await Promise.all(input.axes.map(store)):null;
  if(cache){connection=cache.connect({dormant:stores.every(value=>value.kind==='shared'||value.segments)});transfer.push(...connection.transfer);}
  return {value:{first,second,mask,stores,width:input.width,height:input.height,dimensions:input.dimensions,axes,cache:connection?.descriptor},transfer,get transports(){return transports.slice();},async release(){if(released)return;released=true;connection?.release();await Promise.allSettled(pins.map(pin=>pin?.release()));pins.length=0;stores.length=0;ids.clear();}};
 }catch(error){released=true;connection?.release();await Promise.allSettled(pins.map(pin=>pin?.release()));throw error;}
}
export async function readPortableDenseInput(value,{budget}={}){
 const {readByteStore}=await import('./portable-byte-store.js'),{createSharedReadCacheClient}=await import('./shared-read-cache.js'),stores=[],cache=createSharedReadCacheClient(value.cache);
 const read=async item=>{const reader=await readByteStore(item,{budget});return cache&&reader.storage!=='memory'?cache.wrap(item.cacheStoreId,reader):reader;};
 try{for(let id=0;id<value.stores.length;id++){stores.push(createRebindableByteReader(await read(value.stores[id]),id));value.stores[id]=null;}
  const descriptor=d=>{if(d.kind!=='compact-sift')return stores[d.store];const out={...d};for(const key of planes)out[key]=d[key]===null?undefined:stores[d[key]];return out;};
  let disposed=false;return {first:descriptor(value.first),second:value.second===value.first?descriptor(value.first):descriptor(value.second),mask:stores[value.mask],width:value.width,height:value.height,dimensions:value.dimensions,axes:value.axes?.map(id=>stores[id]),readCache:cache,
   async detach(ids){await Promise.all(ids.map(id=>stores[id]?.detach()));},
   async attach(entries){for(const {id,descriptor} of entries){const reader=await read(descriptor);if(disposed)await reader.dispose();else stores[id].attach(reader);}},
   async dispose(){if(disposed)return;disposed=true;await cache?.dispose();await Promise.allSettled(stores.map(store=>store.dispose()));}};
 }catch(error){await cache?.dispose();await Promise.allSettled(stores.map(store=>store.dispose()));throw error;}
}
