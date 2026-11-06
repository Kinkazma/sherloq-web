import "../../runtime-context.js?v=0.31.0";
import {AI_METHODS} from './ai-detectors-prepare.js';
export const AI_ORT_HEAP_BYTES=512*1024**2;
const error=(code,message)=>Object.assign(new Error(message),{code});
const check=signal=>{if(signal?.aborted)throw error('CANCELLED','AI detection cancelled.');};
async function sha(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
const MAX_TENSOR_ELEMENTS=32*1024**2/Float32Array.BYTES_PER_ELEMENT;
const sameShape=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((n,i)=>n===b[i]);
function validShape(shape){
 if(!Array.isArray(shape)||!shape.length||shape.length>4)return false;
 let elements=1;
 for(const n of shape){if(!Number.isSafeInteger(n)||n<=0||!Number.isSafeInteger(elements*n))return false;elements*=n;}
 return elements<=MAX_TENSOR_ELEMENTS;
}
const validNames=(names,max=1)=>Array.isArray(names)&&names.length>0&&names.length<=max&&new Set(names).size===names.length&&names.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=1024);
export const aiOutputShapes=stage=>stage.outputShapes??{[stage.outputNames[0]]:stage.outputShape};
export function validateAiTensor(tensor,shape){
 if(!validShape(shape)||!tensor||tensor.type!=='float32'||!sameShape(tensor.dims,shape)||!(tensor.data instanceof Float32Array)||tensor.data.length!==shape.reduce((a,b)=>a*b,1))throw error('MODEL_CONTRACT','Unexpected detector tensor shape or type.');
 return tensor;
}
export function validateAiManifest(manifest,method){
 if(!AI_METHODS.includes(method)||!manifest||manifest.method!==method||manifest.precision!=='float32'||!Array.isArray(manifest.stages)||manifest.stages.length<2||manifest.stages.length>32)throw error('MODEL_CONTRACT','Invalid detector manifest.');
 const size=method==='gapl'?224:method==='community-forensics'?384:336;
 if(!sameShape(manifest.input?.dims,[1,3,size,size]))throw error('MODEL_CONTRACT','Detector preparation shape mismatch.');
 let preceding=manifest.input.dims;
 for(const s of manifest.stages){
  if(!s||!Number.isSafeInteger(s.bytes)||s.bytes<=0||s.bytes>128*1024**2||!validNames(s.inputNames)||!validNames(s.outputNames,8)||typeof s.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(s.sha256)||typeof s.file!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.onnx$/).test(s.file)||!validShape(s.inputShape)||!validShape(s.outputShape)||!sameShape(s.inputShape,preceding))throw error('MODEL_CONTRACT','Invalid detector layer.');
  const shapes=aiOutputShapes(s);
  if(!shapes||Object.keys(shapes).length!==s.outputNames.length||!s.outputNames.every(n=>Object.hasOwn(shapes,n)&&validShape(shapes[n]))||!sameShape(shapes[s.outputNames[0]],s.outputShape)||s.outputNames.reduce((sum,n)=>sum+shapes[n].reduce((a,b)=>a*b,1),0)>MAX_TENSOR_ELEMENTS)throw error('MODEL_CONTRACT','Invalid detector output shapes.');
  preceding=s.outputShape;
 }
 if(!sameShape(preceding,[1,1]))throw error('MODEL_CONTRACT','Detector must return one scalar logit.');
 return manifest;
}
export async function loadAiManifest(config,method,{signal}={}){
 if(!AI_METHODS.includes(method))throw error('INVALID_INPUT','Unknown AI detector.');
 const pin=config.models?.[method];if(!pin||!(/^[a-f0-9]{64}$/).test(pin.sha256))throw error('MODEL_UNAVAILABLE','Detector conversion is not configured.');
 const url=new URL(pin.manifestUrl,config.modelBaseUrl).href,response=await fetch(url,{cache:'no-store',signal});
 if(!response.ok)throw error('MODEL_UNAVAILABLE','Detector manifest unavailable.');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){check(signal);const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>256*1024)throw error('MODEL_CONTRACT','Detector manifest too large.');chunks.push(value);}}
 finally{await reader.cancel();reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 if(await sha(bytes)!==pin.sha256)throw error('MODEL_INTEGRITY','Detector manifest integrity mismatch.');
 return{manifest:validateAiManifest(JSON.parse(new TextDecoder().decode(bytes)),method),url,sha256:pin.sha256};
}
export function aiInferenceAdmission(manifest,{backend='cpu'}={}){
 // Full bounded Wasm capacity remains funded, including released layer heaps.
 // JS fetch/digest/parser buffers and live hidden tensors are additional.
 const maxStageBytes=Math.max(...manifest.stages.map(s=>s.bytes));
 const hostBytes=5*maxStageBytes+64*1024**2;
 const gpuBytes=backend==='webgpu'?512*1024**2:0;
 return{bytes:AI_ORT_HEAP_BYTES+hostBytes+gpuBytes,wasmCapacityBytes:AI_ORT_HEAP_BYTES,hostBytes,gpuBytes,maxStageBytes,physicalRamMeasured:false};
}
export function runAiWorker(prepared,loaded,config,{signal,onProgress,backend='cpu',workerFactory=url=>new Worker(url,{type:'module'})}={}){
 check(signal);
 return new Promise((resolve,reject)=>{
  const worker=workerFactory(new URL('./ai-detectors-worker.js',import.meta.url));let finished=false;
  const cancel=()=>worker.postMessage({type:'cancel'});
  const done=(failure,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);worker.terminate();failure?reject(failure):resolve(value);};
  worker.onerror=event=>done(error('AI_WORKER_ERROR',event.message??'Detector worker failed.'));
  worker.onmessage=({data})=>{
   if(data.type==='progress'){onProgress?.(data.event);return;}
   if(data.type==='complete')return done(signal?.aborted?error('CANCELLED','AI detection cancelled.'):null,data.result);
   if(data.type==='error'){
    const failure=error(data.error.code,data.error.message);
    if(Array.isArray(data.error.cleanupErrors)&&data.error.cleanupErrors.length)failure.cleanupErrors=structuredClone(data.error.cleanupErrors);
    done(failure);
   }
  };
  signal?.addEventListener('abort',cancel,{once:true});
  // A synchronous clone/allocation failure has not started useful work in
  // the worker. Retire the newly created worker and its abort listener too.
  try{
   worker.postMessage({type:'run',data:prepared.data,manifest:loaded.manifest,manifestUrl:loaded.url,ortModuleUrl:config.ortModuleUrl,ortWasmPaths:config.ortWasmPaths,backend,performance:config.performance??{}},[prepared.data.buffer]);
   if(signal?.aborted)cancel();
  }catch(failure){done(failure);}
 });
}
