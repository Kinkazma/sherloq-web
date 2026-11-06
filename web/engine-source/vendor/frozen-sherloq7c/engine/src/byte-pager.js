import {EngineError,requireValue,checkAbort} from './errors.js';

// Bounded mutable pages over a segmented byte store. prepare() is synchronous
// on cache hits; numeric inner loops do not await a Promise for every pixel.
export function createBytePager(store,{budget,pageBytes=65536,maxPages=64,mutable=false,signal}={}){
 requireValue(Number.isSafeInteger(store?.byteLength)&&store.byteLength>0&&Number.isSafeInteger(pageBytes)&&pageBytes>=4&&pageBytes%4===0&&Number.isInteger(maxPages)&&maxPages>0,'Invalid paged store.');
 const capacity=Math.min(maxPages,Math.ceil(store.byteLength/pageBytes)),release=budget.reserve(Math.min(store.byteLength,pageBytes*capacity)+pageBytes),pages=new Map();let closed=false,pending=false,hotFirst=-1,hotLast=-1;
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Byte pager disposed.');};
 const entry=offset=>{alive();const page=pages.get(Math.floor(offset/pageBytes));if(!page||offset<0||offset>=store.byteLength)throw new EngineError('INVALID_INPUT','Prepare the page before numeric access.');return page;};
 async function write(page,index){if(page.dirty){checkAbort(signal);await store.write(page.bytes,index*pageBytes);page.dirty=false;}}
 return {
  prepare(offset,length){
   alive();checkAbort(signal);if(pending)throw new EngineError('BUSY','Byte pager has pending I/O.');requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>0&&offset<=store.byteLength-length,'Invalid paged range.');
   const first=Math.floor(offset/pageBytes),last=Math.floor((offset+length-1)/pageBytes);if(first>=hotFirst&&last<=hotLast)return;
   if(last-first+1>capacity)throw new EngineError('MEMORY_LIMIT','Requested window exceeds the bounded page cache.');let missing=false;
   for(let index=first;index<=last;index++){const page=pages.get(index);if(!page)missing=true;else{pages.delete(index);pages.set(index,page);}}
   if(!missing){hotFirst=first;hotLast=last;return;}
   pending=true;hotFirst=hotLast=-1;
   return (async()=>{
    for(let index=first;index<=last;index++){
     checkAbort(signal);if(pages.has(index))continue;
     if(pages.size>=capacity){let evicted=false;for(const [key,page]of pages)if(key<first||key>last){await write(page,key);pages.delete(key);evicted=true;break;}if(!evicted)throw new EngineError('MEMORY_LIMIT','All cached pages belong to the current window.');}
     const bytes=new Uint8Array(Math.min(pageBytes,store.byteLength-index*pageBytes));await store.readInto(bytes,index*pageBytes);checkAbort(signal);pages.set(index,{bytes,view:new DataView(bytes.buffer),dirty:false});
    }
    hotFirst=first;hotLast=last;
   })().finally(()=>{pending=false;});
  },
  get8(offset){return entry(offset).bytes[offset%pageBytes];},
  span(offset,length,{write=false}={}){requireValue(Number.isInteger(length)&&length>0&&offset%pageBytes+length<=pageBytes&&offset+length<=store.byteLength&&(!write||mutable),'Invalid paged span.');const page=entry(offset);if(write)page.dirty=true;return page.bytes.subarray(offset%pageBytes,offset%pageBytes+length);},
  set8(offset,value){requireValue(mutable,'Read-only byte pager.');const page=entry(offset);page.bytes[offset%pageBytes]=value;page.dirty=true;},
  getFloat32(offset){requireValue(offset%4===0,'Unaligned paged float32.');return entry(offset).view.getFloat32(offset%pageBytes,true);},
  get32(offset){requireValue(offset%4===0,'Unaligned paged uint32.');return entry(offset).view.getUint32(offset%pageBytes,true);},
  set32(offset,value){requireValue(mutable&&offset%4===0,'Read-only or unaligned paged uint32.');const page=entry(offset);page.view.setUint32(offset%pageBytes,value,true);page.dirty=true;},
  async flush(){alive();if(pending)throw new EngineError('BUSY','Byte pager has pending I/O.');pending=true;try{for(const [index,page]of pages)await write(page,index);await store.flush();}finally{pending=false;}},
  dispose(){if(pending)throw new EngineError('BUSY','Byte pager has pending I/O.');if(closed)return;closed=true;pages.clear();release();},
  get retainedBytes(){return Math.min(store.byteLength,pageBytes*capacity)+pageBytes;}
 };
}
