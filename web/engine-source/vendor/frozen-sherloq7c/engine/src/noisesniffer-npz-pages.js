import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from './scientific-zip.js';
import {jsonExportBound} from './exports.js';
import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
const encoder=new TextEncoder(),crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function header(descr,shape){let text="{'descr': '"+descr+"', 'fortran_order': False, 'shape': ("+shape.join(', ')+(shape.length===1?',':'')+")}";text+=' '.repeat((64-(10+text.length+1)%64)%64)+'\n';const out=new Uint8Array(10+text.length);out.set([147,78,85,77,80,89,1,0]);new DataView(out.buffer).setUint16(8,text.length,true);out.set(encoder.encode(text),10);return out;}
export async function createNoisesnifferNpzPages(analysis,provenance,{budget,signal,onProgress}={}){
 const {width,height,gridWidth,gridHeight,metadata}=analysis.data,s=analysis.selection,entries=[],owned=[];let held=0;
 const retain=bytes=>{budget.retain(bytes.byteLength);held+=bytes.byteLength;owned.push(bytes);return bytes;};
 const add=(key,descr,shape,byteLength,read)=>entries.push({name:encoder.encode(key+'.npy'),header:header(descr,shape),byteLength,read});
 const direct=store=>async(out,offset)=>store.readInto(out,offset);
 const transform=(store,stride,outputStride,convert)=>async(out,offset)=>{const first=Math.floor(offset/outputStride),last=Math.ceil((offset+out.length)/outputStride),raw=new Uint8Array((last-first)*stride),converted=new Uint8Array((last-first)*outputStride);await store.readInto(raw,first*stride);convert(raw,converted);out.set(converted.subarray(offset-first*outputStride,offset-first*outputStride+out.length));};
 try{
  add('mask','|u1',[height,width],width*height,direct(analysis.mask));
  add('distribution','|u1',[height,width,3],width*height*3,transform(analysis.distribution,3,3,(a,b)=>{for(let i=0;i<a.length;i+=3){b[i]=a[i+2];b[i+1]=a[i+1];b[i+2]=a[i];}}));
  for(const key of ['all_blocks','low_noise_blocks']){const bytes=new Uint8Array(s[key].buffer,s[key].byteOffset,s[key].byteLength);add(key,'<f8',[gridHeight,gridWidth],bytes.length,async(out,offset)=>out.set(bytes.subarray(offset,offset+out.length)));}
  for(const key of ['selected','low_noise']){const count=key==='selected'?s.selectedCount:s.lowCount;add(key,'<i8',[count],count*8,transform(s[key],4,8,(a,b)=>{const av=new DataView(a.buffer),bv=new DataView(b.buffer);for(let i=0;i<a.length/4;i++)bv.setBigInt64(i*8,BigInt(av.getUint32(i*4,true)),true);}));}
  const prepareMetadata=budget.reserve(12*(jsonExportBound(metadata)+jsonExportBound(provenance)));try{for(const [key,value]of [['metadata_json',metadata],['browser_provenance_json',provenance]]){const points=Array.from(JSON.stringify(value),c=>c.codePointAt(0)),bytes=retain(new Uint8Array(points.length*4)),v=new DataView(bytes.buffer);for(let i=0;i<points.length;i++)v.setUint32(i*4,points[i],true);add(key,'<U'+points.length,[],bytes.length,async(out,offset)=>out.set(bytes.subarray(offset,offset+out.length)));}
  }finally{prepareMetadata();}
  for(const e of entries)e.size=e.header.length+e.byteLength;const plan=scientificZipPlan(entries),total=plan.capacity;
  const release=budget.reserve(1024*1024);try{
   let done=0;for(const e of entries){let crc=0xffffffff;const update=bytes=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);};update(e.header);for(let offset=0;offset<e.byteLength;offset+=65536){await controlCheckpoint(signal);const bytes=new Uint8Array(Math.min(65536,e.byteLength-offset));await e.read(bytes,offset);update(bytes);onProgress?.({phase:'noisesniffer-npz-crc',completed:done+offset+bytes.length,total});}e.crc=(crc^0xffffffff)>>>0;done+=e.size;}
  }finally{release();}
  const segments=[];let at=0;
  const bytesSegment=bytes=>{retain(bytes);segments.push({offset:at,length:bytes.length,read:async(out,offset)=>out.set(bytes.subarray(offset,offset+out.length))});at+=bytes.length;};
  for(const e of entries){const local=scientificZipLocal(e);new DataView(local.buffer).setUint32(14,e.crc,true);bytesSegment(local);bytesSegment(e.header);segments.push({offset:at,length:e.byteLength,read:e.read});at+=e.byteLength;}
  requireValue(at===plan.central,'Invalid NPZ central offset');for(const e of entries)bytesSegment(scientificZipCentral(e));bytesSegment(scientificZipEnd(plan));requireValue(at===plan.capacity,'Invalid NPZ capacity');let disposed=false;
  return {byteLength:at,async read({offset=0,length=262144}={}, {signal}={}){requireValue(!disposed&&Number.isSafeInteger(offset)&&offset>=0&&offset<=at&&Number.isSafeInteger(length)&&length>0&&length<=1048576,'Invalid Noisesniffer NPZ page.');const size=Math.min(length,at-offset),release=budget.reserve(size*4+64);try{const bytes=new Uint8Array(size);for(const segment of segments){const left=Math.max(offset,segment.offset),right=Math.min(offset+size,segment.offset+segment.length);if(left<right){await controlCheckpoint(signal);await segment.read(bytes.subarray(left-offset,right-offset),left-segment.offset);}}checkAbort(signal);return {mime:'application/zip',bytes,offset,nextOffset:offset+size,totalBytes:at,done:offset+size===at,release};}catch(e){release();throw e;}},dispose(){if(disposed)return;disposed=true;budget.retained-=held;owned.length=0;held=0;}};
 }catch(error){budget.retained-=held;throw error;}
}
