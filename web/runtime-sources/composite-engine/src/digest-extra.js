import {requireValue,EngineError,controlCheckpoint,checkAbort} from './errors.js';

export async function extraImageHashes(image,{signal,account,wasmBinary,onProgress}={}){
 const {width,height,data}=image,n=width*height;
 requireValue(typeof account==='function','Shared digest memory admission required');
 requireValue(image.format==='rgb8'&&Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(n)&&data instanceof Uint8Array&&data.length===n*3,'RGB8 source required');
 if(n*12+16*1024**2>128*1024**2)throw new EngineError('MEMORY_LIMIT','Native perceptual-hash preparation exceeds its current WASM workspace; no input resizing performed');
 await controlCheckpoint(signal);const release=account(128*1024**2);let m,pointer=0;
 try{
  const {default:create}=await import('../vendor/digest-extra/digest.js');m=await create(wasmBinary?{wasmBinary}:{});checkAbort(signal);
  pointer=m._malloc(data.length);if(!pointer)throw new EngineError('MEMORY_LIMIT','Perceptual-hash input allocation failed');m.HEAPU8.set(data,pointer);
  const hashes={};
  for(const [kind,stage,name,Type]of [[2,4,'Color moments',Float64Array],[3,6,'Marr-Hildreth',Uint8Array]]){
   await controlCheckpoint(signal);
   if(!m._digest_extra(pointer,width,height,kind,stage))throw new EngineError('COMPUTE_FAILED','Native perceptual-hash kernel failed');
   const bytes=m.HEAPU8.slice(m._digest_data(),m._digest_data()+m._digest_size());hashes[name]=new Type(bytes.buffer);m._digest_release();onProgress?.(Object.keys(hashes).length/2);
  }
  checkAbort(signal);return hashes;
 }finally{if(m){m._digest_release();if(pointer)m._free(pointer);}release();}
}
