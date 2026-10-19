import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from './scientific-zip.js';
import {truforNpz,compositeNpz,catnetNpz,cfaNpz,forgeryscopeNpz} from './npz.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const enc=new TextEncoder(),CHUNK=1024**2,little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=(bytes,c)=>{for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return c;};
const jsonBound=v=>v===null||typeof v!=='object'?(typeof v==='string'?v.length*6+2:32):Object.entries(v).reduce((n,[k,x])=>n+k.length*6+jsonBound(x)+4,2);
function unicodeEntry(key,value){
 const points=Array.from(JSON.stringify(value),x=>x.codePointAt(0));
 let text="{'descr': '<U"+points.length+"', 'fortran_order': False, 'shape': ()}";text+=' '.repeat((64-(10+text.length+1)%64)%64)+'\n';
 const header=new Uint8Array(10+text.length);header.set([147,78,85,77,80,89,1,0]);new DataView(header.buffer).setUint16(8,text.length,true);header.set(enc.encode(text),10);
 return {key,header,value:Uint32Array.from(points),bytes:points.length*4};
}
// Views reference pinned scientific arrays. Only uncommon endian/int64
// conversions allocate a bounded temporary, never another full archive.
function dataRange(e,offset,count){
 if(e.segmented){requireValue(little,'Segmented float exports require little-endian typed arrays.');const out=new Uint8Array(count);return e.value.readBytes(out,offset).then(()=>out);}
 if(!e.int64&&little)return new Uint8Array(e.value.buffer,e.value.byteOffset+offset,count);
 const size=e.int64?8:e.value.BYTES_PER_ELEMENT,out=new Uint8Array(count),one=new Uint8Array(size),v=new DataView(one.buffer);
 for(let i=Math.floor(offset/size);i<Math.ceil((offset+count)/size);i++){
  if(e.int64)v.setBigInt64(0,BigInt(e.value[i]),true);
  else if(e.floating){if(size===4)v.setFloat32(0,e.value[i],true);else v.setFloat64(0,e.value[i],true);}
  else if(size===1)v.setUint8(0,e.value[i]);else v.setUint32(0,e.value[i],true);
  const a=Math.max(offset,i*size),b=Math.min(offset+count,(i+1)*size);out.set(one.subarray(a-i*size,b-i*size),a-offset);
 }
 return out;
}
/** Stored ZIP/NPY bytes identical to the existing exports, random-access in
 * bounded windows. The caller must pin result arrays until release(). */
export async function createM2NpzStream(method,result,{budget,signal,onProgress}={}){
 const factory={trufor:truforNpz,composite:compositeNpz,catnet:catnetNpz,cfa:cfaNpz,forgeryscope:forgeryscopeNpz}[method];requireValue(factory,'Unknown M2 export method.');
 let source,entries;factory(result,Infinity,(r,_limit,e)=>{source=r;entries=e;});
 const release=budget.reserve(2*CHUNK+65536+entries.length*1024+32*(jsonBound(source.data.metadata)+jsonBound(source.provenance)));
 try{
  checkAbort(signal);entries.push(unicodeEntry('metadata_json',source.data.metadata),unicodeEntry('browser_provenance_json',source.provenance));
  for(const e of entries){e.name=enc.encode(e.key+'.npy');e.size=e.header.length+e.bytes;}const plan=scientificZipPlan(entries),total=plan.capacity;
  const segments=[];let at=0,completed=0;
  const append=(length,read)=>{segments.push({start:at,length,read});at+=length;};
  const bytes=b=>append(b.length,(offset,count)=>b.subarray(offset,offset+count));
  for(const e of entries){
   checkAbort(signal);let c=crc(e.header,0xffffffff);
   for(let offset=0;offset<e.bytes;offset+=CHUNK){c=crc(await dataRange(e,offset,Math.min(CHUNK,e.bytes-offset)),c);checkAbort(signal);await new Promise(resolve=>setTimeout(resolve,0));}
   e.crc=(c^0xffffffff)>>>0;e.offset=at;
   const local=scientificZipLocal(e);new DataView(local.buffer).setUint32(14,e.crc,true);
   bytes(local);bytes(e.header);append(e.bytes,(offset,count)=>dataRange(e,offset,count));if(e.segmented)segments.at(-1).readInto=(target,offset)=>e.value.readBytes(target,offset);
   onProgress?.({phase:'export',completed:++completed,total:entries.length});
  }
  requireValue(at===plan.central,'Invalid central offset');for(const e of entries)bytes(scientificZipCentral(e));bytes(scientificZipEnd(plan));requireValue(at===total,'Invalid NPZ stream size.');checkAbort(signal);
  let released=false;
  const validate=(offset,count)=>{
   requireValue(!released&&Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=total&&count<=4*CHUNK,'Invalid NPZ window.');
  };
  const readSync=(offset,count)=>{validate(offset,count);
   const out=new Uint8Array(count);for(const s of segments){const a=Math.max(offset,s.start),b=Math.min(offset+count,s.start+s.length);if(a<b)out.set(s.read(a-s.start,b-a),a-offset);}return out;
  };
  const readAsync=async(offset,count)=>{validate(offset,count);const out=new Uint8Array(count);for(const s of segments){const a=Math.max(offset,s.start),b=Math.min(offset+count,s.start+s.length);if(a<b){if(s.readInto)await s.readInto(out.subarray(a-offset,b-offset),a-s.start);else out.set(s.read(a-s.start,b-a),a-offset);}}return out;};
  return {mime:'application/zip',length:total,read:entries.some(e=>e.segmented)?readAsync:readSync,release(){if(released)return;released=true;segments.length=0;entries.length=0;release();}};
 }catch(e){release();throw e;}
}
