// Rust allocation traps can escape wasm-bindgen's async promise boundary.
self.addEventListener('error',event=>{event.preventDefault();const memory=/alloc::rust_oom|handle_alloc_error/.test(event.error?.stack??'');self.postMessage({failure:{code:memory?'MEMORY_LIMIT':'C2PA_RUNTIME',message:memory?'C2PA source or manifest exceeded its admitted memory.':'C2PA worker failed; no validation result produced.'}});});
import init,{WasmReader} from '../vendor/c2pa/c2pa.js';
import {c2paSettings} from './c2pa-report.js';
// One reader per isolated worker. Parent terminates it after every outcome.
self.onmessage=async({data:{blob,trustAnchors}})=>{
 let reader,blockedNetworkRequests=0;const sourceReads={calls:0,totalBytes:0,maximumBytes:0};
 try{
  const wasm=await init({module_or_path:new URL('../vendor/c2pa/c2pa_bg.wasm',import.meta.url)});
  // SDK settings also deny remote manifests, OCSP, redirects and all hostnames.
  globalThis.fetch=()=>{blockedNetworkRequests++;throw new Error('C2PA validation is offline.');};
  const NativeReader=globalThis.FileReaderSync;
  globalThis.FileReaderSync=class extends NativeReader {readAsArrayBuffer(part){if(part.size>64*1024**2)throw Object.assign(new Error('C2PA byte staging exceeds 64 MiB.'),{code:'MEMORY_LIMIT'});sourceReads.calls++;sourceReads.totalBytes+=part.size;sourceReads.maximumBytes=Math.max(sourceReads.maximumBytes,part.size);return super.readAsArrayBuffer(part);}};
  self.postMessage({progress:0.15});
  const head=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  const format=head[0]===255&&head[1]===216?'image/jpeg':head[0]===137&&head[1]===80?'image/png':head[0]===73&&head[1]===73||head[0]===77&&head[1]===77?'image/tiff':'';
  let json=null,error=null;
  try{reader=await WasmReader.fromBlob(format,blob,JSON.stringify(c2paSettings(trustAnchors)));json=reader.json();}
  catch(e){if(e?.code||e instanceof WebAssembly.RuntimeError)throw e;error=String(e);if(/OutOfMemory|memory allocation|C2PA byte staging/.test(error))throw Object.assign(new Error('C2PA source or manifest exceeded its admitted memory.'),{code:'MEMORY_LIMIT'});}
  reader?.free();reader=null;
  self.postMessage({json,error,metrics:{heapCapacityBytes:wasm.memory.buffer.byteLength,heapMaximumBytes:128*1024**2,blockedNetworkRequests,sourceReads}});
 }catch(error){self.postMessage({failure:{code:error.code??(error instanceof WebAssembly.RuntimeError?'MEMORY_ALLOCATION':'C2PA_RUNTIME'),message:error.code?error.message:'C2PA runtime failed; no validation result produced.'}});}
 finally{reader?.free();}
};
