import "../../runtime-context.js?v=0.14.5";
import {ZeroPerl,MemoryFileSystem} from '../vendor/exiftool/zeroperl.js';
import {EngineError,requireValue} from './errors.js';
export const EXIFTOOL_OUTPUT_LIMIT=8*1024**2;
export const EXIFTOOL_MODES=Object.freeze({dump:['-G','-n','-j'],location:['-G','-n','-j','-Composite:GPSLatitude','-Composite:GPSLongitude'],headers:['-htmldump0'],thumbnail:['-b','-ThumbnailImage']});
// Worker-local runtime. No caller-supplied Perl, arguments, configuration, paths or modules.
export async function executeExiftool(blob,mode,{pack,wasm,onProgress}={}){
 requireValue(blob instanceof Blob&&blob.size>0&&Object.hasOwn(EXIFTOOL_MODES,mode),'Invalid ExifTool input or mode.');
 requireValue(pack instanceof Uint8Array&&wasm instanceof Uint8Array,'Local ExifTool assets required.');
 const fs=new MemoryFileSystem({'/':''}),headerSize=new DataView(pack.buffer,pack.byteOffset,pack.byteLength).getUint32(0,true);
 requireValue(headerSize<=65536&&headerSize+4<pack.length,'Invalid ExifTool library index.');
 const entries=JSON.parse(new TextDecoder().decode(pack.subarray(4,4+headerSize))),start=4+headerSize;
 for(const [path,offset,length]of entries){requireValue(typeof path==='string'&&path.startsWith('/')&&!path.includes('..')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>=0&&start+offset+length<=pack.length,'Invalid ExifTool library entry.');fs.addFile(path,pack.subarray(start+offset,start+offset+length));}
 // Keep the original in Blob storage. WASI reads only the requested byte ranges.
 const reads={count:0,totalBytes:0,maximumBytes:0};
 class SourceBlob extends Blob {slice(a,b,type){const part=super.slice(a,b,type);reads.count++;reads.totalBytes+=part.size;reads.maximumBytes=Math.max(reads.maximumBytes,part.size);return part;}}
 fs.addFile('/input/source',new SourceBlob([blob]));
 const stdout=[],stderr=[];let outputBytes=0,errorBytes=0,perl;
 const collect=(chunks,limit,error=false)=>chunk=>{const bytes=typeof chunk==='string'?new TextEncoder().encode(chunk):chunk;const n=error?(errorBytes+=bytes.byteLength):(outputBytes+=bytes.byteLength);if(n>limit)throw new EngineError('MEMORY_LIMIT','ExifTool output exceeds its bounded report size.');chunks.push(bytes.slice());};
 try{
  perl=await ZeroPerl.create({fileSystem:fs,env:{PERL5LIB:'/lib',TZ:'UTC'},stdout:collect(stdout,EXIFTOOL_OUTPUT_LIMIT),stderr:collect(stderr,65536,true),fetch:async()=>new Response(wasm)});
  onProgress?.(.35);
  const result=await perl.runFile('/exiftool',['-config','',...EXIFTOOL_MODES[mode],'/input/source']);perl.flush();
  if(!result.success)throw new EngineError('EXIFTOOL_RUNTIME','ExifTool could not complete extraction (exit '+result.exitCode+').');
  const join=(chunks,n)=>{const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}return bytes;};
  const bytes=join(stdout,outputBytes),warnings=new TextDecoder().decode(join(stderr,errorBytes));
  return {bytes,warnings,metrics:{wasmHeapBytes:perl.exports.memory.buffer.byteLength,wasmMaximumBytes:128*1024**2,outputBytes,sourceReads:reads}};
 }finally{perl?.dispose();}
}
