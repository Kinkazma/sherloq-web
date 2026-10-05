import create from '../vendor/dense-paged/dense-paged.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
import {wasmRange,closeMemoryRanges} from '../src/memory-range.js';

// Exercise the shipped Asyncify allocator, not a manually detached substitute.
// Filling the remaining small heap before the first useful I/O makes its real
// unwind-stack malloc grow the heap after page_io_start has returned.
export async function nativeRangeFixture({wasmBinary,fillHeap=false,renewable=true}={}){
 const memory=new WebAssembly.Memory({initial:128,maximum:16384}),grow=memory.grow.bind(memory),growth=[];let pending=false,filled=false;
 memory.grow=pages=>{growth.push({pages,pending,from:memory.buffer.byteLength,stack:new Error().stack});return grow(pages);};
 const m=await create({wasmMemory:memory,...(wasmBinary?{wasmBinary}:{})}),n=64,banks=[new Uint8Array(n*48),new Uint8Array(n*48),new Uint8Array(n).fill(3),new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(n*4)],pins=[],readers=[],owned=[];
 for(let i=0;i<n*12;i++){new Float32Array(banks[0].buffer)[i]=(i%31)/32;new Float32Array(banks[1].buffer)[i]=(i%29)/32;}
 try{
  for(const bank of banks){const store={byteLength:bank.length,readInto(target,offset=0){target.set(bank.subarray(offset,offset+target.length));},write(source,offset=0){bank.set(source,offset);},flush(){}};const pin=await exportByteStore(store,{writable:true,forceBroker:true});pins.push(pin);readers.push(await readByteStore(pin.descriptor));}
  m.pageIO=(id,offset,length,pointer,write)=>{
   if(fillHeap&&!filled){filled=true;const limit=m.HEAPU8.length-128*1024;let p;do{p=m._malloc(65536);if(!p)throw Error('Fixture filler refused');owned.push(p);}while(p+65536<limit);}
   const bytes=renewable?wasmRange(m,pointer,length):m.HEAPU8.subarray(pointer,pointer+length);pending=true;
   return (write?readers[id].write(bytes,offset):readers[id].readInto(bytes,offset)).finally(()=>{pending=false;});
  };
  m.checkpoint=()=>{};const count=m._malloc(8),error=m._malloc(1024);owned.push(count,error);const values=[8,8,12,0,1,10,1,42,0,0,0,512,1,count,error,0,0,1,0,1,0,0,1];
  const code=await m.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw Error(m.UTF8ToString(error));
  return {targets:banks[3],distances:banks[4],comparisons:[...m.HEAPU32.subarray(count/4,count/4+2)],growth};
 }finally{closeMemoryRanges(m);await Promise.all(readers.map(reader=>reader.dispose()));await Promise.all(pins.map(pin=>pin.release()));for(const p of owned)m._free(p);}
}
