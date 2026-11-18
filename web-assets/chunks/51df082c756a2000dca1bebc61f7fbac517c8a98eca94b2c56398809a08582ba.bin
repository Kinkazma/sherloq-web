import "../../runtime-context.js?v=0.33.3";
import {createSegmentedBytes} from './segmented-bytes.js';
import {createComplexPlane} from './segmented-complex-plane.js';
import {requireValue,controlCheckpoint,checkAbort} from './errors.js';
// Region transfers preserve the row-major global layout. Callers reserve strip
// staging separately, allowing several cooperating planes under one workspace.
// A transaction may supply its own cooperator per transfer. Never retain that
// callback or its signal in a plane reused by a later request.
export async function createFloatPlane(width,height,{ArrayType=Float64Array,columnTransport=false,...options}){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Invalid float plane.');
 requireValue(ArrayType===Float32Array||ArrayType===Float64Array,'Invalid float plane precision.');const stride=ArrayType.BYTES_PER_ELEMENT;
 requireValue(typeof columnTransport==='boolean','Invalid float column transport policy.');
 const range=(x,y,w,h)=>requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Float region outside plane.');
 if(columnTransport){
  // Scalar axes share the existing admitted transform transport. Only planes
  // born temporary use physical tiles; the public grid remains row-major.
  const plane=await createComplexPlane(width,height,{...options,ArrayType,components:1,rowSlabBytes:0,temporaryTileSize:128});
  return {width,height,store:plane.store,maximum:0,read:plane.read,transportMetrics:plane.transportMetrics,
   async write(values,x,y,w,h,{signal,cooperate}={}){range(x,y,w,h);requireValue(cooperate===undefined||typeof cooperate==='function','Invalid float transfer cooperator.');if(cooperate)checkAbort(signal);requireValue(values instanceof ArrayType&&values.length===w*h,'Float region precision or size mismatch.');for(const v of values)this.maximum=Math.max(this.maximum,Math.abs(v));return plane.write(values,x,y,w,h,{signal,cooperate});},
   dispose:plane.dispose
  };
 }
 const store=await createSegmentedBytes(width*height*stride,options);
 return {width,height,store,maximum:0,
  async read(x,y,w,h,{signal,cooperate}={}){range(x,y,w,h);requireValue(cooperate===undefined||typeof cooperate==='function','Invalid float transfer cooperator.');if(cooperate)checkAbort(signal);const out=new ArrayType(w*h),bytes=new Uint8Array(out.buffer);if(x===0&&w===width){await store.readInto(bytes,y*width*stride);if(cooperate)checkAbort(signal);return out;}for(let row=0;row<h;row++){if(row%128===0){if(cooperate)checkAbort(signal);await (cooperate??controlCheckpoint)(signal);if(cooperate)checkAbort(signal);}const pending=store.readInto(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);if(pending&&typeof pending.then==='function')await pending;}if(cooperate)checkAbort(signal);return out;},
  async write(values,x,y,w,h,{signal,cooperate}={}){range(x,y,w,h);requireValue(cooperate===undefined||typeof cooperate==='function','Invalid float transfer cooperator.');if(cooperate)checkAbort(signal);requireValue(values instanceof ArrayType&&values.length===w*h,'Float region precision or size mismatch.');for(const v of values)this.maximum=Math.max(this.maximum,Math.abs(v));const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);if(x===0&&w===width){await store.write(bytes,y*width*stride);if(cooperate)checkAbort(signal);return;}for(let row=0;row<h;row++){if(row%128===0){if(cooperate)checkAbort(signal);await (cooperate??controlCheckpoint)(signal);if(cooperate)checkAbort(signal);}const pending=store.write(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);if(pending&&typeof pending.then==='function')await pending;}if(cooperate)checkAbort(signal);},
  dispose:()=>store.dispose()
 };
}
