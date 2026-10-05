import {prepareResearchRows} from './m3-research-rows.js';
import {FOCAL_MODEL} from './focal-assets.js';export {FOCAL_MODEL};
import {EngineError,requireValue,checkAbort} from './errors.js';import {verifyM3Bytes,fetchM3Asset} from './m3-asset.js';
const MiB=1024**2,stages=['embedding',...Array.from({length:24},(_,i)=>'block-'+String(i).padStart(2,'0')),'neck','hrnet','fusion','cluster'];let next=0;
export class FocalEngine{
 constructor(image,budget,profile){requireValue(image?.format==='rgb8'&&Number.isInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.width*image.height*3)&&Number.isInteger(image.height)&&image.height>0&&(typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'FOCAL requires RGB8 pixels.');requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'FOCAL requires shared memory admission and worker profile.');this.image=image;this.budget=budget;this.profile=profile;this.prefix='m3-focal-'+(++next)+'/';this.lifetime=new AbortController();this.disposed=false;this.running=false;}
 stop(){this.worker?.terminate();this.worker=null;this.reject?.(new EngineError('CANCELLED','FOCAL stopped.'));this.reject=null;}
 dispose(){this.disposed=true;this.lifetime.abort();this.stop();this.budget.clearPrefix(this.prefix);}
 rpc(job){return new Promise((resolve,reject)=>{this.reject=reject;this.worker.onmessage=({data})=>{this.reject=null;data.error?reject(new EngineError(data.error,data.message)):resolve(data);};this.worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message));this.worker.postMessage(job);});}
 async analyze(params={},hooks={}){
  requireValue(!this.running&&!this.disposed&&typeof Worker!=='undefined'&&params&&Object.keys(params).length===0,'FOCAL unavailable, busy, or unsupported parameters.');const {model,backend='auto',onProgress}=hooks,signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid FOCAL backend.');
  for(const stage of stages){const g=model?.graphs?.[stage],identity=FOCAL_MODEL.graphs[stage];requireValue(g&&g.sha256===identity.sha256&&(g.data instanceof Uint8Array||typeof g.url==='string'),'FOCAL requires every pinned graph as explicit bytes or URL.');}
  checkAbort(signal);this.running=true;const abort=()=>this.stop();signal.addEventListener('abort',abort,{once:true});let freeResult,prepared,returned=false;
  try{
   const key=this.prefix+backend,hit=this.budget.get(key);let output=hit?.value;
   if(!output){
    if(this.image.readRows)prepared=await prepareResearchRows(this.image,{method:'focal',budget:this.budget,signal,onProgress:e=>onProgress?.({...e,fraction:0})});
    let provider=backend==='cpu'?'wasm':backend==='webgpu'||typeof navigator.gpu!=='undefined'?'webgpu':'wasm',maximumHeapBytes=512*MiB;const failures=[];let attempts=0;
    for(;;){
     const prepareHeapBytes=prepared?0:Math.ceil((this.image.data.byteLength+32*MiB)/65536)*65536,maxGraph=Math.max(...Object.values(FOCAL_MODEL.graphs).map(g=>g.bytes)),supplied=Object.values(model.graphs).reduce((n,g)=>n+(g.data?.byteLength??0),0),gpuBytes=provider==='webgpu'?768*MiB:0,admitted=maximumHeapBytes+prepareHeapBytes+(prepared?prepared.tensor.byteLength*2:this.image.data.byteLength*2)+maxGraph*3+supplied+gpuBytes+160*MiB;let freeWorker;
     try{freeWorker=this.budget.reserve(admitted);}catch(error){if(provider==='webgpu'&&backend==='auto'){failures.push({provider,stage:'admission',code:error.code});provider='wasm';continue;}throw error;}
     try{
      checkAbort(signal);this.worker=new Worker(new URL('./focal-worker.js',import.meta.url),{type:'module'});await this.rpc({task:'init',...(prepared?{prepared:prepared.tensor}:{image:this.image}),provider,maximumHeapBytes,prepareHeapBytes,threads:Math.min(8,this.profile.maxWorkers)});const runs=[];let final;
      for(let i=0;i<stages.length;i++){
       checkAbort(signal);const stage=stages[i];
       // The WebGPU distribution omits some CPU-only clustering kernels.
       // Keep the native clustering in the full WASM runtime, after neural work.
       if(stage==='cluster'&&provider==='webgpu'){const features=final.features;this.stop();this.worker=new Worker(new URL('./focal-worker.js',import.meta.url),{type:'module'});await this.rpc({task:'init',provider:'wasm',features,maximumHeapBytes,threads:Math.min(8,this.profile.maxWorkers)});}
       const supplied=model.graphs[stage],identity=FOCAL_MODEL.graphs[stage];onProgress?.({phase:'focal-'+stage,fraction:i/stages.length});checkAbort(signal);
       // Only the current stage's weights cross the worker boundary. Large
       // ViT-L distributions can therefore remain external and stream on demand.
       const bytes=supplied.data?await verifyM3Bytes(supplied.data,identity,signal):await fetchM3Asset(new URL(supplied.url,globalThis.location.href),identity,signal);checkAbort(signal);final=await this.rpc({task:'stage',stage,model:bytes});if(final.metadata.heapBytes>maximumHeapBytes)throw new EngineError('MEMORY_LIMIT','FOCAL runtime exceeded admitted heap.');runs.push(final.metadata);
      }
      checkAbort(signal);output={map:final.map,features:final.features,metadata:{image_shape:[this.image.height,this.image.width],analysis_shape:[1024,1024],native_shape:[64,64],seed:123,clusters:2,smallest_region_is_candidate:true,unused_checkpoint_heads:['fc.weight','fc.bias'],provider,runs,failures,attempts:attempts+1,maximumHeapBytes,gpuEstimatedBytes:gpuBytes,workerAdmittedBytes:admitted,preflightExecutions:0,qualification:'native-floating-arithmetic-differences-measured'}};freeResult=this.budget.reserve(output.map.byteLength+output.features.byteLength+16384);this.budget.put(key,{value:output,byteLength:output.map.byteLength+output.features.byteLength+16384});break;
     }catch(error){checkAbort(signal);failures.push({provider,stage:'useful-work',code:error.code,message:error.message});if(provider==='webgpu'&&backend==='auto'&&['FOCAL_FAILED','WORKER_FAILED','MEMORY_LIMIT'].includes(error.code)){provider='wasm';attempts++;continue;}if(error.code==='MEMORY_LIMIT'&&maximumHeapBytes<2048*MiB&&attempts<3){maximumHeapBytes=Math.min(2048*MiB,maximumHeapBytes*2);attempts++;continue;}throw error;}
     finally{this.stop();freeWorker();}
    }
   }
   freeResult??=this.budget.reserve((output.map.byteLength+output.features.byteLength+16384)*2);const owned=structuredClone(output);owned.metadata.result_reused=!!hit;checkAbort(signal);onProgress?.({phase:'complete',fraction:1});checkAbort(signal);returned=true;let released=false;return {...owned,release(){if(!released){released=true;freeResult();}}};
  }finally{prepared?.release();signal.removeEventListener('abort',abort);this.stop();if(!returned)freeResult?.();this.running=false;}
 }
}
