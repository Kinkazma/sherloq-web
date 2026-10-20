// Lossless NPY/ZIP64 and JSON writers. Memory use is one bounded chunk; the
// caller provides backpressure and a file/Blob sink. No analysis is rerun.
const encoder=new TextEncoder(),CHUNK=1024*1024;
const little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function update(crc,data){for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc;}
function block(length){const bytes=new Uint8Array(length);return {bytes,v:new DataView(bytes.buffer)};}
function npyHeader(descr,shape){let text="{'descr': '"+descr+"', 'fortran_order': False, 'shape': ("+shape.join(', ')+(shape.length===1?',':'')+")}";text+=' '.repeat((64-(10+text.length+1)%64)%64)+'\n';const {bytes,v}=block(10+text.length);bytes.set([147,78,85,77,80,89,1,0]);v.setUint16(8,text.length,true);bytes.set(encoder.encode(text),10);return bytes;}
function energyEntries(result){
 const d=result.data,n=d.width*d.height,entries=[];
 if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid energy dimensions');
 for(const key of ['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']){
  const value=d[key],floating=!['energy_scope','energy_labels'].includes(key),shape=key==='energy_planes'?[3,d.height,d.width]:[d.height,d.width];
  if(!(value instanceof(floating?Float32Array:Int32Array))||value.length!==(key==='energy_planes'?3*n:n))throw Error('Invalid energy array '+key);
  entries.push({key,header:npyHeader(floating?'<f4':'<i4',shape),value});
 }
 for(const [key,value]of [['metadata_json',d.metadata],['browser_provenance_json',result.provenance]]){
  const text=JSON.stringify(value),points=Array.from(text,x=>x.codePointAt(0));entries.push({key,header:npyHeader('<U'+points.length,[]),value:Uint32Array.from(points)});
 }
 return entries;
}
export async function* npzChunks(result){
 const entries=energyEntries(result);let offset=0n;
 for(const entry of entries){
  entry.offset=offset;entry.size=BigInt(entry.header.byteLength+entry.value.byteLength);entry.name=encoder.encode(entry.key+'.npy');
  const {bytes,v}=block(30+entry.name.length+20);v.setUint32(0,0x04034b50,true);v.setUint16(4,45,true);v.setUint16(6,8,true);v.setUint16(12,33,true);v.setUint32(18,0xffffffff,true);v.setUint32(22,0xffffffff,true);v.setUint16(26,entry.name.length,true);v.setUint16(28,20,true);bytes.set(entry.name,30);const e=30+entry.name.length;v.setUint16(e,1,true);v.setUint16(e+2,16,true);v.setBigUint64(e+4,entry.size,true);v.setBigUint64(e+12,entry.size,true);
  yield bytes;offset+=BigInt(bytes.length);let crc=update(0xffffffff,entry.header);yield entry.header;offset+=BigInt(entry.header.length);
  const input=new Uint8Array(entry.value.buffer,entry.value.byteOffset,entry.value.byteLength);
  for(let start=0;start<input.length;start+=CHUNK){let part=input.subarray(start,start+CHUNK);if(!little){part=part.slice();for(let at=0;at<part.length;at+=4){[part[at],part[at+3]]=[part[at+3],part[at]];[part[at+1],part[at+2]]=[part[at+2],part[at+1]];}}crc=update(crc,part);yield part;offset+=BigInt(part.length);}
  entry.crc=(crc^0xffffffff)>>>0;const descriptor=block(24);descriptor.v.setUint32(0,0x08074b50,true);descriptor.v.setUint32(4,entry.crc,true);descriptor.v.setBigUint64(8,entry.size,true);descriptor.v.setBigUint64(16,entry.size,true);yield descriptor.bytes;offset+=24n;
 }
 const central=offset;
 for(const entry of entries){const {bytes,v}=block(46+entry.name.length+28);v.setUint32(0,0x02014b50,true);v.setUint16(4,45,true);v.setUint16(6,45,true);v.setUint16(8,8,true);v.setUint16(14,33,true);v.setUint32(16,entry.crc,true);v.setUint32(20,0xffffffff,true);v.setUint32(24,0xffffffff,true);v.setUint16(28,entry.name.length,true);v.setUint16(30,28,true);v.setUint32(42,0xffffffff,true);bytes.set(entry.name,46);const e=46+entry.name.length;v.setUint16(e,1,true);v.setUint16(e+2,24,true);v.setBigUint64(e+4,entry.size,true);v.setBigUint64(e+12,entry.size,true);v.setBigUint64(e+20,entry.offset,true);yield bytes;offset+=BigInt(bytes.length);}
 const end64=offset,size=offset-central,record=block(56);record.v.setUint32(0,0x06064b50,true);record.v.setBigUint64(4,44n,true);record.v.setUint16(12,45,true);record.v.setUint16(14,45,true);record.v.setBigUint64(24,BigInt(entries.length),true);record.v.setBigUint64(32,BigInt(entries.length),true);record.v.setBigUint64(40,size,true);record.v.setBigUint64(48,central,true);yield record.bytes;
 const locator=block(20);locator.v.setUint32(0,0x07064b50,true);locator.v.setBigUint64(8,end64,true);locator.v.setUint32(16,1,true);yield locator.bytes;
 const end=block(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,0xffff,true);end.v.setUint16(10,0xffff,true);end.v.setUint32(12,0xffffffff,true);end.v.setUint32(16,0xffffffff,true);yield end.bytes;
}
async function* jsonTokens(value){
 if(ArrayBuffer.isView(value)){
  yield '[';for(let start=0;start<value.length;start+=8192){if(start)yield ',';yield JSON.stringify(Array.from(value.subarray(start,start+8192))).slice(1,-1);}yield ']';
 }else if(Array.isArray(value)){
  yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';if(ArrayBuffer.isView(value))yield JSON.stringify(value[i]);else yield* jsonTokens(value[i]===undefined?null:value[i]);}yield ']';
 }else if(value&&typeof value==='object'){
  yield '{';let first=true;for(const [key,item]of Object.entries(value)){if(item===undefined||typeof item==='function')continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';yield* jsonTokens(item);}yield '}';
 }else yield JSON.stringify(value)??'null';
}
export async function* jsonChunks(result){let text='';for await(const token of jsonTokens(result)){text+=token;if(text.length>=65536){yield encoder.encode(text);text='';}}if(text)yield encoder.encode(text);}
export function energyExportChunks(result,format){if(result?.operation!=='ela.energy'||result.status!=='ok')throw Error('Completed energy result required');if(format==='npz')return npzChunks(result);if(format==='json')return jsonChunks(result);throw Error('Unknown export format');}
