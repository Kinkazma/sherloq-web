import {SPARSE_GLUE_PAGED_MODELS} from './sparse-glue-paged-assets.js';
import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
import {sparseGlueCandidates,selectSparseGlue} from './sparse-glue-candidates.js';
import {EngineError,requireValue,checkAbort} from './errors.js';import {verifyM3Bytes} from './m3-asset.js';
export const SPARSE_GLUE_MODELS=Object.freeze({
 xfeat:{bytes:4707762,sha256:'b9c8ef4e5f6e2e5d4899205eb5c0033529c7204fffae71c799db05c7a6be8870',weightSha256:'766102df37f11189efe5b0811d1f47c72b22629b79bfabfcfff9d2a2f84654b8'},
 aliked:{bytes:45997931,sha256:'f1a27b3203d5bbeab0e6ff13047eaa016af5d28c21d9c25d6e7d88c1c102f6a3',weightSha256:'d975e965b105311a6143194852297dff4f02aea5cc2e10cecfed966ca0e22503'},
 sift:{bytes:45998811,sha256:'5b08e8ae8524a73cfa95eb0b86597300cfa84e0b3253199e69b1c67d32eab804',weightSha256:'5b52b8d9982d43532dc042606b346bb9594c9f5a4bd6f64362c63866287b4ac0'}
});
const MiB=1024**2;
export class SparseGlueEngine{
 constructor(budget,profile){requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'Sparse Glue requires a shared memory budget and worker profile.');this.budget=budget;this.profile=profile;this.running=false;this.disposed=false;}
 stop(){this.worker?.terminate();this.worker=null;this.reject?.(new EngineError('CANCELLED','Sparse Glue stopped.'));this.reject=null;}
 dispose(){this.disposed=true;this.stop();}
 async match(settings,{kind='xfeat',model,backend='auto',imageSize,signal,onProgress,reserveMemory}={}){
  const paged=model?.sha256===SPARSE_GLUE_PAGED_MODELS[kind]?.sha256,identity=(paged?SPARSE_GLUE_PAGED_MODELS:SPARSE_GLUE_MODELS)[kind],{points,descriptors,members,zoneCount,descriptorSize,compare=false,radius,minimum,threshold}=settings;
  requireValue(!this.disposed&&!this.running&&typeof Worker!=='undefined'&&identity&&['auto','cpu','webgpu'].includes(backend),'Sparse Glue unavailable or busy.');
  requireValue(model?.data instanceof Uint8Array&&model.sha256===identity.sha256&&typeof reserveMemory==='function','Pinned sparse Glue graph and result memory admission required.');
  requireValue(points instanceof Float64Array&&points.length%7===0&&points.every(Number.isFinite)&&descriptors instanceof Float32Array&&descriptors.every(Number.isFinite)&&descriptorSize===(kind==='xfeat'?64:128)&&descriptors.length===points.length/7*descriptorSize,'Invalid learned points or descriptors.');
  requireValue(Number.isInteger(zoneCount)&&zoneCount>0&&members instanceof Uint8Array&&members.length===points.length/7*zoneCount&&members.every(x=>x<2)&&(!compare||zoneCount===2),'Invalid learned memberships.');
  requireValue(Number.isFinite(radius)&&radius>0&&Number.isFinite(minimum)&&minimum>=0&&minimum<=radius&&Number.isFinite(threshold)&&threshold>0&&threshold<=1&&Array.isArray(imageSize)&&imageSize.length===2&&imageSize.every(x=>Number.isInteger(x)&&x>0),'Invalid learned search settings.');
  requireValue(!settings.radii||settings.radii.length===zoneCount&&Array.from(settings.radii).every(x=>Number.isFinite(x)&&x>=0),'Invalid learned zone radii.');
  requireValue(!settings.gap||settings.gap.length===2&&Array.from(settings.gap).every(Number.isFinite),'Invalid comparison gap.');
  requireValue(!settings.axes||settings.axes.length===2&&settings.axes.every(a=>ArrayBuffer.isView(a)&&a.length&&a.every(Number.isFinite)),'Invalid compact axes.');
  checkAbort(signal);const abort=()=>this.stop(),freeModel=this.budget.reserve(model.data.byteLength*2);this.running=true;signal?.addEventListener('abort',abort,{once:true});const rows=new TypedPages(Float64Array,5,reserveMemory);
  try{
   await verifyM3Bytes(model.data,identity,signal);checkAbort(signal);const runs=[],failures=[];let evaluated=0;
   for(let zone=0;zone<(compare?1:zoneCount);zone++){
    const frees=[],admit=n=>{const f=this.budget.reserve(n);frees.push(f);return f;};
    try{
     admit(points.length/7*16);const job=await sparseGlueCandidates(settings,zone,{signal,reserveMemory:admit});if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');if(!job)continue;const edges=job.edges.length/2,heads=kind==='xfeat'?1:4,dim=kind==='xfeat'?96:256;admit(edges*(paged?80:48)+(job.a.length+job.b.length)*(descriptorSize+4)*8);
     const inputs={...(!paged?{edges:{data:BigInt64Array.from(job.edges,BigInt),shape:[edges,2]}}:{}),imageSize:{data:Float32Array.from(imageSize),shape:[2]}};
     for(const [side,ids] of [[0,job.a],[1,job.b]]){const coords=new Float32Array(ids.length*2),desc=new Float32Array(ids.length*descriptorSize),so=new Float32Array(ids.length*2);for(let i=0;i<ids.length;i++){coords.set(points.subarray(ids[i]*7,ids[i]*7+2),i*2);desc.set(descriptors.subarray(ids[i]*descriptorSize,(ids[i]+1)*descriptorSize),i*descriptorSize);so.set([points[ids[i]*7+2],points[ids[i]*7+3]*(Math.PI/180)],i*2);}inputs['keypoints'+side]={data:coords,shape:[ids.length,2]};inputs['descriptors'+side]={data:desc,shape:[ids.length,descriptorSize]};inputs['scaleOri'+side]={data:so,shape:[ids.length,2]};}
     let provider=backend==='cpu'?'wasm':backend==='webgpu'||typeof navigator.gpu!=='undefined'?'webgpu':'wasm',maximumHeapBytes=paged?512*MiB:Math.min(2048*MiB,Math.ceil((128*MiB+identity.bytes*4+edges*heads*64+Math.max(job.a.length,job.b.length)*heads*128*20+(job.a.length+job.b.length)*dim*64)/(64*MiB))*64*MiB),attempts=0;
     for(;;){
      checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');let freeWorker;const gpuBytes=paged?512*MiB:provider==='webgpu'?identity.bytes*3+edges*heads*64+Math.max(job.a.length,job.b.length)*heads*128*20:0;
      try{freeWorker=this.budget.reserve(maximumHeapBytes+gpuBytes+64*MiB);}catch(error){if(provider==='webgpu'&&backend==='auto'){failures.push({zone,provider,stage:'admission',code:error.code});provider='wasm';continue;}throw error;}
      try{
       const worker=new Worker(new URL(paged?'./sparse-glue-paged-worker.js':'./sparse-glue-worker.js',import.meta.url),{type:'module'});this.worker=worker;const result=await new Promise((resolve,reject)=>{this.reject=reject;worker.onmessage=({data})=>data.progress!==undefined?onProgress?.((zone+data.progress)/(compare?1:zoneCount)):data.error?reject(new EngineError(data.error,data.message)):resolve(data);worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message));worker.postMessage({model:model.data,inputs,...(paged?{edges:job.edges}:{}),provider,maximumHeapBytes,threads:Math.min(8,this.profile.maxWorkers)});});checkAbort(signal);
       const selected=selectSparseGlue(job,result.confidence,threshold);for(const row of selected)rows.push(...row,job.zone);evaluated+=edges;runs.push({...result.metadata,zone,candidates:edges,gpuEstimatedBytes:gpuBytes});break;
      }catch(error){checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');failures.push({zone,provider,stage:'useful-work',code:error.code,message:error.message});if(provider==='webgpu'&&backend==='auto'&&['LEARNED_INFERENCE_FAILED','WORKER_FAILED','MEMORY_LIMIT'].includes(error.code)){provider='wasm';attempts++;continue;}if(error.code==='MEMORY_LIMIT'&&maximumHeapBytes<2048*MiB&&attempts<3){maximumHeapBytes=paged?512*MiB:Math.min(2048*MiB,maximumHeapBytes*2);attempts++;continue;}throw error;}
      finally{this.reject=null;this.worker?.terminate();this.worker=null;freeWorker();}
     }
     onProgress?.((zone+1)/(compare?1:zoneCount));
    }finally{frees.forEach(f=>f());}
   }
   checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');const {pairs,pairSearchRegions}=finishCorrespondences(rows);return {pairs,pairSearchRegions,candidateComparisons:evaluated,backend:runs.some(r=>r.provider==='webgpu')?'hybrid':'cpu',metadata:{kind,runs,failures,preflightExecutions:0}};
  }finally{rows.dispose();signal?.removeEventListener('abort',abort);this.stop();freeModel();this.running=false;}
 }
}
