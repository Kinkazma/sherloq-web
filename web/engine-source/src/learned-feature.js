import {deserializeWorkerError} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {extractXfeatPaged} from './xfeat-paged.js';
import {XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
import {prepareAlikedRows} from './aliked-rows.js';
import {researchRows} from './m3-research-rows.js';
import {ALIKED_MODELS} from './aliked-assets.js';
import {alikedShape} from './aliked-worker.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {verifyM3Bytes} from './m3-asset.js';
const MiB=1024**2;
// Graph and checkpoint identities are independent: callers provide external ONNX
// bytes. A path, a claimed checkpoint name, or matching shapes are not enough.
export const XFEAT_MODEL=Object.freeze({bytes:2678811,sha256:'b7c5ba6f2f007d2b7462f32ffc9f537e4d78918d6e5ea8dd39de2caef6426319',weightSha256:'0f5187fd7bedd26c7fe6acc9685444493a165a35ecc087b33c2db3627f3ea10b'});
export class LearnedFeatureEngine{
 constructor(budget,profile){requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'Learned features require a shared budget and worker profile.');this.budget=budget;this.resourceOwner='sift';this.profile=profile;this.running=false;this.disposed=false;this.worker=null;this.reject=null;}
 stop(){cancelScheduledWorkerCalls(this);this.pagedAbort?.abort();this.worker?.terminate();this.worker=null;this.reject?.(new EngineError('CANCELLED','Learned feature work stopped.'));this.reject=null;}
 dispose(){this.disposed=true;this.stop();}
 async extract(image,{family='XFeat',limit=6000,regions=[],excluded=[],signal,onProgress,model,backend='auto'}={}){
  requireValue(!this.running&&!this.disposed&&typeof Worker!=='undefined','Learned feature engine unavailable or busy.');
  const aliked=family==='ALIKED'||family==='ALIKED rotation',kind=family==='ALIKED rotation'?'aliked-n16rot':'aliked-n16';
  requireValue((family==='XFeat'||aliked)&&['auto','cpu','webgpu'].includes(backend),'Unsupported learned feature profile.');
  requireValue(image?.format==='rgb8'&&Number.isInteger(image.width)&&image.width>=(aliked?1:32)&&image.width<=16384&&Number.isInteger(image.height)&&image.height>=(aliked?1:32)&&image.height<=16384&&(typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'Invalid RGB image dimensions for the learned extractor.');
  requireValue(Number.isInteger(limit)&&limit>=100&&limit<=20000,'Invalid learned point count.');
  for(const polys of [regions,excluded])requireValue(Array.isArray(polys)&&polys.length<=10000&&polys.every(p=>Array.isArray(p)&&p.length>=3&&p.length<=100000&&p.every(xy=>Array.isArray(xy)&&xy.length===2&&xy.every(x=>Number.isFinite(x)&&Math.abs(x)<2**30))),'Invalid learned feature polygons.');
  if(family==='XFeat'&&model?.sha256===XFEAT_PAGED_MODEL.sha256){
   const controller=new AbortController(),abort=()=>controller.abort();this.pagedAbort=controller;this.running=true;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   try{return await extractXfeatPaged(image,{budget:this.budget,profile:this.profile,model,limit,regions,excluded,backend,signal:controller.signal,onProgress});}
   catch(error){checkAbort(controller.signal);throw error;}
   finally{signal?.removeEventListener('abort',abort);this.pagedAbort=null;this.running=false;}
  }
  const identities=aliked?ALIKED_MODELS[kind].graphs:{xfeat:XFEAT_MODEL},supplied=aliked?model?.graphs:{xfeat:model};for(const [name,identity] of Object.entries(identities))requireValue(supplied?.[name]?.data instanceof Uint8Array&&supplied[name].sha256===identity.sha256,'Explicit pinned learned ONNX graphs are required.');checkAbort(signal);
  const n=image.width*image.height,zoneCount=Math.max(1,regions.length),releaseModel=this.budget.reserve(Object.values(supplied).reduce((sum,g)=>sum+g.data.byteLength*2,8*MiB)),abort=()=>this.stop();this.running=true;signal?.addEventListener('abort',abort,{once:true});let freeResult,prepared,returned=false;
  try{
   for(const [name,identity] of Object.entries(identities))await verifyM3Bytes(supplied[name].data,identity,signal);checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Learned engine disposed.');
   if(aliked)prepared=await prepareAlikedRows(researchRows(image),{budget:this.budget,signal,onProgress:e=>onProgress?.({...e,fraction:e.fraction*.08})});
   let provider=backend==='cpu'?'wasm':backend==='webgpu'||typeof navigator.gpu!=='undefined'?'webgpu':'wasm';
   const [aw,ah]=aliked?alikedShape(image.width,image.height):[image.width,image.height],an=aw*ah,prepareHeapBytes=aliked?Math.ceil((an*36+32*MiB)/65536)*65536:0;requireValue(!aliked||(aw>=1&&ah>=1&&prepareHeapBytes<=2048*MiB),'Image exceeds the ALIKED preparation capacity.');
   const roundHeap=b=>Math.ceil(b/(64*MiB))*64*MiB,maskHeapBytes=Math.max(32*MiB,Math.ceil((n*2+32*MiB)/65536)*65536);let maximumHeapBytes=Math.min(2048*MiB,roundHeap(128*MiB+(aliked?an*(provider==='webgpu'?128:1536):n*512)));let executions=0,retries=0;const failures=[];
   for(;;){
    checkAbort(signal);const gpuBytes=provider==='webgpu'?64*MiB+(aliked?an*1536:n*768):0,overhead=64*MiB+n*(aliked?2:20)+(aliked?an*1024+20000*(56+512+zoneCount)*3:limit*(56+256+zoneCount)*3),workerBytes=maximumHeapBytes+maskHeapBytes+gpuBytes+overhead+prepareHeapBytes;
    let freeWorker;
    try{freeWorker=this.budget.reserve(workerBytes);}catch(error){if(provider==='webgpu'&&backend==='auto'){failures.push({provider,code:error.code,stage:'admission'});provider='wasm';if(aliked)maximumHeapBytes=Math.min(2048*MiB,roundHeap(128*MiB+an*1536));continue;}throw error;}
    try{
     const worker=new Worker(new URL('./learned-feature-worker.js',import.meta.url),{type:'module'});this.worker=worker;executions++;
     const threads=provider==='wasm'&&globalThis.crossOriginIsolated?Math.min(8,this.profile.maxWorkers):1;const result=await scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{this.reject=reject;worker.onmessage=({data})=>{if(data.progress){try{onProgress?.(data.progress);}catch(error){reject(error);}return;}data.error?reject(deserializeWorkerError(data.error,data.message)):resolve(data);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message||'Learned worker failed.'));worker.postMessage({image:aliked?{width:image.width,height:image.height}:image,...(prepared?{prepared:prepared.tensor}:{}),regions,excluded,limit,family,prepareHeapBytes,model:aliked?Object.fromEntries(Object.entries(supplied).map(([k,v])=>[k,v.data])):model.data,provider,maximumHeapBytes,maskHeapBytes,threads});}),{signal,cpu:threads,gpu:provider==='webgpu'?1:0,label:'learned-feature'});
     checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Learned engine disposed.');
     freeResult=this.budget.reserve(result.points.byteLength+result.descriptors.byteLength+result.members.byteLength+4096);let released=false;returned=true;
     return {...result,metadata:{...result.metadata,executions,retries,failures,gpuEstimatedBytes:gpuBytes,workerAdmittedBytes:workerBytes,preparation:prepared?.metrics},release(){if(!released){released=true;freeResult();}}};
    }catch(error){
     checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Learned engine disposed.');failures.push({provider,code:error.code,message:error.message,stage:'useful-work'});
     if(provider==='webgpu'&&backend==='auto'&&['LEARNED_INFERENCE_FAILED','WORKER_FAILED','MEMORY_LIMIT'].includes(error.code)){provider='wasm';if(aliked)maximumHeapBytes=Math.min(2048*MiB,roundHeap(128*MiB+an*1536));retries++;continue;}
     if(error.code==='MEMORY_LIMIT'&&maximumHeapBytes<2048*MiB&&retries<3){maximumHeapBytes=Math.min(2048*MiB,maximumHeapBytes*2);retries++;continue;}throw error;
    }finally{this.reject=null;this.worker?.terminate();this.worker=null;freeWorker();}
   }
  }finally{prepared?.release();signal?.removeEventListener('abort',abort);this.stop();releaseModel();if(!returned)freeResult?.();this.running=false;}
 }
}
