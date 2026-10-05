import {nativeModuleFailure,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkpoint,checkAbort} from './errors.js';
let ready,pending;
export async function initZeroWasm({wasmBinary}={}){const {default:create}=await import('../vendor/zero/zero.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const zeroHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function moduleInstance(){try{return ready??(pending?await pending:await initZeroWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local ZERO WebAssembly module could not load.');}}
export function zeroAdmission(image){
 const n=image.width*image.height;
 requireValue(Number.isInteger(image.width)&&Number.isInteger(image.height)&&image.width>=16&&image.height>=16&&Number.isSafeInteger(n)&&image.data instanceof Uint8Array&&image.data.length===n*3,'ZERO requires RGB8 of at least 16 × 16 pixels.');
 if(n>100000000||72*n+32*1024**2>2*1024**3)throw new EngineError('MEMORY_LIMIT','ZERO working set exceeds the verified WASM limit; no resizing performed.');return n;
}
export async function zeroArrays(image,companion,{signal}={}, {reference=false,pool=null}={}){
 const {width:w,height:h}=image,n=zeroAdmission(image);
 requireValue(!companion||(companion.width===w&&companion.height===h&&companion.data instanceof Uint8Array&&companion.data.length===n*3),'JPEG99 dimensions differ from source.');
 await checkpoint(signal);const m=await moduleInstance(),allocated=[];
 function alloc(bytes){const p=m._malloc(bytes);if(!p)throw wasmAllocationFailure(m,'ZERO allocation failed.',bytes);allocated.push(p);m.HEAPU8.fill(0,p,p+bytes);return p;}
 try{
  checkAbort(signal);const input=alloc(n*3),fields={};
  for(const key of ['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg'])fields[key]=alloc(n*(key.startsWith('luminance')?8:4));
  new Int32Array(m.HEAPU8.buffer,fields.votes_jpeg,n).fill(-1);
  const scores=alloc(64*8),capacity=Math.floor(n/64)+1,foreign=alloc(capacity*32),missing=alloc(capacity*32),counts=alloc(8),poolMetrics=[];let fallbacks=0;
  const luminance=(rgb,dst)=>{m.HEAPU8.set(rgb.data,input);m._zero_rgb_luminance(input,dst,n);};
  const votes=async(src,dst)=>{if(pool&&n>=1048576&&!reference){const values=new Float64Array(m.HEAPU8.buffer,src,n).slice(),r=await pool.run(values,w,h,{signal});new Int32Array(m.HEAPU8.buffer,dst,n).set(r.votes);poolMetrics.push({workers:r.workers,scheduling:r.scheduling,kernelMs:r.kernelMs});}
   else{m._zero_set_reference(reference?1:0);m._compute_grid_votes_per_pixel(src,dst,w,h);fallbacks+=m._zero_fallback_count();}checkAbort(signal);
  };
  luminance(image,fields.luminance);await votes(fields.luminance,fields.votes);
  const main=m._detect_global_grids(fields.votes,scores,w,h);
  const nf=m._detect_forgeries(fields.votes,fields.mask_f,fields.mask_f_reg,foreign,w,h,main,63);new Int32Array(m.HEAPU8.buffer,counts,1)[0]=nf;
  if(main>=0&&companion){luminance(companion,fields.luminance_jpeg);await votes(fields.luminance_jpeg,fields.votes_jpeg);const source=new Int32Array(m.HEAPU8.buffer,fields.votes,n),altered=new Int32Array(m.HEAPU8.buffer,fields.votes_jpeg,n);for(let i=0;i<n;i++)if(source[i]===main)altered[i]=-1;
   const nm=m._detect_forgeries(fields.votes_jpeg,fields.mask_m,fields.mask_m_reg,missing,w,h,-1,0);new Int32Array(m.HEAPU8.buffer,counts+4,1)[0]=nm;
  }checkAbort(signal);
  const result={};for(const [key,p] of Object.entries(fields)){const Type=key.startsWith('luminance')?Float64Array:Int32Array;result[key]=new Type(m.HEAPU8.buffer,p,n).slice();}
  const regions=p=>{const count=new Int32Array(m.HEAPU8.buffer,counts+(p===foreign?0:4),1)[0];requireValue(count>=0&&count<=capacity,'Invalid ZERO region count.');const view=new DataView(m.HEAPU8.buffer);return Array.from({length:count},(_,i)=>{const at=p+i*32;return {x0:view.getInt32(at,true),y0:view.getInt32(at+4,true),x1:view.getInt32(at+8,true),y1:view.getInt32(at+12,true),grid:view.getInt32(at+16,true),log10_nfa:view.getFloat64(at+24,true)};});};
  result.grid_log10_nfa=new Float64Array(m.HEAPU8.buffer,scores,64).slice();result.metadata={method:'ZERO IPOL 2021/390',main_grid:main,foreign_regions:regions(foreign),missing_regions:regions(missing),jpeg99_used:!!companion,missing_grid_analyzed:main>=0&&!!companion,reference};result.runtime={kernel:reference?'original-fma':'separated-threshold-filter',fallbacks:poolMetrics.length?null:fallbacks,pool:poolMetrics};return result;
 }finally{for(const p of allocated)m._free(p);}
}

import {parameters,binaryMask} from './pixel-utils.js';
import {jpegCodec} from './jpeg.js';
import {ZERO_PALETTE} from './zero-palette.js';
export const zeroParams=(p={})=>parameters(p,{missing:true,view:0},{view:[0,4]},{},['missing']);
export async function zeroData(image,p,hooks={},context={}){
 zeroAdmission(image);const companion=p.missing?await jpegCodec.recompress444(image,99,hooks):null;
 hooks.onProgress?.(.1);const result=await zeroArrays(image,companion,hooks,{reference:context.cpuKernel==='reference',pool:context.zeroPool});hooks.onProgress?.(1);
 const runtime=result.runtime;delete result.runtime;const masks={};for(const [key,description] of [['mask_f','Foreign-grid detected vote pixels'],['mask_f_reg','Foreign-grid regularized regions'],['mask_m','Missing-grid detected vote pixels'],['mask_m_reg','Missing-grid regularized regions']]){const data=new Uint8Array(image.width*image.height),source=result[key];for(let i=0;i<data.length;i++)data[i]=source[i]>0?1:0;masks[key]=binaryMask(image,data,description+'; evidence, not an authenticity verdict');}
 return {masks,data:{...result,width:image.width,height:image.height,regionBounds:'inclusive xyxy',palette:Uint8Array.from(ZERO_PALETTE)},engineMetrics:{kernel:'zero-'+runtime.kernel,workers:Math.max(1,...runtime.pool.map(x=>x.workers)),thresholdFallbacks:runtime.fallbacks,...(runtime.pool.length?{votePasses:runtime.pool}:{})},semantics:'ZERO local JPEG grid votes, global significance and different/missing-grid regions. Red denotes a foreign grid, blue a missing grid. These are processing clues, not authenticity verdicts; grid log10 NFA is not a manipulation probability.'};
}
export async function zeroView(result,p,hooks={}){
 const d=result.data,n=d.width*d.height,data=new Uint8Array(n*3),hasRegion=d.mask_f_reg.some(x=>x>0)||d.mask_m_reg.some(x=>x>0);
 for(let i=0;i<n;i++){
  if(i%65536===0)await checkpoint(hooks.signal);
  if(p.view===1||p.view===2){const v=d[p.view===1?'votes':'votes_jpeg'][i];if(v>=0){data[i*3]=ZERO_PALETTE[v*3];data[i*3+1]=ZERO_PALETTE[v*3+1];data[i*3+2]=ZERO_PALETTE[v*3+2];}}
  else if(p.view===3||p.view===4)data.fill(d[p.view===3?'mask_f_reg':'mask_m_reg'][i],i*3,i*3+3);
  else{const gray=Math.trunc(d.luminance[i]*(hasRegion?.2:1));data.fill(gray,i*3,i*3+3);if(d.mask_f_reg[i]>0)data[i*3]=255;else if(d.mask_m_reg[i]>0)data[i*3+2]=255;}
 }
 result.pixels={width:d.width,height:d.height,format:'rgb8',data};result.layers=[{id:'zero-view',kind:'rgb',field:'pixels',coordinates:'source',origin:[0,0],range:[0,255]}];
 return result;
}

export async function zeroVoteArray(values,width,height,{signal}={}){
 requireValue(values instanceof Float64Array&&Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&values.length===width*height&&values.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'Invalid ZERO luminance band.');
 await checkpoint(signal);const m=await moduleInstance();let input=0,output=0;
 try{input=m._malloc(values.byteLength);output=m._malloc(values.length*4);if(!input||!output)throw wasmAllocationFailure(m,'ZERO vote allocation failed.',undefined);new Float64Array(m.HEAPU8.buffer,input,values.length).set(values);m._zero_set_reference(0);m._compute_grid_votes_per_pixel(input,output,width,height);checkAbort(signal);return new Int32Array(m.HEAPU8.buffer,output,values.length).slice();}
 finally{if(input)m._free(input);if(output)m._free(output);}
}
