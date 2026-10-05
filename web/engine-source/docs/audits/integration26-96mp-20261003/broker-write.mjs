import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const auditedRoot=resolve(process.env.SHERLOQ_AUDIT_ROOT??fileURLToPath(new URL('../../../',import.meta.url)));
import {writeFileSync} from 'node:fs';
const {exportByteStore,readByteStore}=await import(pathToFileURL(resolve(auditedRoot,'src/portable-byte-store.js')));
const memory=new WebAssembly.Memory({initial:4,maximum:8});
const source=new Uint8Array(memory.buffer,0,128*1024);source.fill(173);
const destination=new Uint8Array(source.length);let writes=0;
const store={byteLength:destination.length,readInto(target,offset=0){target.set(destination.subarray(offset,offset+target.length));},write(bytes,offset=0){writes++;destination.set(bytes,offset);},flush(){}};
const pin=await exportByteStore(store,{writable:true,forceBroker:true}),reader=await readByteStore(pin.descriptor);
const pending=reader.write(source);memory.grow(1);let error=null;try{await pending;}catch(e){error={name:e.name,message:e.message};}
await reader.dispose();await pin.release();
const result={explanation:'Generic broker contract test: growth between its first transfer and its reply; no native or production source changes.',requestedBytes:128*1024,sourceLengthAfterGrowth:source.length,writes,bytesCorrect:destination.reduce((n,v)=>n+(v===173),0),resolvedSuccessfully:error===null,error};
writeFileSync(new URL('./broker-write-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
