import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkpoint,checkAbort,requireValue} from './errors.js';
import {parameters} from './pixel-utils.js';
export const wavelets=Object.freeze([...Array.from({length:20},(_,i)=>'db'+(i+1)),...Array.from({length:19},(_,i)=>'sym'+(i+2)),...Array.from({length:5},(_,i)=>'coif'+(i+1)),...['1.1','1.3','1.5','2.2','2.4','2.6','2.8','3.1','3.3','3.5','3.7','3.9','4.4','5.5','6.8'].map(x=>'bior'+x)]);
const modes=['soft','hard','garrote','greater','less'];
let ready,pending;
export async function initWaveletWasm({wasmBinary}={}){const {default:create}=await import('../vendor/pywt/pywt.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const waveletHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function moduleInstance(){try{return ready??(pending?await pending:await initWaveletWasm());}catch{pending=null;throw new EngineError('CODEC_UNAVAILABLE','Local PyWavelets WebAssembly module could not load.');}}
function identity(name){const [,family,order]=/^(db|sym|coif|bior)([\d.]+)$/.exec(name);return [['db','sym','coif','bior'].indexOf(family),Number(order.replace('.',''))];}
export function waveletParams(p={}){const v=parameters(p,{wavelet:'db1',threshold:0,level:null,mode:'soft'},{threshold:[0,100]},{wavelet:wavelets,mode:modes});requireValue(v.level===null||(Number.isSafeInteger(v.level)&&v.level>=0&&v.level<=30),'Invalid wavelet level.');if(v.threshold===0||v.level===0){v.threshold=0;v.level=0;v.mode='soft';}return v;}
export async function waveletReconstruction(image,p,{signal}={}){
 await checkpoint(signal);let m;try{m=ready??(pending?await pending:await initWaveletWasm());}catch{pending=null;throw new EngineError('CODEC_UNAVAILABLE','Local PyWavelets WebAssembly module could not load.');}checkAbort(signal);
 const [,family,order]=/^(db|sym|coif|bior)([\d.]+)$/.exec(p.wavelet);let input=0;
 try{input=m._malloc(image.data.length);if(!input)throw new EngineError('MEMORY_LIMIT','Wavelet input allocation failed.');m.HEAPU8.set(image.data,input);
  if(!m._wavelet_run(input,image.width,image.height,['db','sym','coif','bior'].indexOf(family),Number(order.replace('.','')),p.threshold,p.level??-1,modes.indexOf(p.mode)))throw new EngineError('INVALID_INPUT','Wavelet reconstruction failed.');checkAbort(signal);
  return m.HEAPF64.slice(m._wavelet_data()/8,m._wavelet_data()/8+image.width*image.height);
 }finally{m._wavelet_release();if(input)m._free(input);}
}
export async function waveletPixels(image,p,hooks){const raw=await waveletReconstruction(image,p,hooks),data=new Uint8Array(raw.length*3);for(let i=0;i<raw.length;i++)data.fill(raw[i],i*3,i*3+3);return {pixels:{width:image.width,height:image.height,format:'rgb8',data},semantics:'Native blue channel; float64 symmetric PyWavelets reconstruction, cropped to the original dimensions and truncated to uint8.'};}
export async function waveletData(image,p,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance(),[family,order]=identity(p.wavelet);let input=0;
 try{checkAbort(signal);input=m._malloc(image.data.length);if(!input)throw new EngineError('MEMORY_LIMIT','Wavelet input allocation failed.');m.HEAPU8.set(image.data,input);
  if(!m._wavelet_prepare(input,image.width,image.height,family,order))throw new EngineError('INVALID_INPUT','Wavelet decomposition failed.');checkAbort(signal);
  const coefficients=m.HEAPF64.slice(m._wavelet_data()/8,m._wavelet_data()/8+m._wavelet_size());return {coefficients,data:{width:image.width,height:image.height,wavelet:p.wavelet,maximumLevel:coefficients[3]},semantics:'Native blue channel; float64 symmetric PyWavelets decomposition reused across threshold/level/mode changes. Reconstruction cropped to original dimensions and truncated to uint8.'};
 }finally{m._wavelet_release();if(input)m._free(input);}
}
export async function waveletView(result,p,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance(),[family,order]=identity(p.wavelet),{width,height,maximumLevel}=result.data;let input=0;
 try{checkAbort(signal);input=m._malloc(result.coefficients.byteLength);if(!input)throw new EngineError('MEMORY_LIMIT','Wavelet coefficient allocation failed.');m.HEAPF64.set(result.coefficients,input/8);
  if(!m._wavelet_reconstruct(input,result.coefficients.length,family,order,p.threshold,p.level??-1,modes.indexOf(p.mode)))throw new EngineError('INVALID_INPUT','Wavelet reconstruction failed.');checkAbort(signal);
  const data=new Uint8Array(width*height*3),at=m._wavelet_data()/8;for(let i=0;i<width*height;i++)data.fill(m.HEAPF64[at+i],i*3,i*3+3);
  delete result.coefficients;result.pixels={width,height,format:'rgb8',data};result.data.effectiveLevel=p.threshold===0?0:Math.min(p.level??(maximumLevel?Math.max(1,Math.floor(maximumLevel/2)):0),maximumLevel);return result;
 }finally{m._wavelet_release();if(input)m._free(input);}
}
async function bandOperation(input,call,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(input.byteLength);if(!src)throw new EngineError('MEMORY_LIMIT','Wavelet band allocation failed.');m.HEAPU8.set(new Uint8Array(input.buffer,input.byteOffset,input.byteLength),src);
  if(!call(m,src))throw new EngineError('INVALID_INPUT','Wavelet band operation failed.');checkAbort(signal);const at=m._wavelet_data()/8;return {height:m.HEAPF64[at],width:m.HEAPF64[at+1],values:m.HEAPF64.slice(at+2,at+m._wavelet_size())};
 }finally{m._wavelet_release();if(src)m._free(src);}
}
export const waveletDetail=(gray,hooks)=>bandOperation(gray.data,(m,p)=>m._wavelet_detail(p,gray.width,gray.height),hooks);
export const waveletNoise=(detail,block,hooks)=>bandOperation(detail.values,(m,p)=>m._wavelet_noise(p,detail.width,detail.height,block),hooks);
