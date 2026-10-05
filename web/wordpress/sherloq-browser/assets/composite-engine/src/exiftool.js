import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,requireValue} from './errors.js';
import {exiftoolReport} from './exiftool-report.js';
export function exiftoolParams(p={}){requireValue(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='mode'),'Unknown ExifTool parameter.');const mode=p.mode??'dump';requireValue(['dump','location','headers','thumbnail'].includes(mode),'Invalid ExifTool mode.');return {mode};}
export async function inspectExiftool(source,params,{budget,signal,onProgress}={}){
 const {mode}=exiftoolParams(params);requireValue(source instanceof Blob||source instanceof Uint8Array,'Original Blob or bytes required.');checkAbort(signal);
 if(typeof Worker==='undefined')throw new EngineError('UNSUPPORTED_RUNTIME','ExifTool extraction requires an isolated browser worker.');
 const n=source instanceof Blob?source.size:source.byteLength;requireValue(n>0,'Non-empty source required.');
 // 128 MiB actual WASM ceiling; 160 MiB assets/code; 256 MiB bounded output,
 // decoded report/transport/object allowance; two largest possible WASI read buffers.
 const sourceCopyBytes=source instanceof Blob?0:n,reservationBytes=(128+160+256)*1024**2+2*Math.min(n,128*1024**2)+sourceCopyBytes;
 requireValue(Number.isSafeInteger(reservationBytes),'ExifTool source exceeds safe accounting.');const release=budget.reserve(reservationBytes);let worker;
 try{
  const blob=source instanceof Blob?source:new Blob([source]);onProgress?.(0);checkAbort(signal);
  const result=await new Promise((resolve,reject)=>{
   let timer,finished=false;const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(value);};
   const abort=()=>finish(new EngineError('CANCELLED','ExifTool extraction cancelled.'));
   worker=new Worker(new URL('./exiftool-worker.js',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(data.progress!==undefined){try{onProgress?.(data.progress);}catch(error){finish(error);}return;}data.failure?finish(new EngineError(data.failure.code,data.failure.message)):finish(null,data);};
   worker.onerror=()=>finish(new EngineError('EXIFTOOL_RUNTIME','ExifTool worker failed; no report produced.'));
   signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new EngineError('TIMEOUT','ExifTool extraction exceeded 60 seconds.')),60000);
   try{worker.postMessage({blob,mode});}catch(error){finish(error);}
  });checkAbort(signal);
  const data=['dump','location'].includes(mode)?exiftoolReport(result.bytes):mode==='headers'?{html:new TextDecoder().decode(result.bytes),untrustedHtml:true}:{available:result.bytes.length>0,bytes:result.bytes};
  onProgress?.(1);checkAbort(signal);
  return {data,warnings:result.warnings,metrics:{...result.metrics,reservationBytes,sourceCopyBytes,workers:1,pixelDecode:false,cache:{result:false}},semantics:'ExifTool 13.55 on original bytes in an isolated offline interpreter; no user config. Virtual filesystem fields are not original file evidence. HTML is untrusted content; thumbnail bytes are not decoded or resized.'};
 }finally{worker?.terminate();release();}
}
