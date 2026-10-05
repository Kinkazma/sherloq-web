import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';

/** Borrowed byte-store view in native NumPy BGR order. The source owner must
 * remain alive and immutable during reads; no source pixels are modified. */
export function automaticBgrBytes(image) {
 const surface=image?.surface??(image?.descriptor&&image),pixels=image?.pixels??image,descriptor=surface?.descriptor??pixels,{width,height}=descriptor??{};
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(width*height*3)&&descriptor.format==='rgb8'&&(surface?typeof surface.readWindow==='function':pixels.data instanceof Uint8Array&&pixels.data.length===width*height*3),'Original decoded RGB8 pixels or qualified surface required.');
 return {width,height,byteLength:width*height*3,async readInto(target,offset=0,{signal}={}){
  requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=width*height*3-target.length,'Invalid decoded BGR byte window.');
  requireValue(surface||target.buffer!==pixels.data.buffer,'Decoded BGR output must not alias the original RGB source.');
  const stride=width*3;let done=0;
  while(done<target.length){await controlCheckpoint(signal);const start=offset+done,top=Math.floor(start/stride),within=start%stride,rows=Math.min(32,height-top,Math.ceil((within+target.length-done)/stride)),length=Math.min(target.length-done,rows*stride-within);let owned;
   try{let bytes;if(surface){owned=await surface.readWindow({x:0,y:top,width,height:rows},{signal});requireValue(owned.pixels?.format==='rgb8'&&owned.pixels.data instanceof Uint8Array&&owned.pixels.data.length===rows*stride,'RGB source returned a different window.');bytes=owned.pixels.data;}else bytes=pixels.data.subarray(top*stride,(top+rows)*stride);
    for(let i=0;i<length;i++){const at=within+i;target[done+i]=bytes[at-at%3+2-at%3];}
   }finally{owned?.release();}done+=length;
  }
  checkAbort(signal);return target;
 }};
}

export async function automaticDecodedBgrSha256(image,{budget,signal,onProgress}={}) {
 const source=automaticBgrBytes(image),size=Math.min(source.byteLength,source.width*3*32),release=budget.reserve(size+512*1024);
 try{const hash=await createSHA256(),bytes=new Uint8Array(size);for(let offset=0;offset<source.byteLength;offset+=size){checkAbort(signal);const part=bytes.subarray(0,Math.min(size,source.byteLength-offset));await source.readInto(part,offset,{signal});hash.update(part);onProgress?.({phase:'automatic-decoded-bgr-sha256',fraction:(offset+part.length)/source.byteLength});}checkAbort(signal);return {sha256:hash.digest('hex'),width:source.width,height:source.height,colorOrder:'BGR',maximumChunkBytes:size};}
 finally{release();}
}
