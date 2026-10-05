import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
let ready,pending;
export const frequencyStreamHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function frequencyStreamMath(){
 if(!pending)pending=import('../vendor/frequency-stream/frequency-stream.js').then(({default:create})=>create()).then(m=>ready=m).catch(error=>{pending=null;throw error;});const m=await pending;
 const run=(values,fn)=>{let p=0;try{p=m._malloc(Math.max(4,values.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','DFT strip allocation failed.');m.HEAPF32.set(values,p/4);if(!fn(p))throw new EngineError('INVALID_INPUT','DFT strip failed.');const at=m._frequency_stream_data()/4;return m.HEAPF32.slice(at,at+m._frequency_stream_size());}finally{m._frequency_stream_release();if(p)m._free(p);}};
 return {
  gaussian8:(values,width,height,radius)=>run(values,p=>m._frequency_stream_gaussian8(p,width,height,radius)),
  optimal:n=>m._frequency_stream_optimal(n),
  polar:(values,{reconstruction=false,offset=0,total=values.length/2,columns=total}={})=>run(values,p=>m._frequency_stream_polar(p,values.length/2,+reconstruction,offset,total,columns)),
  normalize:(values,lo,hi)=>run(values,p=>m._frequency_stream_normalize(p,values.length,lo,hi)),
  maskWeights:(width,height,smooth)=>run(new Float32Array(),()=>m._frequency_stream_mask_weights(width,height,smooth)),
  maskHorizontal:(width,height,top,rows,split,smooth)=>run(new Float32Array(),()=>m._frequency_stream_mask_horizontal(width,height,top,rows,split,smooth)),
  maskVertical:(values,width,height,columns,smooth)=>run(values,p=>m._frequency_stream_mask_vertical(p,width,height,columns,smooth)),
  axis(values,length,lines,globalCount,mode){requireValue(values instanceof Float32Array&&Number.isInteger(length)&&length>0&&Number.isInteger(lines)&&lines>0&&Number.isInteger(globalCount)&&globalCount>0&&Number.isInteger(mode)&&mode>=0&&mode<=3&&values.length===length*lines*(mode===0?1:2),'Invalid complete DFT axes.');return run(values,p=>m._frequency_stream_axis(p,length,lines,globalCount,mode));},full(values,width,height,inverse=false){requireValue(values instanceof Float32Array&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&values.length===width*height*(inverse?2:1),'Invalid reference DFT image.');return run(values,p=>m._frequency_stream_full(p,width,height,+inverse));}};
}
