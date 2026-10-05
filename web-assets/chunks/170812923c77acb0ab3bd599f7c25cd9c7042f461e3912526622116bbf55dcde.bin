import {EngineError,requireValue,checkAbort} from './errors.js';
import {PRNU_TWIDDLES} from './prnu-twiddles.js';
let ready,pending;
export const prnuStreamHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function prnuStreamMath({bytes,signal}={}){
 if(!pending)pending=(async()=>{
  const {default:create}=await import('../vendor/prnu-stream/prnu-stream.js'),m=await create();
  let source=bytes;if(!source){const response=await fetch(new URL('../vendor/pocketfft/prnu-twiddles.bin',import.meta.url));if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','PRNU FFT seeds could not load.');source=new Uint8Array(await response.arrayBuffer());}
  requireValue(source instanceof Uint8Array&&source.byteLength===PRNU_TWIDDLES.bytes,'Invalid PRNU FFT seeds.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source)),x=>x.toString(16).padStart(2,'0')).join('');requireValue(hash===PRNU_TWIDDLES.sha256,'PRNU FFT seed hash mismatch.');
  const at=m._malloc(source.byteLength);if(!at)throw new EngineError('MEMORY_LIMIT','PRNU FFT seed allocation failed.');try{m.HEAPU8.set(source,at);requireValue(m._cv_prnu_twiddles(at,source.byteLength),'PRNU FFT seeds rejected.');}finally{m._free(at);}m._cv_prnu_fma_mode(1);return ready=m;
 })().catch(error=>{pending=null;throw error;});const m=await pending;checkAbort(signal);
 const run=(arrays,fn)=>{const ptrs=[];try{for(const a of arrays){requireValue(a instanceof Float64Array,'PRNU axes require Float64.');const p=m._malloc(Math.max(8,a.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','PRNU axis allocation failed.');ptrs.push(p);m.HEAPF64.set(a,p/8);}if(!fn(...ptrs))throw new EngineError('INVALID_INPUT','PRNU complete-axis calculation failed.');const at=m._prnu_stream_data()/8;return m.HEAPF64.slice(at,at+m._prnu_stream_size());}finally{m._prnu_stream_release();for(const p of ptrs)m._free(p);}};
 return {
  axis(values,length,lines,mode,factor=1){requireValue(Number.isSafeInteger(length)&&length>0&&Number.isSafeInteger(lines)&&lines>0&&[0,1,2,3].includes(mode)&&values.length===lines*(mode===0?length:mode===3?2*(Math.floor(length/2)+1):length*2),'Invalid PRNU complete axes.');return run([values],p=>m._prnu_stream_axis(p,length,lines,mode,factor));},
  multiply(a,b){requireValue(a.length===b.length&&a.length%2===0,'Invalid PRNU spectrum sizes.');return run([a,b],(p,q)=>m._prnu_stream_multiply(p,q,a.length/2));},
  full(values,width,height){requireValue(values.length===width*height,'Invalid full PRNU correlation.');return run([values],p=>m._prnu_stream_full(p,width,height));}
 };
}
