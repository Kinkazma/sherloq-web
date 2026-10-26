import {createSegmentedBytes} from './segmented-bytes.js';
import {requireValue,controlCheckpoint} from './errors.js';
// Interleaved binary32/binary64 real/imaginary pairs, always in global row-major order.
export async function createComplexPlane(width,height,{ArrayType=Float32Array,...options}){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Invalid complex plane dimensions.');requireValue(ArrayType===Float32Array||ArrayType===Float64Array,'Invalid complex plane precision.');const stride=2*ArrayType.BYTES_PER_ELEMENT,store=await createSegmentedBytes(width*height*stride,options);
 const range=(x,y,w,h)=>requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Complex region outside plane.');
 return {width,height,store,ArrayType,
  async read(x,y,w,h,{signal}={}){range(x,y,w,h);const out=new ArrayType(w*h*2),bytes=new Uint8Array(out.buffer);if(x===0&&w===width){await store.readInto(bytes,y*width*stride);return out;}for(let row=0;row<h;row++){if(row%128===0)await controlCheckpoint(signal);await store.readInto(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);}return out;},
  async write(values,x,y,w,h,{signal}={}){range(x,y,w,h);requireValue(values instanceof ArrayType&&values.length===w*h*2,'Complex region size mismatch.');const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);if(x===0&&w===width){await store.write(bytes,y*width*stride);return;}for(let row=0;row<h;row++){if(row%128===0)await controlCheckpoint(signal);await store.write(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);}},
  dispose:()=>store.dispose()
 };
}
