import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const auditedRoot=resolve(process.env.SHERLOQ_AUDIT_ROOT??fileURLToPath(new URL('../../../',import.meta.url)));
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MessageChannel} from 'node:worker_threads';
const {default:create}=await import(pathToFileURL(resolve(auditedRoot,'vendor/dense-paged/dense-paged.js')));
const {exportByteStore,readByteStore}=await import(pathToFileURL(resolve(auditedRoot,'src/portable-byte-store.js')));
globalThis.MessageChannel=MessageChannel;
const binary=readFileSync(resolve(auditedRoot,'vendor/dense-paged/dense-paged.wasm'));
async function run(mode){
 const memory=new WebAssembly.Memory({initial:128,maximum:16384}),events=[],nativeGrow=memory.grow.bind(memory);
 let inIO=false,captured,pending=false,armed=mode!=='baseline',filled=false;
 memory.grow=pages=>{events.push({event:'grow',pages,pending,oldBytes:memory.buffer.byteLength,viewBytes:captured?.byteLength,stack:new Error().stack.split('\n').slice(1,9)});return nativeGrow(pages);};
 const m=await create({wasmBinary:binary,wasmMemory:memory});
 const n=64,banks=[new Uint8Array(n*48),new Uint8Array(n*48),new Uint8Array(n).fill(3),new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(n*4)];
 for(let i=0;i<n*12;i++){new Float32Array(banks[0].buffer)[i]=(i%31)/32;new Float32Array(banks[1].buffer)[i]=(i%29)/32;}
 const pins=[],readers=[];
 for(const bank of banks){const store={byteLength:bank.length,readInto(target,offset=0){target.set(bank.subarray(offset,offset+target.length));},write(source,offset=0){bank.set(source,offset);},flush(){}};const pin=await exportByteStore(store,{writable:true,forceBroker:true});pins.push(pin);readers.push(await readByteStore(pin.descriptor));}
 const fillers=[];
 m.pageIO=(id,offset,length,pointer,write)=>{
  if(armed&&!filled){filled=true;const limit=m.HEAPU8.length-128*1024;let p;do{p=m._malloc(65536);if(!p)throw Error('test filler allocation');fillers.push(p);}while(p+65536<limit);events.push({event:'before-view',heapBytes:m.HEAPU8.length,lastAllocation:p+65536});}
  const perform=()=>{const target=m.HEAPU8.subarray(pointer,pointer+length);captured=target;pending=true;events.push({event:'io-start',id,write,length,heapBytes:m.HEAPU8.length});return (write?readers[id].write(target,offset):readers[id].readInto(target,offset)).finally(()=>{events.push({event:'io-end',id,write,viewBytes:target.byteLength,currentHeapBytes:m.HEAPU8.length});pending=false;});};
  return mode==='deferred-view'?Promise.resolve().then(perform):perform();
 };
 m.checkpoint=()=>{};
 const count=m._malloc(8),error=m._malloc(1024),values=[8,8,12,0,1,10,1,42,0,0,0,512,1,count,error,0,0,1,0,1,0,0,1];
 let outcome;
 try{const code=await m.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw Error(m.UTF8ToString(error));outcome={ok:true,hash:createHash('sha256').update(banks[3]).update(banks[4]).digest('hex')};}
 catch(error){outcome={ok:false,name:error.name,message:error.message,stack:error.stack};}
 finally{for(const reader of readers)await reader.dispose();for(const pin of pins)await pin.release();}
 return {mode,...outcome,eventCount:events.length,events:events.filter(e=>e.event==='grow'||e.event==='before-view'||(e.event==='io-end'&&e.viewBytes===0)),firstIO:events.find(e=>e.event==='io-start')};
}
const results=[];for(const mode of ['baseline','capture-before-unwind','deferred-view'])results.push(await run(mode));
writeFileSync(new URL('./results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
