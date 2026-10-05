import "../../runtime-context.js?v=0.14.5";
import {createNeuralTensor} from './neural-tensor-store.js';
import {createRgbSurface} from './rgb-surface.js';
import {requireValue,EngineError,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2;
/** Original JPEG DCT categories/table, extracted once through libjpeg. Only
 * encoded input and libjpeg coefficient arrays occupy its WASM heap. RGB is
 * read from the original decoder's raw, unoriented surface without a second
 * full decode/copy. Native CAT-Net pads RGB with 127.5, not repeated edges. */
export async function catnetSourceTensors(image,{jpegFactory,budget,getTemporarySession,signal,onProgress,storage='auto'}={}){
 requireValue(image.segmented&&image.source&&image.store&&image.surface,'An original segmented JPEG is required.');
 const d=image.surface.descriptor,width=d.sourceWidth,height=d.sourceHeight,pw=Math.ceil(width/8)*8,ph=Math.ceil(height/8)*8,n=pw*ph;
 const cap=Math.ceil((image.source.byteLength+n*6+64*MiB)*1.3/(16*MiB))*16*MiB;
 if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','Stored JPEG coefficient arrays exceed the bounded CAT-Net codec heap.');
 let module,ip,tp,op,handle,codes,retained=false;
 try{
  budget.retain(cap);retained=true;module=await jpegFactory({wasmMemory:new WebAssembly.Memory({initial:256,maximum:cap/65536})});checkAbort(signal);
  const alloc=size=>{const p=module._malloc(size);if(!p)throw new EngineError('MEMORY_ALLOCATION','CAT-Net coefficient allocation failed.');return p;};
  ip=alloc(image.source.byteLength);tp=alloc(256);const step=128;op=alloc(pw*step);
  await image.source.visit((bytes,offset)=>module.HEAPU8.set(bytes,ip+offset),{signal});
  handle=module._catnet_coeff_open(ip,image.source.byteLength,tp,width,height);if(!handle)throw new EngineError('PREPARATION_FAILED','CAT-Net requires valid stored grayscale/RGB JPEG coefficients.');
  const table={data:module.HEAPF32.slice(tp/4,tp/4+64),dims:[1,1,8,8]};
  codes=await createNeuralTensor(1,ph,pw,{budget,signal,storage:storage==='auto'?(n*4>budget.limit/12?'temporary':'memory'):storage,getTemporarySession});
  for(let top=0;top<ph;top+=step){
   await controlCheckpoint(signal);const rows=Math.min(step,ph-top),count=pw*rows;
   if(!module._catnet_coeff_rows(handle,top,rows,op))throw new EngineError('PREPARATION_FAILED','Stored JPEG coefficient row extraction failed.');
   const release=budget.reserve(count*4);try{const data=Float32Array.from(module.HEAPU8.subarray(op,op+count));await codes.writeRows(top,rows,data,{signal});}finally{release();}
   onProgress?.({phase:'catnet-original-coefficients',completed:top+rows,total:ph});
  }
  const closed=module._catnet_coeff_close(handle);handle=0;if(!closed)throw new EngineError('PREPARATION_FAILED','JPEG coefficient stream did not finish cleanly.');
  const raw=createRgbSurface(image.store,{width,height,orientation:1,budget,ownsStore:false}),rgb={channels:3,width:pw,height:ph,async readRows(top,rows,{signal}={}){
   const release=budget.reserve(pw*rows*12);let part;try{const data=new Float32Array(pw*rows*3),available=Math.max(0,Math.min(rows,height-top));
    if(available){part=await raw.readWindow({x:0,y:top,width,height:available},{signal});for(let y=0;y<available;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)data[c*rows*pw+y*pw+x]=(part.pixels.data[(y*width+x)*3+c]-127.5)/127.5;}
    checkAbort(signal);return {data,dims:[1,3,rows,pw],release};
   }catch(e){release();throw e;}finally{part?.release();}
  }};
  return {rgb,codes,table,metadata:{source_shape:[height,width],padded_shape:[ph,pw],orientation:d.orientation,jpeg_source:'original',jpeg_sha256:image.sha256},async release(){await codes.dispose();await raw.dispose();}};
 }catch(e){await codes?.dispose();throw e;}finally{if(handle)module._catnet_coeff_close(handle);for(const p of [ip,tp,op])if(p)module._free(p);module=null;if(retained)budget.retained-=cap;}
}
