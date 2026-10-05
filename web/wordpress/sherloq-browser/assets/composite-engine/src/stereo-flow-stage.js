import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
import {stereoPagedFlow,stereoPagedFlowBytes} from './stereo-paged-flow.js';
import {createStereoStream} from './stereo-stream-kernel.js';
export const stereoFlowBytes=(width,height)=>8*1024**2+width*height*96;
export const stereoFlowReservation=(width,height,budget)=>{const resident=stereoFlowBytes(width,height)+4*1024**2+width*16;return resident<=1900*1024**2&&resident<=budget.limit-budget.retained-budget.active?resident:stereoPagedFlowBytes(width,height);};
export async function stereoFlowStage(image,offset,plane,{budget,signal,onProgress,original=false,blockPixels=32768}={}){
 const {width,height}=image.surface.descriptor,outputWidth=width-offset,bytes=stereoFlowBytes(outputWidth,height),staging=4*1024**2+width*16;
 if(bytes>1900*1024**2||bytes+staging>budget.limit-budget.retained-budget.active)return stereoPagedFlow(image,offset,plane,{budget,signal,onProgress,original});
 const release=budget.reserve(bytes+staging);let worker,local,pending,closed=false;
 const abort=()=>{closed=true;worker?.terminate();pending?.(new EngineError('CANCELLED','Stereo flow stopped.'));pending=null;};signal?.addEventListener('abort',abort,{once:true});
 try{
  if(globalThis.Worker)worker=new Worker(new URL('./stereo-stream-worker.js',import.meta.url),{type:'module'});else local=await createStereoStream();
  const call=async j=>{checkAbort(signal);if(closed)throw new EngineError('CANCELLED','Stereo flow stopped.');if(local){await controlCheckpoint(signal);if(j.op==='create')return local.create(j.width,j.height);if(j.op==='input')return local.put(j.rgb,j.width,j.top,j.rows,j.offset);if(j.op==='flow')return local.flow(j.original);return {values:local.read(j.offset,j.count)};}return new Promise((resolve,reject)=>{pending=reject;worker.onmessage=({data})=>{pending=null;data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};worker.onerror=e=>{pending=null;reject(new EngineError('WORKER_FAILED',e.message||'Farneback worker failed.'));};worker.postMessage(j,j.rgb?[j.rgb.buffer]:[]);});};
  await call({op:'create',width:outputWidth,height});const rows=Math.max(1,Math.floor(blockPixels/width));
  for(let top=0;top<height;top+=rows){const h=Math.min(rows,height-top),part=await image.surface.readWindow({x:0,y:top,width,height:h},{signal});try{await call({op:'input',rgb:part.pixels.data,width,top,rows:h,offset});}finally{part.release();}onProgress?.({phase:'stereo-flow-input',completed:top+h,total:height});}
  onProgress?.({phase:'stereo-flow',completed:0,total:1});const result=await call({op:'flow',original});checkAbort(signal);let lo=Infinity,hi=-Infinity;
  for(let top=0;top<height;top+=rows){const h=Math.min(rows,height-top),{values}=await call({op:'output',offset:top*outputWidth,count:h*outputWidth});for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}await plane.write(values,0,top,outputWidth,h,{signal});}
  onProgress?.({phase:'stereo-flow',completed:1,total:1});return {...result,lo,hi};
 }finally{signal?.removeEventListener('abort',abort);worker?.terminate();local?.dispose();release();}
}
