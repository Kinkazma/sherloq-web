import "../../runtime-context.js?v=0.14.5";
import {executeExiftool} from './exiftool-runtime.js';
self.onmessage=async({data:{blob,mode}})=>{try{
 const [pack,wasm]=await Promise.all(['libraries.pack','zeroperl.wasm'].map(async name=>{const r=await fetch(new URL('../vendor/exiftool/'+name,import.meta.url));if(!r.ok)throw Error('Local ExifTool asset unavailable.');return new Uint8Array(await r.arrayBuffer());}));
 // Interpreter WASI exposes only the virtual files. No network imports or host filesystem.
 self.fetch=async()=>{throw Error('ExifTool network access disabled.');};
 const result=await executeExiftool(blob,mode,{pack,wasm,onProgress:progress=>self.postMessage({progress})});self.postMessage(result,[result.bytes.buffer]);
 }catch(error){self.postMessage({failure:{code:error.code??'EXIFTOOL_RUNTIME',message:error.code?error.message:'ExifTool failed; no report produced.'}});}};
