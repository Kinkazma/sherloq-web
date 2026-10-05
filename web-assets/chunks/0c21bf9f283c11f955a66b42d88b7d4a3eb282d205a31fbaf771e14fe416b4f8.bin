import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

let ready,pending;
export const CLONING_HEAP_LIMIT=1024**3;
export const cloningHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function initCloningMath({wasmBinary}={}){
  if(ready)return ready;
  pending??=import('../vendor/cloning/cloning.js').then(({default:create})=>create(wasmBinary?{wasmBinary}:{}));
  try{ready=await pending;return ready;}catch(error){pending=null;throw error;}
}
function bound(bytes){
  if(bytes>CLONING_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Copy/move arithmetic exceeds its WASM staging limit.');
  return Math.max(32*1024**2,bytes);
}
export function cloningImageHeapBound(width,height,algorithm='ORB'){
  requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=7&&height>=7&&width<=16384&&height<=16384,'Copy/move detection needs dimensions from 7 to 16384.');
  requireValue(algorithm==='ORB'||algorithm==='AKAZE','Unsupported copy/move detector.');
  // Full-resolution gray and pyramid, FAST/keypoint intermediates and ORB
  // descriptors, bounded matching batch, allocator and linear-growth margin.
  // AKAZE additionally retains four float planes per evolution level, up to
  // four sublevels over four octaves, keypoint vectors and 61-byte descriptors.
  // Strict 3x3 maxima bound the population by one point per 2x2 cell/layer.
  // The larger multiplier covers their coexistence and vector growth; the
  // fixed margin covers allocator growth and the bounded matching batch.
  return bound(width*height*(algorithm==='AKAZE'?256:192)+160*1024**2);
}
export const cloningCountHeapBound=count=>{
  requireValue(Number.isSafeInteger(count)&&count>=0&&count<=128*1024**2/8,'Invalid copy/move angle count.');
  return bound(count*40+160*1024**2);
};
async function moduleFor(signal){
  await controlCheckpoint(signal);
  let m;try{m=await initCloningMath();}catch(error){throw new EngineError('CODEC_UNAVAILABLE','Local copy/move arithmetic module could not load.');}checkAbort(signal);return m;
}
function allocation(m,bytes){const p=m._malloc(Math.max(1,bytes));if(!p)throw new EngineError('MEMORY_LIMIT','Copy/move staging allocation failed.');return p;}
function stage(m,array){const p=allocation(m,array.byteLength);m.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),p);return p;}
function nativeResult(ok,message){if(!ok)throw new EngineError('NUMERIC_RANGE',message);}

// Internal primitives require the caller's shared-budget admission. account()
// admits JS output copies before they are materialized; no detached pool budget.
export async function cloningDetect(gray,mask,width,height,{signal,account=()=>{},algorithm='ORB'}={}){
  cloningImageHeapBound(width,height,algorithm);
  requireValue(algorithm==='ORB'||algorithm==='AKAZE','Unsupported copy/move detector.');
  const descriptorSize=algorithm==='ORB'?32:61;
  requireValue(gray instanceof Uint8Array&&gray.length===width*height&&(!mask||mask instanceof Uint8Array&&mask.length===gray.length),'Invalid detector plane.');
  const m=await moduleFor(signal);let source=0,region=0;
  try{
    source=stage(m,gray);if(mask)region=stage(m,mask);
    const count=(algorithm==='ORB'?m._cloning_detect:m._cloning_detect_akaze)(source,region,width,height);nativeResult(count>=0,algorithm+' detection failed.');checkAbort(signal);
    account(count*(56+descriptorSize));
    const at=m._cloning_result()/8;
    return {points:m.HEAPF64.slice(at,at+count*7),descriptors:m.HEAPU8.slice(m._cloning_descriptors(),m._cloning_descriptors()+count*descriptorSize),total:count,descriptorSize};
  }finally{m._cloning_release();if(source)m._free(source);if(region)m._free(region);}
}
export async function cloningSelect(detected,response,{signal,account=()=>{}}={}){
  const {points,descriptors,descriptorSize=32}=detected,count=points.length/7;
  requireValue([32,61].includes(descriptorSize)&&points instanceof Float64Array&&Number.isSafeInteger(count)&&descriptors instanceof Uint8Array&&descriptors.length===count*descriptorSize&&Number.isFinite(response)&&response>=0&&response<=100,'Invalid copy/move selection.');
  const m=await moduleFor(signal);let source=0,indices=0;
  try{
    source=stage(m,points);indices=allocation(m,count*4);
    const length=m._cloning_select(source,count,response,indices);nativeResult(length>=0,'Copy/move response selection failed.');
    if(length>30000)throw new EngineError('MEMORY_LIMIT','More than 30000 filtered keypoints. Reduce Response explicitly.');
    account(length*(56+descriptorSize));const selected=new Float64Array(length*7),desc=new Uint8Array(length*descriptorSize);
    for(let i=0;i<length;i++){const from=m.HEAPU32[indices/4+i];selected.set(points.subarray(from*7,from*7+7),i*7);desc.set(descriptors.subarray(from*descriptorSize,from*descriptorSize+descriptorSize),i*descriptorSize);}
    checkAbort(signal);return {points:selected,descriptors:desc,descriptorSize};
  }finally{if(source)m._free(source);if(indices)m._free(indices);}
}
export async function cloningMatches(descriptors,radius,{signal,onProgress,account=()=>{},descriptorSize=32}={}){
  requireValue([32,61].includes(descriptorSize)&&descriptors instanceof Uint8Array&&descriptors.length%descriptorSize===0&&descriptors.length/descriptorSize<=30000&&Number.isFinite(radius)&&radius>0&&radius<=255,'Invalid Hamming input.');
  const m=await moduleFor(signal),count=descriptors.length/descriptorSize;let source=0,total=0,lastYield=performance.now();const parts=[];
  try{
    source=stage(m,descriptors);
    for(let start=0;start<count;start+=64){
      checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}
      const length=descriptorSize===32?m._cloning_match(source,count,radius,start,Math.min(64,count-start)):m._cloning_match_sized(source,count,radius,start,Math.min(64,count-start),descriptorSize);nativeResult(length>=0,'Ordered Hamming matching failed.');
      total+=length;if(total*24>256*1024**2)throw new EngineError('MEMORY_LIMIT','Matching exceeds the native 256 MiB result budget. Reduce Matching or Response explicitly.');
      account(length*24);const at=m._cloning_result()/8;parts.push(m.HEAPF64.slice(at,at+length*3));m._cloning_release();
      onProgress?.(Math.min(1,(start+64)/count));
    }
    account(total*24);const values=new Float64Array(total*3);let at=0;for(const part of parts){values.set(part,at);at+=part.length;}
    checkAbort(signal);return values;
  }finally{m._cloning_release();if(source)m._free(source);}
}
export async function cloningNormFunction({signal}={}){const m=await moduleFor(signal);return (x,y)=>m._cloning_norm(x,y);}
export async function cloningRegionCount(angles,{signal}={}){
  requireValue(angles instanceof Float32Array,'Float32 angles required.');cloningCountHeapBound(angles.length);
  const m=await moduleFor(signal);let source=0;
  try{source=stage(m,angles);const count=m._cloning_count(source,angles.length);nativeResult(count>=0,'Copy/move region counting failed.');checkAbort(signal);return count;}finally{if(source)m._free(source);}
}
export async function cloningRenderer(image,{signal}={}){
  requireValue(image.format==='rgb8'&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'RGB8 rendering source required.');
  const m=await moduleFor(signal);let output=0,scratch=0,disposed=false,lastYield=performance.now();
  try{output=stage(m,image.data);scratch=allocation(m,512*7*8);}catch(error){if(output)m._free(output);throw error;}
  const alive=()=>{requireValue(!disposed,'Renderer disposed.');checkAbort(signal);};
  const yieldIfNeeded=async()=>{if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  return {
    async points(values){alive();requireValue(values instanceof Float64Array&&values.length%7===0&&values.length/7<=512,'Invalid point drawing batch.');await yieldIfNeeded();m.HEAPF64.set(values,scratch/8);nativeResult(m._cloning_draw_points(output,image.width,image.height,scratch,values.length/7),'Keypoint drawing failed.');},
    async matches(values,hide){alive();requireValue(values instanceof Int32Array&&values.length%8===0&&values.length/8<=128&&typeof hide==='boolean','Invalid match drawing batch.');await yieldIfNeeded();m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),scratch);nativeResult(m._cloning_draw_matches(output,image.width,image.height,scratch,values.length/8,hide),'Match drawing failed.');},
    pixels(){alive();return m.HEAPU8.slice(output,output+image.data.byteLength);},
    dispose(){if(!disposed){disposed=true;m._free(output);m._free(scratch);}}
  };
}
