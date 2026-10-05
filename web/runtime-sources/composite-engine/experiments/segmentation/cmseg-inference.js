import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {readVerifiedModelAsset} from '../d2prl/model.js';
import {createCmsegBackbone} from './cmseg-backbone.js';
import {createCmsegCorrelation} from './cmseg-correlation.js';
import {createCmsegCorrelationGpu} from './cmseg-correlation-gpu.js';
import {createParameterCache,parameterCacheStats} from './parameter-cache.js';
import {createSessionCache,sessionCacheStats} from './session-cache.js';
const HEAP=512*1024**2,SHAPES=[[1,16,256,256],[1,24,128,128],[1,32,64,64],[1,96,32,32],[1,1280,16,16]];
const FEATURE_BYTES=SHAPES.reduce((n,shape)=>n+4*shape.reduce((a,b)=>a*b,1),0),CORRELATION_BYTES=4*(24*128**2+32*64**2+96*32**2);

export function createCmsegInference({budget,model,modelUrl,backend='cpu'}){
  requireValue(['cpu','webgpu'].includes(backend)&&(backend==='cpu'||model.backbone||model.correlationGpuOnly),'CMSeg backend unavailable');
  const residentCorrelation=!!(model.correlationGpuOnly||model.residentCorrelation);
  let backboneGraph,backboneMetadata,busy=false,disposed=false;
  const sessionCache=createSessionCache({budget,bytes:HEAP+3*(model.assetBytes+model.bytes),create:()=>new Worker(new URL('./cmseg-inference-worker.js',import.meta.url),{type:'module'})});
  const parameterCache=createParameterCache({budget,enabled:backend==='webgpu'&&!!model.backbone,read:(spec,hooks)=>readVerifiedModelAsset(new URL(spec.file,modelUrl).href,spec,hooks)});
  const correlation=createCmsegCorrelation({budget,parameterCache,moduleUrl:new URL(model.backbone?'../../vendor/segmentation/correlation-fma.js':'../../vendor/segmentation/correlation.js',import.meta.url).href});
  const correlationGpu=backend==='webgpu'?createCmsegCorrelationGpu({budget,parameterCache,rowsPerJob:64,residentInput:residentCorrelation,moduleUrl:new URL(model.correlationGpuOnly?'../../vendor/segmentation/cmseg-addnoise-correlation-gpu/post.js':'../../vendor/segmentation/cmseg-correlation-gpu/post.js',import.meta.url).href}):null;
  const settings={model,modelUrl,ortUrl:new URL('../../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,runtimeFactoryUrl:new URL('../../vendor/d2prl/factory.mjs',import.meta.url).href,wasmPaths:{mjs:new URL('../../vendor/d2prl/factory.mjs',import.meta.url).href,wasm:new URL('../../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href}};
  const rpc=(worker,message,signal,onProgress)=>new Promise((resolve,reject)=>{
    const cleanup=()=>{signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null;};
    const abort=()=>{cleanup();reject(new EngineError('CANCELLED','CMSeg inference cancelled'));};
    worker.onerror=event=>{cleanup();reject(new EngineError('WORKER_FAILED',event.message));};
    worker.onmessage=({data})=>{try{if(data.phase){onProgress?.(data);return;}cleanup();if(!data.ok)return reject(new EngineError('MODEL_FAILED',data.error));if(!Number.isInteger(data.heapBytes)||data.heapBytes>HEAP)return reject(new EngineError('MEMORY_LIMIT','CMSeg CNN heap'));resolve(data);}catch(error){cleanup();reject(error);}};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
    try{worker.postMessage({...settings,...message});}catch(error){cleanup();reject(error);}
  });
  return{
    model,correlationBackend:backend==='webgpu'?(residentCorrelation?'webgpu-resident-dot-128-wasm-rest':'webgpu-dot-128-wasm-rest'):'wasm-cpu',backend:backend==='webgpu'?'webgpu-cpu':'cpu',gpuMaximumBytes:backend==='webgpu'?64*1024**2:0,
    async run(input,{signal,onProgress}={}){
      requireValue(!disposed&&!busy&&input instanceof Float32Array&&input.length===3*512**2&&input.every(Number.isFinite),'Prepared CMSeg input required');checkAbort(signal);
      let scratch,outputRelease,complete=false,exactBackbone,backboneOutput,worker;const correlations=[],cacheStart=parameterCache.snapshot(),sessionStart=sessionCache.snapshot();
      try{
        if(model.backbone&&backend==='cpu')sessionCache.releaseIdle(); // Preserve useful CPU backbone admission.
        scratch=budget.reserve(input.byteLength*2+FEATURE_BYTES*3+CORRELATION_BYTES*3+4*512**2*4);outputRelease=budget.reserve(4*512**2);busy=true;
        let backboneMs=0,metadataLoadMs=0,parameterLoadMs=0,backboneSetupMs=0;
        if(model.backbone){
          if(!backboneGraph){const start=performance.now();let admitted;
            try{admitted=budget.reserve(model.backbone.bytes*10);const bytes=await readVerifiedModelAsset(new URL(model.backbone.file,modelUrl).href,model.backbone,{signal});const graph=JSON.parse(new TextDecoder().decode(bytes));checkAbort(signal);backboneGraph=graph;backboneMetadata=admitted;admitted=null;}finally{admitted?.();}metadataLoadMs=performance.now()-start;
          }
          const setupStarted=performance.now();exactBackbone=await createCmsegBackbone({budget,graph:backboneGraph,backend,maxWorkers:Math.max(1,Math.min(32,navigator.hardwareConcurrency||1)),read:parameterCache.read});
          backboneSetupMs=performance.now()-setupStarted;backboneOutput=await exactBackbone.run(input,{signal,onProgress});backboneMs=backboneOutput.timings.executionMs;parameterLoadMs=backboneOutput.timings.parameterLoadMs;exactBackbone.dispose();exactBackbone=null;
        }
        worker=sessionCache.acquire();
        const features=await rpc(worker,model.backbone?{kind:'bypass',input:backboneOutput.values.bypass.data}:{kind:'encoder',input},signal,onProgress);checkAbort(signal);
        if(model.backbone){for(const key of ['x2','x3','x4','x5'])features.values[key]={data:backboneOutput.values[key].data,shape:backboneOutput.values[key].shape};features.timings.inferenceMs+=backboneMs;features.timings.modelLoadMs+=metadataLoadMs+parameterLoadMs;}
        for(let i=0;i<SHAPES.length;i++){const value=features.values['x'+(i+1)];requireValue(value?.data instanceof Float32Array&&JSON.stringify(value.shape)===JSON.stringify(SHAPES[i])&&value.data.length===SHAPES[i].reduce((a,b)=>a*b,1),'CMSeg encoder output');}
        const feeds={x1:features.values.x1,x5:features.values.x5};let workers=0,observedCorrelationHeapBytes=0,correlationGpuMs=0,correlationGpuWriteBytes=0,correlationGpuReadBytes=0,correlationGpuPeak=0,correlationGpuAllocations=0;const started=performance.now();
        for(let i=0;i<3;i++){
          const value=features.values['x'+(i+2)],spec=model.correlation[i];
          const useGpu=correlationGpu&&i===0,begin=performance.now();
          const result=await (useGpu?correlationGpu:correlation).run({input:value.data,c:value.shape[1],h:value.shape[2],w:value.shape[3],k:spec.topk,alpha:spec.alpha},{signal,onProgress});
          if(useGpu){correlationGpuMs+=performance.now()-begin;correlationGpuWriteBytes+=result.timings.gpuWriteBytes;correlationGpuReadBytes+=result.timings.gpuReadBytes;correlationGpuPeak=Math.max(correlationGpuPeak,result.gpu.peakAccountedBytes);correlationGpuAllocations+=result.gpu.allocations;}
          correlations.push(result);feeds['c'+(i+2)]={data:result.data,shape:result.shape};workers=Math.max(workers,result.workers);observedCorrelationHeapBytes=Math.max(observedCorrelationHeapBytes,result.observedHeapBytes);
        }
        const correlationMs=performance.now()-started,decoded=await rpc(worker,{kind:'decoder',inputs:feeds},signal,onProgress);checkAbort(signal);
        const raw=decoded.values.probability?.data;requireValue(raw instanceof Float32Array&&raw.length===512**2&&raw.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'CMSeg probability grid');
        complete=true;return{raw,heapBytes:Math.max(features.heapBytes,decoded.heapBytes),ort:decoded.ort,modelId:model.id,workers,correlationObservedHeapBytes:observedCorrelationHeapBytes,gpu:backboneOutput?.gpu?{...backboneOutput.gpu,devices:backboneOutput.gpu.devices+(correlationGpuAllocations?1:0),simultaneousDeviceMaximum:1,allocations:backboneOutput.gpu.allocations+correlationGpuAllocations,peakAccountedBytes:Math.max(backboneOutput.gpu.peakAccountedBytes,correlationGpuPeak)}:correlationGpuAllocations?{devices:1,simultaneousDeviceMaximum:1,allocations:correlationGpuAllocations,peakAccountedBytes:correlationGpuPeak,accounting:'explicit GPU buffers, excludes driver/compiler residency',errors:[]}:undefined,sessionCache:backend==='webgpu'?sessionCacheStats(sessionCache,sessionStart):undefined,parameterCache:parameterCache.enabled?parameterCacheStats(parameterCache,cacheStart):undefined,
          timings:{modelLoadMs:features.timings.modelLoadMs+decoded.timings.modelLoadMs,inferenceMs:features.timings.inferenceMs+correlationMs+decoded.timings.inferenceMs,outputCopyMs:features.timings.outputCopyMs+decoded.timings.outputCopyMs,correlationMs,correlationGpuMs,backboneMs,backboneSetupMs,parameterLoadMs,gpuWriteBytes:(backboneOutput?.timings.gpuWriteBytes??0)+correlationGpuWriteBytes,gpuReadBytes:(backboneOutput?.timings.gpuReadBytes??0)+correlationGpuReadBytes},release:outputRelease};
      }finally{correlations.forEach(v=>v.release());backboneOutput?.release();exactBackbone?.dispose();scratch?.();if(worker)sessionCache.unlock();busy=false;if(!complete){outputRelease?.();sessionCache.releaseIdle();}}
    },
    dispose(){requireValue(!busy,'CMSeg inference busy');if(disposed)return;disposed=true;sessionCache.dispose();correlation.dispose();correlationGpu?.dispose();parameterCache.dispose();backboneMetadata?.();backboneMetadata=undefined;backboneGraph=undefined;}
  };
}
