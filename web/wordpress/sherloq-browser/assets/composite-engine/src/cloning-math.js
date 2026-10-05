import {m3ImageShape} from './m3-image-shape.js';
import {TypedPages} from './m3-typed-pages.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

let ready,pending;
export const CLONING_HEAP_LIMIT=2*1024**3;
export const cloningHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function initCloningMath({wasmBinary}={}){
  if(ready)return ready;
  pending??=import('../vendor/cloning/cloning.js').then(({default:create})=>create(wasmBinary?{wasmBinary}:{}));
  try{ready=await pending;return ready;}catch(error){pending=null;throw error;}
}
function bound(bytes){
  // This is an admitted maximum heap, not a minimum image-size requirement.
  // A pessimistic pyramid estimate must not reject a valid large source before
  // native detection has attempted its useful work within the actual cap.
  return Math.min(CLONING_HEAP_LIMIT,Math.max(32*1024**2,bytes));
}
export function cloningImageHeapBound(width,height,algorithm='ORB'){
  m3ImageShape(width,height,7);
  requireValue(['ORB','AKAZE','BRISK'].includes(algorithm),'Unsupported copy/move detector.');
  // Full-resolution gray and pyramid, FAST/keypoint intermediates and ORB
  // descriptors, bounded matching batch, allocator and linear-growth margin.
  // AKAZE additionally retains four float planes per evolution level, up to
  // four sublevels over four octaves, keypoint vectors and 61-byte descriptors.
  // Strict 3x3 maxima bound the population by one point per 2x2 cell/layer.
  // The larger multiplier covers their coexistence and vector growth; the
  // fixed margin covers allocator growth and the bounded matching batch.
  return bound(width*height*(algorithm==='AKAZE'?256:192)+160*1024**2);
}
// Paged detection owns its pyramid and workers separately. The remaining
// native image allocation is the RGB renderer, plus allocator/growth margin.
export function cloningPagedHeapBound(width,height){
  cloningImageHeapBound(width,height,'AKAZE');
  return bound(width*height*3+160*1024**2);
}
export function cloningPointHeapBound(count,{matching=false,descriptorSize=61}={}){
  requireValue(Number.isSafeInteger(count)&&count>=0,'Invalid copy/move point count.');
  // Selection: 7 doubles + u32 index. Matching: descriptor staging, up to
  // 64 distance rows, native result vector including realloc coexistence,
  // and the ordered DMatch row. GPU buffers have their own admission.
  return bound(count*(matching?descriptorSize+64*(4+72)+16:60)+160*1024**2);
}
export const cloningCountHeapBound=count=>{
  requireValue(Number.isSafeInteger(count)&&count>=0&&count<=0x7fffffff,'Invalid copy/move angle count.');
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
export async function cloningDetect(gray,mask,width,height,{signal,account=()=>{},algorithm='ORB',pointsOnly=false}={}){
  cloningImageHeapBound(width,height,algorithm);
  requireValue(['ORB','AKAZE','BRISK'].includes(algorithm),'Unsupported copy/move detector.');
  const descriptorSize=algorithm==='ORB'?32:algorithm==='AKAZE'?61:64;
  requireValue(gray instanceof Uint8Array&&gray.length===width*height&&(!mask||mask instanceof Uint8Array&&mask.length===gray.length),'Invalid detector plane.');
  const m=await moduleFor(signal);let source=0,region=0;
  try{
    source=stage(m,gray);if(mask)region=stage(m,mask);
    const count=(algorithm==='ORB'?m._cloning_detect:algorithm==='AKAZE'?m._cloning_detect_akaze:pointsOnly?m._cloning_detect_brisk_points:m._cloning_detect_brisk)(source,region,width,height);if(count===-3)throw new EngineError('MEMORY_LIMIT',algorithm+' exceeded the admitted native heap.');nativeResult(count>=0,algorithm+' detection failed.');checkAbort(signal);
    account(count*(56+(pointsOnly?0:descriptorSize)));
    const at=m._cloning_result()/8;
    return {points:m.HEAPF64.slice(at,at+count*7),descriptors:pointsOnly?new Uint8Array():m.HEAPU8.slice(m._cloning_descriptors(),m._cloning_descriptors()+count*descriptorSize),total:count,descriptorSize,...(pointsOnly?{pointsOnly:true}:{})};
  }finally{m._cloning_release();if(source)m._free(source);if(region)m._free(region);}
}
export async function cloningSelect(detected,response,{signal,account=()=>{}}={}){
  const {points,descriptors,descriptorSize=32}=detected,count=points.length/7;
  requireValue([32,61,64].includes(descriptorSize)&&points instanceof Float64Array&&Number.isSafeInteger(count)&&descriptors instanceof Uint8Array&&descriptors.length===(detected.pointsOnly?0:count*descriptorSize)&&Number.isFinite(response)&&response>=0&&response<=100,'Invalid copy/move selection.');
  const m=await moduleFor(signal);let source=0,indices=0;
  try{
    source=stage(m,points);indices=allocation(m,count*4);
    const length=m._cloning_select(source,count,response,indices);nativeResult(length>=0,'Copy/move response selection failed.');
    account(length*(56+(detected.pointsOnly?0:descriptorSize)));const selected=new Float64Array(length*7),desc=new Uint8Array(detected.pointsOnly?0:length*descriptorSize);
    for(let i=0;i<length;i++){const from=m.HEAPU32[indices/4+i];selected.set(points.subarray(from*7,from*7+7),i*7);if(!detected.pointsOnly)desc.set(descriptors.subarray(from*descriptorSize,from*descriptorSize+descriptorSize),i*descriptorSize);}
    checkAbort(signal);return {points:selected,descriptors:desc,descriptorSize,...(detected.pointsOnly?{pointsOnly:true}:{})};
  }finally{if(source)m._free(source);if(indices)m._free(indices);}
}
// Native orientation and descriptors depend on each selected point and the
// unchanged global gray image, not on other points rejected by response.
export async function cloningDescribeBrisk(selected,gray,width,height,{signal,account=()=>{}}={}){
 const count=selected.points.length/7;if(!count){checkAbort(signal);return {points:selected.points,descriptors:new Uint8Array(),descriptorSize:64};}const m=await moduleFor(signal);let source=0,points=0;
 try{
  source=stage(m,gray);points=stage(m,selected.points);const n=m._cloning_describe_brisk(source,width,height,points,count);
  if(n===-3)throw new EngineError('MEMORY_LIMIT','Selected BRISK descriptors exceeded the admitted native heap.');nativeResult(n===count,'BRISK description changed the selected population.');checkAbort(signal);account(n*120);
  return {points:m.HEAPF64.slice(m._cloning_result()/8,m._cloning_result()/8+n*7),descriptors:m.HEAPU8.slice(m._cloning_descriptors(),m._cloning_descriptors()+n*64),descriptorSize:64};
 }finally{m._cloning_release();if(source)m._free(source);if(points)m._free(points);}
}
export async function cloningMatches(descriptors,radius,{signal,onProgress,account=()=>{},descriptorSize=32,backend='cpu',metrics={}}={}){
  requireValue([32,61,64].includes(descriptorSize)&&descriptors instanceof Uint8Array&&descriptors.length%descriptorSize===0&&Number.isFinite(radius)&&radius>0&&radius<=255,'Invalid Hamming input.');
  const m=await moduleFor(signal),count=descriptors.length/descriptorSize;let gpu,gpuDistances=0,batchRows=64;let source=0,total=0,lastYield=performance.now();const parts=new TypedPages(Float64Array,3,account);
  try{
    source=stage(m,descriptors);
    if(backend!=='cpu'&&count){try{const {createHammingGpu}=await import('./cloning-hamming-gpu.js');gpu=await createHammingGpu(descriptors,descriptorSize,{signal,account});batchRows=gpu.batchRows;gpuDistances=allocation(m,count*batchRows*4);metrics.hammingBackend='webgpu';}catch(error){checkAbort(signal);gpu?.dispose();gpu=null;if(backend==='webgpu')throw error;metrics.hammingFallback=error.message;}}
    metrics.hammingBackend??='cpu';
    for(let start=0;start<count;){
      checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}
      let length;const rows=Math.min(batchRows,count-start);
      if(gpu){try{const distances=await gpu.batch(start,rows);m.HEAPU32.set(distances,gpuDistances/4);length=m._cloning_order_hamming(gpuDistances,count,radius,start,rows);}catch(error){checkAbort(signal);gpu.dispose();gpu=null;if(backend==='webgpu')throw error;metrics.hammingFallback=error.message;metrics.hammingBackend='hybrid';}}
      if(length===undefined)length=descriptorSize===32?m._cloning_match(source,count,radius,start,rows):m._cloning_match_sized(source,count,radius,start,rows,descriptorSize);
      if(length===-3){m._cloning_release();if(batchRows>1){batchRows=Math.max(1,Math.floor(batchRows/2));continue;}throw new EngineError('MEMORY_LIMIT','A complete Hamming row cannot fit the native heap.');}
      nativeResult(length>=0,'Ordered Hamming matching failed.');
      total+=length;const at=m._cloning_result()/8;parts.append(m.HEAPF64.subarray(at,at+length*3));m._cloning_release();
      start+=rows;onProgress?.(Math.min(1,start/count));
    }
    const values=parts.finish();
    checkAbort(signal);return values;
  }finally{parts.dispose();gpu?.dispose();if(gpuDistances)m._free(gpuDistances);m._cloning_release();if(source)m._free(source);}
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
