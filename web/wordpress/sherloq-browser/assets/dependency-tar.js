// POSIX ustar: files remain usable by tar, Archive Utility, 7-Zip, etc.
// Transport pieces never become a proprietary installed-library format.
import {sha256} from './dependency-core.js';
const enc=new TextEncoder(),dec=new TextDecoder(),BLOCK=512;
function put(header,offset,length,value){const bytes=enc.encode(value);if(bytes.length>length)throw Error('TAR field too long');header.set(bytes,offset);}
function header(path,size){
 const h=new Uint8Array(BLOCK);let name=path,prefix='';
 if(enc.encode(name).length>100){const slash=path.lastIndexOf('/');name=path.slice(slash+1);prefix=path.slice(0,slash);}
 put(h,0,100,name);put(h,345,155,prefix);put(h,100,8,'0000644\0');put(h,108,8,'0000000\0');put(h,116,8,'0000000\0');put(h,124,12,size.toString(8).padStart(11,'0')+'\0');put(h,136,12,'00000000000\0');h.fill(32,148,156);h[156]=48;put(h,257,6,'ustar\0');put(h,263,2,'00');put(h,148,8,h.reduce((n,b)=>n+b,0).toString(8).padStart(6,'0')+'\0 ');return h;
}
export async function* resourceTarParts(manifest,load,{signal,progress=()=>{}}={}){
 let done=0;
 const entries=[['manifest.json',{size:0}],...Object.entries(manifest.files)];
 const metadata=enc.encode(JSON.stringify(manifest,null,2)+'\n');entries[0][1].size=metadata.length;
 for(const [path,file] of entries){
  signal?.throwIfAborted();yield header(path,file.size);
  if(path==='manifest.json')yield metadata;else for(const hash of file.chunks){signal?.throwIfAborted();yield await load(hash);}
  if(file.size%BLOCK)yield new Uint8Array(BLOCK-file.size%BLOCK);if(path!=='manifest.json')progress(++done);
 }
 yield new Uint8Array(BLOCK*2);
}
export async function writeResourceTar(manifest,load,sink,options={}){for await(const bytes of resourceTarParts(manifest,load,options))await sink.write(bytes);}
export function resourceTarStream(manifest,load,options={}){
 const iterator=resourceTarParts(manifest,load,options);let cancelled=false;
 return new ReadableStream({async pull(c){try{const {done,value}=await iterator.next();if(cancelled)return;if(done){c.close();options.finished?.();}else c.enqueue(value);}catch(e){if(!cancelled)c.error(e);options.finished?.(e);}},async cancel(){cancelled=true;await iterator.return();options.finished?.(new DOMException('Cancelled','AbortError'));}},{highWaterMark:0});
}
export async function importLibraryFile(blob,file,manifest,save,signal){
 if(blob.size!==file.size)throw Error('Library file length differs');let offset=0;
 for(const hash of file.chunks){signal?.throwIfAborted();const size=manifest.chunks[hash],bytes=new Uint8Array(await blob.slice(offset,offset+size).arrayBuffer());if(await sha256(bytes)!==hash)throw Error('Library file integrity failure: '+hash);await save(hash,bytes);offset+=size;}
}
export async function importResourceTar(blob,manifest,save,{signal,progress=()=>{}}={}){
 let offset=0,done=0;const seen=new Set();
 const str=(h,a,n)=>dec.decode(h.subarray(a,a+n)).split('\0')[0];
 while(offset+BLOCK<=blob.size){
  signal?.throwIfAborted();const h=new Uint8Array(await blob.slice(offset,offset+BLOCK).arrayBuffer());offset+=BLOCK;
  if(h.every(b=>b===0)){if(offset+BLOCK>blob.size)throw Error('Truncated TAR footer');if(!done)throw Error('No matching library files');return {files:done};}
  const sum=parseInt(str(h,148,8).trim(),8),copy=h.slice();copy.fill(32,148,156);
  if(sum!==copy.reduce((n,b)=>n+b,0)||str(h,257,6)!=='ustar')throw Error('Invalid TAR header');
  const prefix=str(h,345,155),path=(prefix?prefix+'/':'')+str(h,0,100),size=parseInt(str(h,124,12).trim(),8);
  if(!Number.isSafeInteger(size)||size<0||offset+Math.ceil(size/BLOCK)*BLOCK>blob.size)throw Error('Truncated TAR file');
  const file=manifest.files[path];
  if(file){if(![0,48].includes(h[156])||seen.has(path))throw Error('Invalid TAR library entry');seen.add(path);await importLibraryFile(blob.slice(offset,offset+size),file,manifest,save,signal);progress(++done);}
  offset+=Math.ceil(size/BLOCK)*BLOCK;
 }
 throw Error('TAR footer missing');
}
