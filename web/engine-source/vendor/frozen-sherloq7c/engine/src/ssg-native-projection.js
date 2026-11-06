import {allocateWasmMemory,allocateTypedArray} from './allocation.js';
import {checkAbort,createCooperator,EngineError,requireValue} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';
const failures=new WeakSet();
export const isSsgProjectionFailure=error=>!!error&&(typeof error==='object'||typeof error==='function')&&failures.has(error);
export function markSsgProjectionFailure(error){if(error&&(typeof error==='object'||typeof error==='function'))failures.add(error);return error;}
async function defaultFactory(options){const{default:create}=await import('../vendor/ssg-projection/projection.mjs');return create(options);}
// The existing coefficient builder keeps reflected tap arrays in JS. Bound
// their retained/growing number arrays before invoking it, including tiny
// Originals whose normalization ratio makes a fixed bytes-per-axis insufficient.
export function ssgProjectionCoefficientBytes(sw,sh,width,height){
 const taps=(source,target)=>target*(Math.ceil(4/Math.min(1,target/source))+2);
 const bound=Math.max((width+height)*768,64*(taps(sw,width)+taps(sh,height))+256*(width+height));
 requireValue(Number.isSafeInteger(bound)&&bound>0,'Projection coefficient staging bound');return bound;
}
const overlaps=(a,b)=>a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;
// Optional scalar wasm32 transport for the literal cubic projection. The caller
// retains its existing output owners; no native or mapped view escapes this job.
export async function projectSsgNativeInto({common,candidates,fields,xs,ys,isAdmitted,targetMask,targetSupport,budget,signal,reference=false,moduleFactory=defaultFactory}={}){
 checkAbort(signal);if(reference||typeof WebAssembly!=='object')return null;
 const start=performance.now(),timings={},sw=fields.width,sh=fields.height,width=fields.originalWidth,height=fields.originalHeight,n=sw*sh,pixels=width*height;
 if(![sw,sh,width,height,n,pixels].every(Number.isSafeInteger)||Math.min(sw,sh,width,height)<1||Math.max(n,pixels)>2147483647)return null;
 requireValue([common.mask,common.direct,candidates].every(a=>a instanceof Uint8Array&&a.length===n)&&[targetMask,targetSupport].every(a=>a instanceof Uint8Array&&a.length===pixels)&&xs.length===width&&ys.length===height,'Projection input/output extents differ');
 requireValue(!overlaps(targetMask,targetSupport)&&[common.mask,common.direct,candidates].every(a=>!overlaps(a,targetMask)&&!overlaps(a,targetSupport)),'Projection output aliases its input');
 const count=axis=>axis.reduce((sum,c)=>sum+c.ids.length,0),nx=count(xs),ny=count(ys),packedBytes=(width+height+2)*4+(nx+ny)*12+pixels;
 const heapBytes=Math.max(33554432,Math.ceil((3*n+3*pixels+(width+height+2)*4+(nx+ny)*12+5*1024**2)/65536)*65536),charge=heapBytes+packedBytes+65536;
 if(![nx,ny,packedBytes,heapBytes,charge].every(Number.isSafeInteger)||Math.max(nx,ny)>4294967295||heapBytes>2147483648||charge>budget.limit-budget.total())return null;
 let credit,memory,m,heapBacking,lease,failed=false,primary,constructed=false,result;const ptrs=[],host=[];
 const pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'ssg'});
 const retirement=pool.ownCleanup(async()=>{
  let refused=false,first;const attempt=async fn=>{try{await fn();}catch(error){if(!refused){refused=true;first=error;}}};
  for(const record of ptrs)if(record.pointer)await attempt(()=>{m._free(record.pointer);record.pointer=0;});
  for(const record of host)if(record.release)await attempt(async()=>{await record.release();record.release=null;record.data=null;});
  if(!ptrs.some(r=>r.pointer)&&heapBacking)await attempt(async()=>{await heapBacking();heapBacking=null;});
  if(lease)await attempt(async()=>{await lease.release();lease=null;});
  if(!ptrs.some(r=>r.pointer)&&!heapBacking&&!host.some(r=>r.release)&&!lease){m=null;memory=null;for(const record of host)record.data=null;if(credit)await attempt(async()=>{await credit();credit=null;});}
  if(refused)throw first;
 });
 try{
  credit=budget.reserve(charge);checkAbort(signal);
  const own=(Type,length)=>{const record={data:null,release:null};host.push(record);record.data=allocateTypedArray(Type,length,{label:'SSG projection axis/admission'});record.release=budget.registerBacking('array-buffer',record.data.byteLength,{owner:'ssg-projection',label:'prepaid exact cubic axis/admission',identity:record.data.buffer});return record.data;};
  const flatten=axis=>{const offsets=own(Uint32Array,axis.length+1),ids=own(Uint32Array,count(axis)),weights=own(Float64Array,ids.length);let at=0;for(let i=0;i<axis.length;i++){offsets[i]=at;ids.set(axis[i].ids,at);weights.set(axis[i].weights,at);at+=axis[i].ids.length;}offsets[axis.length]=at;return{offsets,ids,weights};};
  let at=performance.now();const x=flatten(xs),y=flatten(ys),admitted=own(Uint8Array,pixels),cooperate=createCooperator(signal);
  for(let row=0;row<height;row++){for(let col=0;col<width;col++)admitted[row*width+col]=isAdmitted(col,row)?1:0;await cooperate();}timings.packingAdmissionMs=performance.now()-at;
  lease=await getExecutionScheduler(budget).acquire({cpu:1,signal,resourceOwner:'ssg',label:'SSG literal cubic projection'});checkAbort(signal);
  at=performance.now();memory=allocateWasmMemory({initial:heapBytes/65536,maximum:heapBytes/65536});heapBacking=budget.registerBacking('wasm',heapBytes,{owner:'ssg-projection',label:'bounded exact cubic projection arena',identity:memory.buffer});constructed=true;m=await moduleFactory({wasmMemory:memory});checkAbort(signal);timings.constructMs=performance.now()-at;
  const alloc=bytes=>{const record={pointer:0};ptrs.push(record);record.pointer=m._malloc(Math.max(8,bytes));if(!record.pointer)throw new EngineError('MEMORY_ALLOCATION','Native SSG projection allocation refused');return record.pointer;};
  const store=data=>{const ptr=alloc(data.byteLength);m.HEAPU8.set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),ptr);return ptr;};
  at=performance.now();const mask=store(common.mask),direct=store(common.direct),candidate=store(candidates),xo=store(x.offsets),xi=store(x.ids),xw=store(x.weights),yo=store(y.offsets),yi=store(y.ids),yw=store(y.weights),admit=store(admitted),out=alloc(pixels),support=alloc(pixels);timings.copyInputMs=performance.now()-at;
  at=performance.now();const rows=Math.max(1,Math.floor(65536/width));let calls=0;
  for(let row=0;row<height;row+=rows){checkAbort(signal);const status=m._ssg_project_rows(mask,direct,candidate,sw,sh,xo,xi,xw,nx,yo,yi,yw,ny,admit,width,height,row,Math.min(rows,height-row),out,support);requireValue(status===0,'Native SSG projection rejected its input');checkAbort(signal);calls++;await cooperate();}timings.kernelAndCooperationMs=performance.now()-at;
  at=performance.now();targetMask.set(m.HEAPU8.subarray(out,out+pixels));targetSupport.set(m.HEAPU8.subarray(support,support+pixels));checkAbort(signal);timings.copyOutputMs=performance.now()-at;
  result={kernel:'literal-cubic-antialias-f64-wasm',heapBytes,packedBytes,rowsPerCall:rows,calls,timings};
 }catch(error){failed=true;primary=error;}
 let retirementFailed=false;const retiring=performance.now();try{await retirement.retire();}catch(error){retirementFailed=true;if(failed)appendWaveletCleanup(primary,error);else{failed=true;primary=error;}}timings.retirementMs=performance.now()-retiring;
 if(failed){if(!constructed&&!retirementFailed&&primary instanceof EngineError&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(primary.code))return null;throw markSsgProjectionFailure(primary);}
 try{checkAbort(signal);}catch(error){throw markSsgProjectionFailure(error);}
 result.totalMs=performance.now()-start;return result;
}
