import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort} from './errors.js';
// HDF5's ordinary synchronous file driver sees the same random-access file.
// Only its backing storage changes; HDF5 owns layout, chunking and compression.
export function attachHdf5StoredFile(FS,name,store,{size=store.byteLength,writable=false,signal}={}){
 requireValue(Number.isSafeInteger(size)&&size>=0&&size<=store.byteLength&&typeof store.readInto==='function'&&(!writable||typeof store.write==='function'),'Invalid HDF5 encoded store.');
 const node=FS.create(name,writable?438:292);node.usedBytes=size;let failure;
 const sync=(fn)=>{try{checkAbort(signal);const value=fn();if(value?.then)throw new EngineError('STORAGE_UNAVAILABLE','HDF5 requires synchronous RAM or dedicated-worker OPFS storage.');return value;}catch(e){failure=e;throw e;}};
 const bounds=(position,length)=>requireValue(Number.isSafeInteger(position)&&Number.isSafeInteger(length)&&position>=0&&length>=0&&position<=store.byteLength-length,'HDF5 file exceeds its admitted encoded capacity.');
 node.node_ops={...node.node_ops,setattr(n,attr){sync(()=>{for(const key of ['mode','atime','mtime','ctime'])if(attr[key]!=null)n[key]=attr[key];if(attr.size!==undefined){requireValue(writable,'Read-only HDF5 file.');bounds(0,attr.size);if(attr.size<n.usedBytes)throw new EngineError('STORAGE_IO','Unexpected HDF5 truncation of a live encoded store.');n.usedBytes=attr.size;}});}};
 node.stream_ops={...node.stream_ops,
  read(stream,buffer,offset,length,position){return sync(()=>{const count=Math.min(length,Math.max(0,node.usedBytes-position));bounds(position,count);const view=new Uint8Array(buffer.buffer,buffer.byteOffset+offset,count);const r=store.readInto(view,position);if(r?.then)return r;return count;});},
  write(stream,buffer,offset,length,position){return sync(()=>{requireValue(writable,'Read-only HDF5 file.');bounds(position,length);const r=store.write(new Uint8Array(buffer.buffer,buffer.byteOffset+offset,length),position);if(r?.then)return r;node.usedBytes=Math.max(node.usedBytes,position+length);return length;});},
  fsync(){return sync(()=>store.flush?.());},
  mmap(){throw new EngineError('UNSUPPORTED_LAYOUT','HDF5 encoded mapping is unavailable; use its ordinary file driver.');}
 };
 return {get byteLength(){return node.usedBytes;},check(){if(failure)throw failure;},dispose(){FS.unlink(name);}};
}
