import "../../runtime-context.js?v=0.30.0";
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {EngineError,checkAbort,createCooperator} from './errors.js';
import {stereoPagedFlow,stereoPagedFlowBytes} from './stereo-paged-flow.js';
import {createStereoStream} from './stereo-stream-kernel.js';
import {createStereoGpuStream} from './stereo-gpu-stream-kernel.js';
import {attachStereoGpuCleanup} from './stereo-gpu-retirement.js';
export const stereoFlowBytes=(width,height)=>8*1024**2+width*height*96;
export const stereoFlowReservation=(width,height,budget)=>{const resident=stereoFlowBytes(width,height)+4*1024**2+width*16;return resident<=1900*1024**2&&resident<=budget.limit-budget.retained-budget.active?resident:stereoPagedFlowBytes(width,height);};
export async function stereoFlowStage(image,offset,plane,{budget,signal,onProgress,original=false,blockPixels=32768,backend='auto',gaussianGpu,profile={}}={}){
 const {width,height}=image.surface.descriptor,outputWidth=width-offset,bytes=stereoFlowBytes(outputWidth,height),staging=4*1024**2+width*16,cooperate=createCooperator(signal);
 if(bytes>1900*1024**2||bytes+staging>budget.limit-budget.retained-budget.active){
  // A paged CPU flow must remain admissible when its optional GPU staging is
  // too large. Bound two halo inputs, three result/copy buffers, the native
  // five-field row cache and the pipeline before choosing the automatic path.
  const gpuExtra=6*1024**2+20*Math.min(262144,outputWidth*height*5)+outputWidth*5*78*8+outputWidth*Math.min(96,height)*20;
  const admitted=stereoPagedFlowBytes(outputWidth,height)+gpuExtra<=budget.limit-budget.retained-budget.active;
  return stereoPagedFlow(image,offset,plane,{budget,signal,onProgress,original,gaussianGpu:backend==='cpu'||original||backend==='auto'&&!admitted?null:gaussianGpu,requiredGpu:backend==='webgpu'});
 }
 const extra=outputWidth*height*20,gpuEligible=backend!=='cpu'&&!original&&!!globalThis.navigator?.gpu&&(backend==='webgpu'||outputWidth*height>=262144),gpuAdmitted=bytes+staging+extra+outputWidth*height*20+32*1024**2<=budget.limit-budget.retained-budget.active&&bytes+extra<1900*1024**2,useGpu=gpuEligible&&(gpuAdmitted||backend==='webgpu');
 const modernAdmitted=!original&&outputWidth*height>=262144&&bytes+staging+extra<=budget.limit-budget.retained-budget.active&&bytes+extra<1900*1024**2,useModern=useGpu||modernAdmitted;
 const release=budget.reserve(bytes+staging+(useModern?extra:0));let worker,local,pending,closed=false,primary,failed=false;
 const abort=()=>{closed=true;worker?.terminate();pending?.(new EngineError('CANCELLED','Stereo flow stopped.'));pending=null;};signal?.addEventListener('abort',abort,{once:true});
 try{
  // Large resident CPU and GPU runs share the exact SIMD matrix arithmetic.
  // Optional GPU filters yield inside this module under the parent's scheduler.
  // The independent original worker remains the reference and small/bounded path.
  if(useModern)local=await createStereoGpuStream({budget,profile:{...profile,...(!useGpu?{stereoGpuSelection:'native'}:{})},signal,required:backend==='webgpu'});
  else if(globalThis.Worker)worker=new Worker(new URL('./stereo-stream-worker.js',import.meta.url),{type:'module'});else local=await createStereoStream();
  const call=async j=>{checkAbort(signal);if(closed)throw new EngineError('CANCELLED','Stereo flow stopped.');if(local){await cooperate();if(j.op==='create')return local.create(j.width,j.height);if(j.op==='input')return local.put(j.rgb,j.width,j.top,j.rows,j.offset);if(j.op==='flow')return local.flow(j.original);return {values:local.read(j.offset,j.count)};}return new Promise((resolve,reject)=>{pending=reject;worker.onmessage=({data})=>{pending=null;data.error?reject(deserializeEngineError(data.error)):resolve(data.result);};worker.onerror=e=>{pending=null;reject(new EngineError('WORKER_FAILED',e.message||'Farneback worker failed.'));};worker.postMessage(j,j.rgb?[j.rgb.buffer]:[]);});};
  await call({op:'create',width:outputWidth,height});const rows=Math.max(1,Math.floor(blockPixels/width));
  for(let top=0;top<height;top+=rows){const h=Math.min(rows,height-top),part=await image.surface.readWindow({x:0,y:top,width,height:h},{signal});try{await call({op:'input',rgb:part.pixels.data,width,top,rows:h,offset});}finally{part.release();}onProgress?.({phase:'stereo-flow-input',completed:top+h,total:height});}
  onProgress?.({phase:'stereo-flow',completed:0,total:1});const result=await call({op:'flow',original});checkAbort(signal);let lo=Infinity,hi=-Infinity;
  for(let top=0;top<height;top+=rows){const h=Math.min(rows,height-top),{values}=await call({op:'output',offset:top*outputWidth,count:h*outputWidth});for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}await plane.write(values,0,top,outputWidth,h,{signal});}
  onProgress?.({phase:'stereo-flow',completed:1,total:1});return {...result,lo,hi};
 }catch(error){failed=true;primary=error;throw error;}
 finally{signal?.removeEventListener('abort',abort);worker?.terminate();try{await local?.dispose();}catch(error){if(failed)attachStereoGpuCleanup(primary,error);else throw error;}finally{release();}}
}
