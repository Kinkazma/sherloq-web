import "../../runtime-context.js?v=0.25.0";
import {EngineError,serializeEngineError,normalizeResourceError} from './errors.js';
import {buildSourcePrefixIntegrity,createSourcePrefixVerifier} from './source-prefix-integrity.js';
// Rust allocation traps can escape wasm-bindgen's async promise boundary.
self.addEventListener('error',event=>{event.preventDefault();const memory=/alloc::rust_oom|handle_alloc_error/.test(event.error?.stack??'');self.postMessage({failure:serializeEngineError(new EngineError(memory?'MEMORY_ALLOCATION':'C2PA_RUNTIME',memory?'C2PA native allocator refused memory.':'C2PA worker failed; no validation result produced.',{cause:event.error,details:memory?{allocationKind:'wasm'}:undefined}))});});
import init,{WasmReader} from '../vendor/c2pa/c2pa.js';
import {c2paSettings} from './c2pa-report.js';
// One reader per isolated worker. Parent terminates it after every outcome.
self.onmessage=async({data:{blob,trustAnchors,sourceSha256,sourceIntegrity}})=>{
 let reader,blockedNetworkRequests=0,sourceFailure;const sourceReads={calls:0,totalBytes:0,maximumBytes:0},sourceVerification={enabled:sourceSha256!==undefined,prefixBytes:0,initialHashBytes:0,blockReadCalls:0,blockReadBytes:0,ownedEdgeCacheHits:0};
 try{
  const wasm=await init({module_or_path:new URL('../vendor/c2pa/c2pa_bg.wasm',import.meta.url)});
  // SDK settings also deny remote manifests, OCSP, redirects and all hostnames.
  globalThis.fetch=()=>{blockedNetworkRequests++;throw new Error('C2PA validation is offline.');};
  let verifier;
  if(sourceSha256!==undefined){
   if(!sourceIntegrity){const built=await buildSourcePrefixIntegrity(blob,{reserveMemory:()=>()=>{}});sourceIntegrity=built.manifest;sourceVerification.initialHashBytes=blob.size;}
   verifier=await createSourcePrefixVerifier(sourceIntegrity,{expectedSha256:sourceSha256});sourceVerification.prefixBytes=sourceIntegrity.states.byteLength;
   if(sourceIntegrity.byteLength!==blob.size)throw new EngineError('SOURCE_CHANGED','The C2PA input length does not match its loaded original source.');
  }
  const NativeReader=globalThis.FileReaderSync,offsets=new WeakMap();
  class OriginalPart extends Blob{constructor(parts,offset=0){super(parts);offsets.set(this,offset);}slice(start=0,end=this.size,type=''){const a=start<0?Math.max(this.size+start,0):Math.min(start,this.size),b=end<0?Math.max(this.size+end,0):Math.min(end,this.size);return new OriginalPart([super.slice(start,end,type)],offsets.get(this)+a);}}
  const original=verifier?new OriginalPart([blob]):blob;
  let edge;
  const readBlock=(offset,length)=>{if(edge?.offset===offset&&edge.bytes.length===length){sourceVerification.ownedEdgeCacheHits++;return edge.bytes;}sourceVerification.blockReadCalls++;sourceVerification.blockReadBytes+=length;const bytes=new Uint8Array(NativeReader.prototype.readAsArrayBuffer.call(new NativeReader(),Blob.prototype.slice.call(original,offset,offset+length)));edge={offset,bytes};return bytes;};
  globalThis.FileReaderSync=class extends NativeReader {readAsArrayBuffer(part){
   if(part.size>64*1024**2)throw new EngineError('MEMORY_LIMIT','C2PA byte staging exceeds 64 MiB.');sourceReads.calls++;sourceReads.totalBytes+=part.size;sourceReads.maximumBytes=Math.max(sourceReads.maximumBytes,part.size);
   try{const buffer=super.readAsArrayBuffer(part);if(verifier){if(!offsets.has(part))throw new EngineError('SOURCE_CHANGED','C2PA attempted to read bytes outside its original source.');const bytes=new Uint8Array(buffer);if(bytes.length!==part.size)throw new EngineError('SOURCE_CHANGED','C2PA read an unexpected end of the original source.');verifier.verifyRangeSync(offsets.get(part),bytes,readBlock);}return buffer;}
   catch(cause){sourceFailure=cause instanceof EngineError?cause:new EngineError('SOURCE_CHANGED','The original C2PA source changed or became unreadable.',{cause});throw sourceFailure;}
  }};
  self.postMessage({progress:0.15});
  const head=verifier?new Uint8Array(new FileReaderSync().readAsArrayBuffer(original.slice(0,8))):new Uint8Array(await blob.slice(0,8).arrayBuffer());
  const format=head[0]===255&&head[1]===216?'image/jpeg':head[0]===137&&head[1]===80?'image/png':head[0]===73&&head[1]===73||head[0]===77&&head[1]===77?'image/tiff':'';
  let json=null,error=null;
  try{reader=await WasmReader.fromBlob(format,original,JSON.stringify(c2paSettings(trustAnchors)));if(sourceFailure)throw sourceFailure;json=reader.json();}
  catch(e){if(sourceFailure)throw sourceFailure;if(e?.code||e instanceof WebAssembly.RuntimeError)throw e;error=String(e);if(/OutOfMemory|memory allocation|C2PA byte staging/.test(error))throw new EngineError('MEMORY_ALLOCATION','C2PA native allocator refused memory.',{cause:e,details:{allocationKind:'wasm'}});}
  reader?.free();reader=null;
  self.postMessage({json,error,metrics:{heapCapacityBytes:wasm.memory.buffer.byteLength,heapMaximumBytes:128*1024**2,blockedNetworkRequests,sourceReads,sourceVerification}});
 }catch(error){self.postMessage({failure:serializeEngineError(normalizeResourceError(sourceFailure??error),'C2PA_RUNTIME')});}
 finally{reader?.free();}
};
