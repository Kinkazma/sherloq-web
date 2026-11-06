// One bounded ORT heap, one layer session, no browser storage/cache calls.
import {validateAiManifest,validateAiTensor,aiOutputShapes} from './ai-detectors-runtime.js';
import {aiDetectorBrowserFamily,AI_GPU_BROWSER_FAMILIES} from './ai-detectors-gpu-policy.js';
let cancelled=false,active=false;
const cancelledError=()=>Object.assign(new Error('AI detection cancelled.'),{code:'CANCELLED'});
const check=()=>{if(cancelled)throw cancelledError();};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function plainError(error){return{code:error?.code??'AI_INFERENCE_ERROR',message:error?.message??String(error),...(Array.isArray(error?.cleanupErrors)?{cleanupErrors:error.cleanupErrors}:{})};}
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
async function weightBytes(url,stage,controller,arena){
 const response=await fetch(url,{cache:'no-store',signal:controller.signal});
 if(!response.ok)throw Object.assign(new Error(`Model layer unavailable (${response.status}).`),{code:'MODEL_UNAVAILABLE'});
 // Stream into one admitted fixed allocation: a forged Content-Length cannot
 // cause an unbounded arrayBuffer() before the manifest size is checked.
 const data=new Uint8Array(arena.buffer,0,stage.bytes),reader=response.body.getReader();let offset=0;
 try{for(;;){check();const {done,value}=await reader.read();if(done)break;if(offset+value.length>data.length)throw Error('Model layer size exceeded manifest.');data.set(value,offset);offset+=value.length;}}
 finally{await reader.cancel();reader.releaseLock();}
 if(offset!==data.length||await digest(data)!==stage.sha256)throw Object.assign(new Error('Model layer integrity mismatch.'),{code:'MODEL_INTEGRITY'});
 return data;
}

async function run(job){
 const start=performance.now(),controller=new AbortController();let session,ort,current,outputs,primary,failed=false,gpuDevice,gpuLost,gpuResourceFailure;
 let gpuLiveBytes=0,gpuPeakBytes=0,gpuCreatedBuffers=0,gpuTracking=false;
 const policy=job.performance??{},prefetch=policy.prefetch===true;let pendingWeight=null;
 const yieldChannel=policy.fastYield===true&&!globalThis.scheduler?.yield?new MessageChannel():null;
 const cooperate=()=>policy.fastYield!==true?tick():globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>{yieldChannel.port1.onmessage=resolve;yieldChannel.port2.postMessage(0);});
 if(![1,2,4].includes(policy.cpuThreads??1))throw Error('Unsupported detector thread limit');
 const abortFetch=()=>controller.abort();
 globalThis.aiAbortFetch=abortFetch;
 try{
  validateAiManifest(job.manifest,job.manifest?.method);
  validateAiTensor({type:'float32',dims:job.manifest.input.dims,data:job.data},job.manifest.input.dims);
  // A layer's model bytes remain intact through run and awaited release.
  // Reuse the same admitted backing only after that acknowledgement, avoiding
  // a new ~50 MB garbage-collected allocation for every transformer layer.
  const maxWeight=Math.max(...job.manifest.stages.map(stage=>stage.bytes));
  const weightArenas=Array.from({length:prefetch?2:1},()=>new Uint8Array(maxWeight));
  const loadStage=async i=>{const started=performance.now();const data=await weightBytes(new URL(job.manifest.stages[i].file,job.manifestUrl),job.manifest.stages[i],controller,weightArenas[i%weightArenas.length]);return{data,started,finished:performance.now()};};
  const inputSha256=await digest(new Uint8Array(job.data.buffer,job.data.byteOffset,job.data.byteLength));
  ort=await import(job.ortModuleUrl);check();
  ort.env.wasm.numThreads=globalThis.crossOriginIsolated?(policy.cpuThreads??1):1;ort.env.wasm.proxy=false;
  if(job.ortWasmPaths)ort.env.wasm.wasmPaths=job.ortWasmPaths;
  if(job.backend==='webgpu'){
   if(!AI_GPU_BROWSER_FAMILIES.includes(aiDetectorBrowserFamily()))throw Object.assign(new Error('GPU worker lifecycle is not qualified in this browser; use CPU.'),{code:'GPU_UNAVAILABLE'});
   const adapter=await navigator.gpu?.requestAdapter();check();
   if(!adapter)throw Object.assign(new Error('WebGPU adapter unavailable.'),{code:'GPU_UNAVAILABLE'});
   // This pinned ORT accepts a supplied adapter and creates its own device.
   // Wrap that actual request; supplying env.webgpu.device is not an input API.
   const request=adapter.requestDevice.bind(adapter);
   adapter.requestDevice=async descriptor=>{
    try{gpuDevice=await request(descriptor);}catch(error){gpuResourceFailure=Object.assign(new Error('WebGPU device unavailable.',{cause:error}),{code:'GPU_UNAVAILABLE'});throw gpuResourceFailure;}
    gpuDevice.lost.then(info=>{gpuLost=info;}).catch(()=>{});
    const nativeCreate=gpuDevice.createBuffer.bind(gpuDevice);
    gpuDevice.createBuffer=descriptor=>{
     const bytes=descriptor.size;
     if(!Number.isSafeInteger(bytes)||bytes<0||bytes>gpuDevice.limits.maxBufferSize||gpuLiveBytes+bytes>512*1024**2){gpuResourceFailure=Object.assign(new Error('WebGPU detector buffer budget exceeded.'),{code:'GPU_MEMORY_LIMIT'});throw gpuResourceFailure;}
     const buffer=nativeCreate(descriptor),destroy=buffer.destroy.bind(buffer);let retired=false;
     gpuLiveBytes+=bytes;gpuPeakBytes=Math.max(gpuPeakBytes,gpuLiveBytes);gpuCreatedBuffers++;
     buffer.destroy=()=>{if(retired)return;destroy();retired=true;gpuLiveBytes-=bytes;};return buffer;
    };
    gpuTracking=true;return gpuDevice;
   };
   ort.env.webgpu.adapter=adapter;
  }
  current=new ort.Tensor('float32',job.data,job.manifest.input.dims);
  const timings=[];
  if(prefetch)pendingWeight=loadStage(0);
  for(let i=0;i<job.manifest.stages.length;i++){
   await cooperate();check();const stage=job.manifest.stages[i],started=performance.now();
   const weight=await(prefetch?pendingWeight:loadStage(i));let bytes=weight.data;pendingWeight=null;check();
   const loaded=performance.now();
   if(prefetch&&i+1<job.manifest.stages.length){pendingWeight=loadStage(i+1);void pendingWeight.catch(()=>{});}
   const stageBackend=job.backend==='webgpu'&&!(policy.cpuEdges===true&&(i===0||i===job.manifest.stages.length-1))&&!(policy.cpuHead===true&&i===job.manifest.stages.length-1)?'webgpu':'cpu';
   session=await ort.InferenceSession.create(bytes,{executionProviders:stageBackend==='webgpu'?['webgpu','wasm']:['wasm'],graphOptimizationLevel:'all',enableCpuMemArena:false,enableMemPattern:false});
   if(session.inputNames.length!==1||session.inputNames[0]!==stage.inputNames[0]||session.outputNames.length!==stage.outputNames.length||session.outputNames.some((name,i)=>name!==stage.outputNames[i]))throw Object.assign(new Error('Unexpected detector session inputs or outputs.'),{code:'MODEL_CONTRACT'});
   bytes=null;check();const computeStart=performance.now();
   validateAiTensor(current,stage.inputShape);
   outputs=await session.run({[stage.inputNames[0]]:current});check();
   if(gpuLost)throw Object.assign(new Error('WebGPU device was lost.'),{code:'GPU_DEVICE_LOST'});
   const shapes=aiOutputShapes(stage);
   if(Object.keys(outputs).length!==stage.outputNames.length)throw Object.assign(new Error('Unexpected detector output count.'),{code:'MODEL_CONTRACT'});
   for(const name of stage.outputNames)validateAiTensor(outputs[name],shapes[name]);
   // Outputs requested in CPU memory survive the release of their session.
   const next=outputs[stage.outputNames[0]];
   validateAiTensor(next,stage.outputShape);
   current.dispose();current=next;
   for(const [name,tensor] of Object.entries(outputs))if(tensor!==next)tensor.dispose();outputs=null;
   const computeEnd=performance.now();await session.release();session=null;
   timings.push({stage:stage.name,backend:stageBackend,weightLoadMs:weight.finished-weight.started,fetchHashMs:loaded-started,sessionAndComputeMs:computeEnd-loaded,computeMs:computeEnd-computeStart,totalMs:performance.now()-started});
   postMessage({type:'progress',event:{phase:'ai-inference',completed:i+1,total:job.manifest.stages.length,fraction:(i+1)/job.manifest.stages.length}});
  }
  check();validateAiTensor(current,[1,1]);const logit=Number(current.data[0]);
  if(job.backend==='webgpu'&&(!gpuTracking||!gpuCreatedBuffers))throw Object.assign(new Error('WebGPU resource ownership was not observed.'),{code:'GPU_TRACKING_UNAVAILABLE'});
  if(!Number.isFinite(logit))throw Object.assign(new Error('Non-finite detector logit.'),{code:'NUMERICAL_ERROR'});
  const score=logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit));
  return{logit,score,inputSha256,timings,totalMs:performance.now()-start,backend:job.backend,temporaryStorageBytes:0,performancePolicy:{prefetch,fastYield:policy.fastYield===true,cpuEdges:policy.cpuEdges===true,cpuHead:policy.cpuHead===true,cpuThreads:ort.env.wasm.numThreads},weightArenaBytes:weightArenas.reduce((n,a)=>n+a.byteLength,0),gpu:gpuDevice?{peakRequestedBufferBytes:gpuPeakBytes,createdBuffers:gpuCreatedBuffers,tracking:gpuTracking,physicalMemoryMeasured:false,limits:{maxBufferSize:gpuDevice.limits.maxBufferSize,maxStorageBufferBindingSize:gpuDevice.limits.maxStorageBufferBindingSize}}:null};
 }catch(error){failed=true;primary=error;
  if(!cancelled&&error?.code!=='NUMERICAL_ERROR'){
   if(gpuLost)primary=Object.assign(new Error('WebGPU device was lost.',{cause:error}),{code:'GPU_DEVICE_LOST'});
   else if(gpuResourceFailure)primary=gpuResourceFailure;
  }
  throw primary;
 }
 finally{
  const cleanup=[];
  const tensors=new Set([...Object.values(outputs??{}),...(current?[current]:[])]);
  for(const tensor of tensors)try{tensor.dispose();}catch(error){cleanup.push(error);}
  try{await session?.release();}catch(error){cleanup.push(error);}
  if(gpuDevice){try{if(!gpuLost)await gpuDevice.queue.onSubmittedWorkDone();}catch(error){cleanup.push(error);}try{gpuDevice.destroy();}catch(error){cleanup.push(error);}}
  yieldChannel?.port1.close();yieldChannel?.port2.close();controller.abort();if(pendingWeight)try{await pendingWeight;}catch{}globalThis.aiAbortFetch=null;
  if(cleanup.length){
   // The original failure may be frozen or even a primitive. Preserve it as
   // cause and never attach diagnostic fields to an object we do not own.
   const failure=new AggregateError(failed?[primary,...cleanup]:cleanup,failed?(primary?.message??String(primary)):'Detector layer retirement failed.',failed?{cause:primary}:undefined);
   failure.code=failed?(primary?.code??'AI_INFERENCE_ERROR'):'AI_RETIREMENT_ERROR';
   failure.cleanupErrors=cleanup.map(plainError);throw failure;
  }
 }
}
onmessage=async({data})=>{
 if(data.type==='cancel'){cancelled=true;globalThis.aiAbortFetch?.();return;}
 if(data.type!=='run'||active)return;active=true;cancelled=false;
 try{const result=await run(data);postMessage({type:'complete',result});}
 catch(error){const failure=cancelled?Object.assign(cancelledError(),Array.isArray(error?.cleanupErrors)?{cleanupErrors:error.cleanupErrors}:{}):error;postMessage({type:'error',error:plainError(failure)});}
 finally{close();}
};
