import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from './unified-engine/src/scientific-zip.js';
import {createBatchTemporaryDirectory} from './batch-artifacts.js';
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export const ZIP_CHUNK_BYTES=1024**2;
// One input window and one disk-backed output; ZIP64 is inherited from the
// engine's qualified scientific writer. No full-archive byte concatenation.
function zipHeader(entry,central=false){
 const bytes=central?scientificZipCentral(entry):scientificZipLocal(entry),v=new DataView(bytes.buffer);v.setUint16(central?10:8,entry.method??0,true);v.setUint32(central?16:14,entry.crc??0,true);
 if(entry.zipSize)v.setBigUint64((central?46:30)+entry.name.length+12,BigInt(entry.compressed??entry.size),true);else v.setUint32(central?20:18,entry.compressed??entry.size,true);return bytes;
}
export async function writeBatchZip(entries,writer,{signal,onProgress=()=>{},zip64=false,compress=true}={}){
 const encoder=new TextEncoder(),records=entries.map(e=>({...e,name:encoder.encode(e.path)}));scientificZipPlan(records,{zip64});let written=0,processed=0;const total=records.reduce((n,r)=>n+r.size,0);
 const write=async bytes=>{signal?.throwIfAborted();await writer.write(bytes);written+=bytes.byteLength;};
 try{
  for(const entry of records){signal?.throwIfAborted();entry.offset=written;entry.zipOffset=zip64||written>=0xffffffff;entry.centralExtra=entry.zipSize||entry.zipOffset?4+(entry.zipSize?16:0)+(entry.zipOffset?8:0):0;entry.method=compress&&!/\.(?:png|jpe?g|webp|avif)$/i.test(entry.path)&&typeof CompressionStream==='function'?8:0;await write(zipHeader(entry));const start=written,blob=await entry.read();if(blob.size!==entry.size)throw Error('Taille de sortie modifiée pendant l’export : '+entry.path);let crc=0xffffffff,at=0;
   const input=new ReadableStream({async pull(controller){try{signal?.throwIfAborted();if(at>=blob.size){controller.close();return;}const chunk=new Uint8Array(await blob.slice(at,at+ZIP_CHUNK_BYTES).arrayBuffer());at+=chunk.length;processed+=chunk.length;for(const b of chunk)crc=table[(crc^b)&255]^(crc>>>8);controller.enqueue(chunk);onProgress(total?processed/total:0);}catch(error){controller.error(error);}}});
   const reader=(entry.method?input.pipeThrough(new CompressionStream('deflate')):input).getReader();let skip=entry.method?2:0,tail=new Uint8Array(0);
   try{for(;;){const {value,done}=await reader.read();if(done)break;let chunk=value;if(skip){const n=Math.min(skip,chunk.length);skip-=n;chunk=chunk.subarray(n);}if(!entry.method){await write(chunk);continue;}const joined=new Uint8Array(tail.length+chunk.length);joined.set(tail);joined.set(chunk,tail.length);const end=Math.max(0,joined.length-4);if(end)await write(joined.subarray(0,end));tail=joined.slice(end);}}
   catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
   entry.crc=(crc^0xffffffff)>>>0;entry.compressed=written-start;if(entry.method&&(skip||tail.length!==4))throw Error('Flux DEFLATE tronqué.');await writer.write({type:'write',position:entry.offset,data:zipHeader(entry)});await writer.seek(written);
  }
  const central=written;for(const entry of records)await write(zipHeader(entry,true));const centralBytes=written-central,use64=zip64||records.length>=65535||central>=0xffffffff||centralBytes>=0xffffffff||records.some(e=>e.zipSize||e.zipOffset),plan={central,centralBytes,endOffset:written,count:records.length,zip64:use64,capacity:written+(use64?98:22)};await write(scientificZipEnd(plan));await writer.close();onProgress(1);return plan;
 }catch(error){await writer.abort().catch(()=>{});throw error;}
}
export async function diskBatchZip(entries,options={}){
 const temporary=await createBatchTemporaryDirectory();
 try{const handle=await temporary.directory.getFileHandle('archive.zip',{create:true});await writeBatchZip(entries,await handle.createWritable(),options);return {blob:await handle.getFile(),cleanup:()=>temporary.cleanup()};}
 catch(error){await temporary.cleanup().catch(()=>{});throw error;}
}
// Resume reads the directory and individual payloads from file slices.
// Compressed entries are inflated one at a time, never as a whole-archive copy.
export async function readBatchZip(file,{maximumEntries=2000}={}){
 if(file.size<22)return null;
 const read=async(at,length)=>{if(!Number.isSafeInteger(at)||at<0||at+length>file.size)throw Error('Position ZIP invalide.');return new Uint8Array(await file.slice(at,at+length).arrayBuffer());};
 const tail=await read(Math.max(0,file.size-65557),Math.min(file.size,65557)),view=new DataView(tail.buffer);let end=-1;
 for(let at=tail.length-22;at>=0;at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===tail.length){end=at;break;}
 if(end<0)return null;let count=view.getUint16(end+10,true),length=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 const number=(v,at)=>{const n=Number(v.getBigUint64(at,true));if(!Number.isSafeInteger(n))throw Error('Taille ZIP64 invalide.');return n;};
 if(count===65535||length===0xffffffff||offset===0xffffffff){const absolute=file.size-tail.length+end,locator=new DataView((await read(absolute-20,20)).buffer);if(locator.getUint32(0,true)!==0x07064b50)throw Error('Index ZIP64 manquant.');const z=new DataView((await read(number(locator,8),56)).buffer);if(z.getUint32(0,true)!==0x06064b50)throw Error('Index ZIP64 invalide.');count=number(z,32);length=number(z,40);offset=number(z,48);}
 if(count>maximumEntries||length>8*1024**2)throw Error('Index ZIP trop grand.');
 const bytes=await read(offset,length),v=new DataView(bytes.buffer),decoder=new TextDecoder('utf-8',{fatal:true}),records=[];let at=0;
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||v.getUint32(at,true)!==0x02014b50)throw Error('Index ZIP invalide.');
  const method=v.getUint16(at+10,true),flags=v.getUint16(at+8,true),nameLength=v.getUint16(at+28,true),extraLength=v.getUint16(at+30,true),commentLength=v.getUint16(at+32,true);if(![0,8].includes(method)||flags&1)return null;
  const next=at+46+nameLength+extraLength+commentLength;if(next>bytes.length)throw Error('Entrée ZIP tronquée.');const name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));let size=v.getUint32(at+24,true),compressed=v.getUint32(at+20,true),local=v.getUint32(at+42,true);
  if(size===0xffffffff||compressed===0xffffffff||local===0xffffffff){let extra=at+46+nameLength,found=false;while(extra+4<=at+46+nameLength+extraLength){const kind=v.getUint16(extra,true),n=v.getUint16(extra+2,true);if(kind===1){let x=extra+4;if(size===0xffffffff){size=number(v,x);x+=8;}if(compressed===0xffffffff){compressed=number(v,x);x+=8;}if(local===0xffffffff){local=number(v,x);x+=8;}if(x>extra+4+n)throw Error('Entrée ZIP64 tronquée.');found=true;break;}extra+=4+n;}if(!found)throw Error('Entrée ZIP64 manquante.');}
  if(method===0&&size!==compressed)throw Error('Taille STORE invalide.');records.push({name,size,compressed,local,method,crc:v.getUint32(at+16,true)});at=next;
 }
 if(at!==length)throw Error('Longueur d’index ZIP incohérente.');
 const files=Object.create(null);
 for(const record of records){if(files[record.name])throw Error('Chemin ZIP en doublon.');const header=new DataView((await read(record.local,30)).buffer);if(header.getUint32(0,true)!==0x04034b50||header.getUint16(8,true)!==record.method)throw Error('En-tête ZIP invalide.');const start=record.local+30+header.getUint16(26,true)+header.getUint16(28,true);if(start+record.compressed>offset)throw Error('Contenu ZIP hors limites.');
  files[record.name]={name:record.name,dir:record.name.endsWith('/'),_data:{uncompressedSize:record.size},async async(type){let blob=file.slice(start,start+record.compressed);if(record.method===8){let decoder;try{decoder=new DecompressionStream('deflate-raw');}catch{}if(decoder)blob=await new Response(blob.stream().pipeThrough(decoder)).blob();else{await import('./batch-vendor/jszip.js');const e={name:new TextEncoder().encode(record.name),size:record.size,compressed:record.compressed,method:8,crc:record.crc},plan=scientificZipPlan([e]),local=zipHeader(e),central=zipHeader(e,true);plan.central=local.length+record.compressed;plan.centralBytes=central.length;plan.endOffset=plan.central+plan.centralBytes;const container=new Blob([local,blob,central,scientificZipEnd(plan)]),zip=await globalThis.JSZip.loadAsync(await container.arrayBuffer());blob=await zip.file(record.name).async('blob');}}if(blob.size!==record.size)throw Error('Taille ZIP après décompression invalide.');if(type==='blob')return blob;if(type==='string')return blob.text();throw Error('Lecture ZIP non prise en charge.');}};
 }
 return {files,file:path=>files[path]??null};
}
