import {wasmAllocationFailure,nativeModuleFailure,copyTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
export const SEPARATION_HEAP_BYTES=64*1024**2;let pending,ready;
export async function initSeparationWasm({wasmBinary}={}){const {default:create}=await import('../vendor/separation/separation-nlm16.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const separationHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
// Passive owner snapshot: no initialization, allocation or calibration.
export const separationRuntimeState=()=>({phase:ready?'ready':pending?'pending':'cold',heapBytes:separationHeapBytes()});
async function instance(){try{return ready??(pending?await pending:await initSeparationWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local separation arithmetic module could not load.');}}
// NLM uses the native7x7 template and21x21 search regardless of UI strength.
export const separationHalo=p=>p.mode===4?13:p.radius;
export const NATIVE16_NLM_LAYOUT=Object.freeze({patch:7,search:21,halo:13,rollingBytes:8,baseBytes:4*1024**2,mallocSlackBytes:16*32});
export function native16NlmWorkspacePlan(width,height,rows=height,grayscale=false){
 requireValue([width,height,rows].every(Number.isSafeInteger)&&width>0&&height>0&&rows>0&&rows<=height&&typeof grayscale==='boolean','Invalid native16 NLM workspace geometry.');
 const {patch,search,halo,rollingBytes,baseBytes,mallocSlackBytes}=NATIVE16_NLM_LAYOUT,n=width*height,r=width*rows,padded=(width+2*halo)*(height+2*halo),tableBytes=4*(Math.floor(65025*(grayscale?1:2)/(64/49))+1),rollingBytesTotal=(width+patch+1)*search*search*rollingBytes;
 const preparationBytes=grayscale?8*n+6*r:30*n+6*r,filterBytes=grayscale?8*n+8*r+2*padded+rollingBytesTotal+tableBytes:18*n+18*r+12*padded+rollingBytesTotal+tableBytes,finishBytes=grayscale?8*n+8*r:6*n+42*r;
 const workspaceBytes=Math.max(preparationBytes,filterBytes,finishBytes)+baseBytes+mallocSlackBytes;requireValue(Number.isSafeInteger(workspaceBytes),'Unsafe native16 NLM workspace.');
 return{known:true,width,height,rows,grayscale,halo,sourcePixels:n,outputPixels:r,paddedPixels:padded,tableBytes,rollingBytes:rollingBytesTotal,preparationBytes,filterBytes,finishBytes,baseBytes,mallocSlackBytes,workspaceBytes};
}
export const separationWorkspace=(width,height,p,sampleDepth=8,rows=height)=>sampleDepth===16&&p.mode===4?native16NlmWorkspacePlan(width,height,rows,p.grayscale).workspaceBytes:width*height*(sampleDepth===16?64:32)+(p.mode===4?width*21*21*4:0)+4*1024**2;
export async function separationRows(image,p,start,rows,hooks={}){return runRows(image,p,start,rows,hooks);}
export async function separationObservedRows(image,p,start,rows,membership,hooks={}){return runRows(image,p,start,rows,{...hooks,membership});}
export async function separationNlmRows(image,p,start,rows,hooks={}){return runRows(image,p,start,rows,{...hooks,nlmRowsOnly:true});}
export async function separationNlmPoints(image,p,hooks={}){return runRows(image,p,13,1,{...hooks,nlmPoints:true});}
async function runRows(image,p,start,rows,{signal,membership,nlmRowsOnly=false,nlmPoints=false,nativeOriginX=0,nativeWidth=image.width,cooperate}={}){
 const native16=image.data instanceof Uint16Array;
 requireValue(p&&Number.isInteger(p.mode)&&p.mode>=0&&p.mode<=4&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=10&&Number.isInteger(p.sigma)&&p.sigma>=1&&p.sigma<=200&&typeof p.grayscale==='boolean','Invalid separation filter parameters.');
 requireValue([image.width,image.height,start,rows].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&(image.data instanceof Uint8Array||native16)&&image.data.length===image.width*image.height*3,'Invalid separation row window.');
 if(native16)requireValue(membership===undefined&&!nlmPoints,'Native16 separation requires a full-grid typed row window.');
 if(membership!==undefined)requireValue(p.mode<4&&membership instanceof Uint8Array&&membership.length===image.width*image.height&&membership.every(v=>v===0||v===1),'Invalid observed separation membership.');
 if(membership!==undefined)requireValue(Number.isSafeInteger(nativeOriginX)&&nativeOriginX>=0&&Number.isSafeInteger(nativeWidth)&&nativeWidth>=nativeOriginX+image.width,'Invalid observed separation native grid.');
 if(nlmPoints)requireValue(p.mode===4&&image.height===27&&image.width%27===0,'Native NLM points require complete27pixel boundary patches.');
 if(nlmRowsOnly)requireValue(p.mode===4,'Row-only NLM requires native mode4.');
 if(separationWorkspace(image.width,image.height,p,native16?16:8,native16?rows:image.height)>SEPARATION_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Separation row window exceeds its fixed64MiB arithmetic heap.');
 if(p.mode===4)requireValue(cooperate===undefined||typeof cooperate==='function','Invalid NLM cooperation callback.');await(p.mode===4&&cooperate?cooperate():checkpoint(signal));checkAbort(signal);const m=await instance();checkAbort(signal);let source=0,out=0,mask=0;
 try{
  const sourceBytes=image.data.byteLength,outputBytes=image.width*rows*3*(native16?2:1);source=m._malloc(sourceBytes);out=m._malloc(outputBytes);if(!source||!out)throw wasmAllocationFailure(m,'Separation staging exceeds the fixed64MiB heap.',!source?sourceBytes:outputBytes);m.HEAPU8.set(native16?new Uint8Array(image.data.buffer,image.data.byteOffset,image.data.byteLength):image.data,source);
  if(membership){mask=m._malloc(membership.length);if(!mask)throw wasmAllocationFailure(m,'Separation membership staging exceeds the fixed64MiB heap.',membership.length);m.HEAPU8.set(membership,mask);}
  const status=native16?(p.mode===4?m._separation_nlm_rows16(source,image.width,image.height,start,rows,p.radius,Number(p.grayscale),out):m._separation_rows16_ex(source,image.width,image.height,start,rows,p.mode,p.radius,p.sigma,Number(p.grayscale),nativeOriginX,nativeWidth,out)):nlmPoints?m._separation_nlm_points(source,image.width,p.radius,Number(p.grayscale),out):membership?m._separation_observed_rows(source,mask,image.width,image.height,start,rows,p.mode,p.radius,p.sigma,Number(p.grayscale),nativeOriginX,nativeWidth,out):nlmRowsOnly?m._separation_nlm_rows(source,image.width,image.height,start,rows,p.radius,Number(p.grayscale),out):m._separation_rows(source,image.width,image.height,start,rows,p.mode,p.radius,p.sigma,Number(p.grayscale),out);if(status!==1)throw (status===-1?wasmAllocationFailure(m,'Separation filter rejected its input or working set.'):new EngineError('INVALID_INPUT','Separation filter rejected its input or working set.'));checkAbort(signal);return copyTypedArray(native16?new Uint16Array(m.HEAPU8.buffer,out,image.width*rows*3):m.HEAPU8.subarray(out,out+image.width*rows*3),{label:'separation-math-output'});
 }finally{if(source)m._free(source);if(out)m._free(out);if(mask)m._free(mask);}
}

export function releaseSeparationWasm(){ready=null;pending=null;}

// Scalar HSV uses only the two explicit wasm staging allocations. The
// fixed base covers static data/stack/allocator state; each malloc gets32bytes
// for header/alignment. Neighborhood work keeps the established64BPP bound,
// including when a GPU blur is supplied, so CPU fallback fits the same band.
export const NATIVE16_ADJUST_BASE_BYTES=4*1024**2;
export const NATIVE16_ADJUST_MALLOC_SLACK=32;
export function native16AdjustWorkspace(width,height,rows,p={}){
 const sourceBytes=width*height*6,outputBytes=width*rows*6,radius=Math.floor((p.sharpen??0)/4);
 requireValue([width,height,rows,sourceBytes,outputBytes].every(Number.isSafeInteger)&&width>0&&height>0&&rows>0&&rows<=height,'Invalid native16 adjustment workspace geometry.');
 const bytes=radius?width*height*64+NATIVE16_ADJUST_BASE_BYTES:sourceBytes+outputBytes+NATIVE16_ADJUST_BASE_BYTES+2*NATIVE16_ADJUST_MALLOC_SLACK;
 requireValue(Number.isSafeInteger(bytes),'Unsafe native16 adjustment workspace.');return bytes;
}
// Internal typed adjustment prefix. No public separation parameter is widened.
// The caller finances target and the existing fixed64MiB arithmetic actor.
export async function native16AdjustRows(image,p,start,rows,{signal,target,blurred,nativeOriginX=0,nativeWidth=image.width}={}){
 requireValue(image.data instanceof Uint16Array&&image.data.length===image.width*image.height*3&&target instanceof Uint16Array&&target.length===image.width*rows*3&&[image.width,image.height,start,rows,nativeOriginX,nativeWidth].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&nativeOriginX>=0&&nativeWidth>=image.width+nativeOriginX,'Invalid native16 adjustment window.');
 requireValue(Number.isInteger(p.brightness)&&p.brightness>=-255&&p.brightness<=255&&Number.isInteger(p.saturation)&&p.saturation>=-255&&p.saturation<=255&&Number.isInteger(p.hue)&&p.hue>=0&&p.hue<=180&&Number.isInteger(p.sharpen)&&p.sharpen>=0&&p.sharpen<=100,'Invalid native16 adjustment prefix parameters.');
 if(blurred!==undefined)requireValue(Math.floor(p.sharpen/4)>0&&blurred instanceof Uint16Array&&blurred.length===target.length,'Invalid native16 prefiltered adjustment rows.');
 if(native16AdjustWorkspace(image.width,image.height,rows,p)>SEPARATION_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Native16 adjustment window exceeds its fixed64MiB arithmetic heap.');
 await checkpoint(signal);checkAbort(signal);const m=await instance();checkAbort(signal);let source=0,out=0,blur=0;
 try{
  source=m._malloc(image.data.byteLength);out=m._malloc(target.byteLength);if(!source||!out)throw wasmAllocationFailure(m,'Native16 adjustment staging allocation failed.',!source?image.data.byteLength:target.byteLength);
  m.HEAPU8.set(new Uint8Array(image.data.buffer,image.data.byteOffset,image.data.byteLength),source);
  if(blurred){blur=m._malloc(blurred.byteLength);if(!blur)throw wasmAllocationFailure(m,'Native16 adjustment blur staging allocation failed.',blurred.byteLength);m.HEAPU8.set(new Uint8Array(blurred.buffer,blurred.byteOffset,blurred.byteLength),blur);}
  requireValue(typeof m._adjust_prefix16_rows==='function','Native16 adjustment arithmetic export is unavailable.');
  const status=m._adjust_prefix16_rows(source,image.width,image.height,start,rows,p.brightness,p.saturation,p.hue,p.sharpen,nativeOriginX,nativeWidth,blur,out);
  if(status!==1)throw(status===-1?wasmAllocationFailure(m,'Native16 adjustment arithmetic allocation failed.'):new EngineError('INVALID_INPUT','Native16 adjustment arithmetic rejected its window.'));
  checkAbort(signal);target.set(new Uint16Array(m.HEAPU8.buffer,out,target.length));return target;
 }finally{if(source)m._free(source);if(out)m._free(out);if(blur)m._free(blur);}
}
