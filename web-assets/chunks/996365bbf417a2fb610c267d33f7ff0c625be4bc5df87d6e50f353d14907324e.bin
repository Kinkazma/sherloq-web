import "../../runtime-context.js?v=0.14.5";
import {deserializeEngineError,EngineError,checkAbort,requireValue} from './errors.js';import {c2paParams,summarizeC2pa} from './c2pa-report.js';
export {c2paParams};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function validateC2paSource(source,params,{budget,sourceSha256,signal,onProgress}={}){
 const p=c2paParams(params);requireValue(budget&&(source instanceof Blob||source instanceof Uint8Array),'Original bytes and shared budget required.');checkAbort(signal);
 if(typeof Worker==='undefined')throw new EngineError('UNSUPPORTED_RUNTIME','C2PA validation requires an isolated browser worker.');
 const n=source instanceof Blob?source.size:source.byteLength,sourceCopyBytes=source instanceof Blob?0:n;
 // 128 MiB enforced WASM maximum; 160 MiB JSON/string/object/transport allowance;
 // 16 MiB code/module allowance; up to two 64 MiB byte staging views; local PEM copies.
 const reservationBytes=(128+160+16)*1024**2+2*Math.min(n,64*1024**2)+sourceCopyBytes+(p.trustAnchors?.length??0)*8;
 requireValue(Number.isSafeInteger(reservationBytes),'C2PA input exceeds safe accounting.');
 const release=budget.reserve(reservationBytes);let worker;
 try{
  const blob=source instanceof Blob?source:new Blob([source]);
  const trustSha=p.trustAnchors===null?null:await sha(new TextEncoder().encode(p.trustAnchors));checkAbort(signal);
  onProgress?.(0);checkAbort(signal);
  const result=await new Promise((resolve,reject)=>{
   let timer;const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(result);};
   const abort=()=>finish(new EngineError('CANCELLED','C2PA validation cancelled.'));
   worker=new Worker(new URL('./c2pa-worker.js',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(data.progress!==undefined){try{onProgress?.(data.progress);}catch(error){finish(error);}return;}data.failure?finish(deserializeEngineError(data.failure)):finish(null,data);};
   worker.onerror=event=>finish(new EngineError('C2PA_RUNTIME','C2PA worker failed; no validation result produced. '+(event.message??'')));
   signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new EngineError('TIMEOUT','C2PA validation exceeded 60 seconds.')),60000);
   try{worker.postMessage({blob,trustAnchors:p.trustAnchors});}catch(error){finish(error);}
  });
  checkAbort(signal);const metadata={sha256:sourceSha256,offline:true,tool:'@contentauth/c2pa-wasm 0.13.2 / c2pa-rs 0.91.0',trust_configured:p.trustAnchors!==null,...(trustSha?{trust_sha256:trustSha}:{}),external_manifest_supported:false,online_revocation_checked:false};
  const data=summarizeC2pa(result.json===null?null:JSON.parse(result.json),metadata,result.error);onProgress?.(1);checkAbort(signal);
  return {data,metrics:{...result.metrics,reservationBytes,sourceCopyBytes,workers:1,cache:{result:false}},semantics:'Offline C2PA active-manifest integrity, signature and locally configured trust are separate states; no scene-authenticity verdict. Raw SDK manifest report included. External sidecars are not supported by this wrapper.'};
 }finally{worker?.terminate();release();}
}
