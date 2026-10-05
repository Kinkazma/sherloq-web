import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
// NumPy NPY 1.0 in a stored ZIP; shapes/types retained, no pickle payloads.
// Specification: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
const encoder=new TextEncoder(),littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(descr,shape){let text="{'descr': '"+descr+"', 'fortran_order': False, 'shape': ("+shape.join(', ')+(shape.length===1?',':'')+")}";text+=' '.repeat((64-(10+text.length+1)%64)%64)+'\n';const b=new Uint8Array(10+text.length);b.set([147,78,85,77,80,89,1,0]);new DataView(b.buffer).setUint16(8,text.length,true);b.set(encoder.encode(text),10);return b;}
export function zeroNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'ZERO array geometry required.');const n=d.width*d.height,entries=[];
 for(const key of ['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg','grid_log10_nfa']){
  const value=d[key],floating=key.startsWith('luminance')||key==='grid_log10_nfa',shape=key==='grid_log10_nfa'?[64]:[d.height,d.width];requireValue(value instanceof (floating?Float64Array:Int32Array)&&value.length===(shape.length===1?64:n),'Invalid ZERO export array.');entries.push({key,value,header:header(floating?'<f8':'<i4',shape),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
export function noisesnifferNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'Noisesniffer array geometry required.');const n=d.width*d.height,entries=[];
 for(const key of ['mask','distribution','all_blocks','low_noise_blocks','selected','low_noise']){
  const value=d[key],indices=key==='selected'||key==='low_noise',floating=key==='all_blocks'||key==='low_noise_blocks',rgb=key==='distribution';
  const Type=indices?Uint32Array:floating?Float64Array:Uint8Array,shape=indices?[value?.length]:floating?[d.gridHeight,d.gridWidth]:rgb?[d.height,d.width,3]:[d.height,d.width];
  requireValue(value instanceof Type&&shape.every(v=>Number.isSafeInteger(v)&&v>=0)&&value.length===shape.reduce((a,b)=>a*b,1),'Invalid Noisesniffer export array.');
  entries.push({key,value,header:header(indices?'<i8':floating?'<f8':'|u1',shape),bytes:indices?value.length*8:value.byteLength,floating,int64:indices,bgr:rgb});
 }
 return writeNpz(result,maxBytes,entries);
}
export function energyNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'Energy array geometry required');const n=d.width*d.height,entries=[];
 for(const key of ['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']){
  const value=d[key],floating=key!=='energy_scope'&&key!=='energy_labels',shape=key==='energy_planes'?[3,d.height,d.width]:[d.height,d.width];
  requireValue(value instanceof(floating?Float32Array:Int32Array)&&value.length===(key==='energy_planes'?3*n:n),'Invalid energy export array');
  entries.push({key,value,header:header(floating?'<f4':'<i4',shape),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
function writeNpz(result,maxBytes,entries){
 function jsonBound(v){if(v===null||typeof v!=='object')return typeof v==='string'?v.length*6+2:32;return Object.entries(v).reduce((n,[k,x])=>n+k.length*6+jsonBound(x)+4,2);}
 const d=result.data;
 const admission=32768+entries.reduce((n,e)=>n+e.bytes,0)+4*(jsonBound(d.metadata)+jsonBound(result.provenance));if(admission>maxBytes)throw new EngineError('MEMORY_LIMIT','NPZ export exceeds its conservative preparation budget.');
 for(const [key,value] of [['metadata_json',d.metadata],['browser_provenance_json',result.provenance]]){const points=Array.from(JSON.stringify(value),x=>x.codePointAt(0));entries.push({key,points,header:header('<U'+points.length,[]),bytes:points.length*4});}
 let total=22;for(const e of entries){e.name=encoder.encode(e.key+'.npy');e.size=e.header.length+e.bytes;total+=30+46+e.name.length*2+e.size;}
 if(total>maxBytes||total>0xffffffff)throw new EngineError('MEMORY_LIMIT','NPZ export exceeds its byte budget.');
 const out=new Uint8Array(total),view=new DataView(out.buffer);let at=0;
 for(const e of entries){e.offset=at;view.setUint32(at,0x04034b50,true);view.setUint16(at+4,20,true);view.setUint16(at+12,33,true);view.setUint32(at+18,e.size,true);view.setUint32(at+22,e.size,true);view.setUint16(at+26,e.name.length,true);out.set(e.name,at+30);const start=at+30+e.name.length;out.set(e.header,start);const data=start+e.header.length;
  if(e.points)e.points.forEach((v,i)=>view.setUint32(data+i*4,v,true));
  else if(e.int64)for(let i=0;i<e.value.length;i++)view.setBigInt64(data+i*8,BigInt(e.value[i]),true);
  else if(e.bgr)for(let i=0;i<e.value.length;i+=3){out[data+i]=e.value[i+2];out[data+i+1]=e.value[i+1];out[data+i+2]=e.value[i];}
  else if(littleEndian||e.value.BYTES_PER_ELEMENT===1)out.set(new Uint8Array(e.value.buffer,e.value.byteOffset,e.value.byteLength),data);
  else for(let i=0;i<e.value.length;i++)if(e.floating){if(e.value.BYTES_PER_ELEMENT===4)view.setFloat32(data+i*4,e.value[i],true);else view.setFloat64(data+i*8,e.value[i],true);}else view.setInt32(data+i*4,e.value[i],true);
  e.crc=crc32(out.subarray(start,start+e.size));view.setUint32(at+14,e.crc,true);at=start+e.size;
 }
 const central=at;
 for(const e of entries){view.setUint32(at,0x02014b50,true);view.setUint16(at+4,20,true);view.setUint16(at+6,20,true);view.setUint16(at+14,33,true);view.setUint32(at+16,e.crc,true);view.setUint32(at+20,e.size,true);view.setUint32(at+24,e.size,true);view.setUint16(at+28,e.name.length,true);view.setUint32(at+42,e.offset,true);out.set(e.name,at+46);at+=46+e.name.length;}
 view.setUint32(at,0x06054b50,true);view.setUint16(at+8,entries.length,true);view.setUint16(at+10,entries.length,true);view.setUint32(at+12,at-central,true);view.setUint32(at+16,central,true);return {mime:'application/zip',bytes:out};
}
