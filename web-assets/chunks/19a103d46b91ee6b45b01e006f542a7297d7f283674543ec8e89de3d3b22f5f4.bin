import {wasmAllocationFailure,nativeModuleFailure,copyTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
export const ADJUST_HEAP_BYTES=64*1024**2;let ready,pending;
export async function initAdjustWasm({wasmBinary}={}){const {default:create}=await import('../vendor/adjust/adjust.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const adjustHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export const adjustWorkspace=(width,height)=>width*height*48+4*1024**2+256*1024;
async function instance(){try{return ready??(pending?await pending:await initAdjustWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local adjustment arithmetic could not load.');}}
async function invoke(inputs,length,run,{signal}={}){
 await checkpoint(signal);const m=await instance();checkAbort(signal);const pointers=[];let output=0;
 try{
  for(const input of inputs){const bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength),ptr=m._malloc(bytes.length);if(!ptr)throw wasmAllocationFailure(m,'Adjustment staging exceeds the fixed64MiB heap.',bytes.length);pointers.push(ptr);m.HEAPU8.set(bytes,ptr);}
  if(length){output=m._malloc(length);if(!output)throw wasmAllocationFailure(m,'Adjustment output exceeds its fixed heap.',length);}
  const status=run(m,pointers,output);checkAbort(signal);if(!length)return status;if(status!==1)throw (status===-1?wasmAllocationFailure(m,'Adjustment kernel rejected its input or working set.'):new EngineError('INVALID_INPUT','Adjustment kernel rejected its input or working set.'));return copyTypedArray(m.HEAPU8.subarray(output,output+length),{label:'adjust-math-output'});
 }finally{for(const ptr of pointers)m._free(ptr);if(output)m._free(output);}
}
export async function adjustLocalRows(image,p,start,rows,hooks={}){
 requireValue([image.width,image.height,start,rows].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'Invalid adjustment window.');
 if(adjustWorkspace(image.width,image.height)>ADJUST_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Adjustment window exceeds its fixed heap.');
 const params=Float64Array.from(['brightness','saturation','hue','gamma','shadows','highlights','sweep','width','sharpen','threshold','equalize','invert'],k=>Number(p[k]));const limits=[[-255,255],[-255,255],[0,180],[1,50],[-100,100],[-100,100],[0,255],[0,255],[0,100],[0,255],[0,5],[0,1]];requireValue(params.every((v,i)=>Number.isInteger(v)&&v>=limits[i][0]&&v<=limits[i][1]),'Invalid adjustment parameters.');
 return invoke([image.data,params],image.width*rows*3,(m,[a,b],o)=>m._adjust_local_rows(a,image.width,image.height,start,rows,b,o),hooks);
}
export function adjustTileHistogram(bytes,width,rows,y,pw,ph,hooks={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3&&[width,rows,y,pw,ph].every(v=>Number.isSafeInteger(v)&&v<=2147483647)&&width>0&&rows>0&&y>=0&&y+rows<=ph&&pw>=width&&pw<=width+8&&pw%8===0&&ph>0&&ph%8===0,'Invalid global CLAHE histogram geometry.');
 return invoke([bytes],65536,(m,[a],o)=>m._adjust_tile_histogram(a,width,rows,y,pw,ph,o),hooks).then(b=>new Int32Array(b.buffer));
}
export function adjustClaheTables(histograms,area,level,hooks={}){
 requireValue(histograms instanceof Int32Array&&histograms.length===16384&&Number.isSafeInteger(area)&&area>0&&area<=2147483647&&Number.isInteger(level)&&level>=2&&level<=5,'Invalid CLAHE tables.');
 for(let tile=0;tile<64;tile++){const bins=histograms.subarray(tile*256,(tile+1)*256);requireValue(bins.every(v=>v>=0)&&bins.reduce((a,b)=>a+b,0)===area,'Incomplete CLAHE tile histogram.');}
 return invoke([histograms],16384,(m,[a],o)=>m._adjust_tables(a,area,level,o),hooks);
}
export function adjustMapRows(bytes,width,rows,y,pw,ph,kind,tables,hooks={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3&&[width,rows,y,pw,ph].every(v=>Number.isSafeInteger(v)&&v<=2147483647)&&width>0&&rows>0&&y>=0&&y+rows<=ph&&pw>=width&&pw%8===0&&ph>0&&ph%8===0&&[1,2,3,4,5].includes(kind)&&tables instanceof Uint8Array&&tables.length===(kind===1?256:16384),'Invalid global adjustment display.');
 if(adjustWorkspace(width,rows)>ADJUST_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Adjustment display exceeds its fixed heap.');
 return invoke([bytes,tables],bytes.length,(m,[a,t],o)=>m._adjust_map_rows(a,width,rows,y,pw,ph,kind,t,o),hooks);
}
export function adjustOtsu(histogram,count,hooks={}){
 requireValue(histogram instanceof Int32Array&&histogram.length===256&&Number.isSafeInteger(count)&&count>0&&count<=2147483647&&histogram.every(x=>x>=0)&&histogram.reduce((a,b)=>a+b,0)===count,'Invalid Otsu histogram.');
 return invoke([histogram],0,(m,[a])=>m._adjust_otsu(a,count),hooks);
}

export function releaseAdjustWasm(){ready=null;pending=null;}
