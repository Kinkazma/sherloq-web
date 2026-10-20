import "../../runtime-context.js?v=0.24.0";
import {inspectJpeg,inspectJpegBlob} from './jpeg.js';
import {checkAbort} from './errors.js';

/** A native RGB domain borrows the original encoded evidence. Never encode the
 * crop to invent quantization tables, or confuse a pixel window with a file. */
export async function inspectOriginalJpeg(image,{signal}={}){
 checkAbort(signal);const original=image.originalSource??image,source=original.source;
 if(source){const signature=await source.read(0,Math.min(2,source.byteLength),{signal});let jpeg;
  try{jpeg=signature.bytes[0]===255&&signature.bytes[1]===216;}finally{signature.release();}
  checkAbort(signal);return jpeg?inspectJpegBlob(source,{signal}):undefined;
 }
 const bytes=original.bytes;return bytes?.[0]===255&&bytes[1]===216?inspectJpeg(bytes):undefined;
}
