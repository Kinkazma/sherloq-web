import "../../runtime-context.js?v=0.30.0";
import {executeExiftool} from './exiftool-runtime.js';
import {EngineError} from './errors.js';
const admissions=new Map();let admissionId=0;
const reserveSourceTranscript=bytes=>new Promise((resolve,reject)=>{const id=++admissionId;admissions.set(id,{resolve,reject});self.postMessage({sourceTranscriptAdmission:{id,bytes}});});
self.onmessage=async({data})=>{if(data.sourceTranscriptAdmission){const {id,failure}=data.sourceTranscriptAdmission,pending=admissions.get(id);if(pending){admissions.delete(id);failure?pending.reject(new EngineError(failure.code,failure.message)):pending.resolve();}return;}
 const{blob,mode,captureSourceReads}=data;try{
 const [pack,wasm]=await Promise.all(['libraries.pack','zeroperl.wasm'].map(async name=>{const r=await fetch(new URL('../vendor/exiftool/'+name,import.meta.url));if(!r.ok)throw Error('Local ExifTool asset unavailable.');return new Uint8Array(await r.arrayBuffer());}));
 // Interpreter WASI exposes only the virtual files. No network imports or host filesystem.
 self.fetch=async()=>{throw Error('ExifTool network access disabled.');};
 const result=await executeExiftool(blob,mode,{pack,wasm,captureSourceReads,reserveSourceTranscript,onProgress:progress=>self.postMessage({progress})});self.postMessage(result,[result.bytes.buffer]);
 }catch(error){self.postMessage({failure:{code:error.code??'EXIFTOOL_RUNTIME',message:error.code?error.message:'ExifTool failed; no report produced.'}});}};
