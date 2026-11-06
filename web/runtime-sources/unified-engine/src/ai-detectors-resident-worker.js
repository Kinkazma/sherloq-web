import "../../runtime-context.js?v=0.31.0";
// CF model-session cache prototype: source-independent, no scalar result cache.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=e=>({code:e?.code??'CF_ERROR',message:e?.message??String(e),...(e?.cleanupErrors?{cleanupErrors:e.cleanupErrors.map(plain)}:{})});
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
let model=null,queue=Promise.resolve(),cancelled=false,controller=null,closing=false;
const check=()=>{if(cancelled)throw fail('CANCELLED','CF resident job cancelled');};
async function weights(stage,url){
 const response=await fetch(new URL(stage.file,url),{cache:'no-store',signal:controller.signal});
 if(!response.ok)throw fail('MODEL_UNAVAILABLE','CF stage unavailable');
 const bytes=new Uint8Array(stage.bytes),reader=response.body.getReader();let offset=0;
 try{for(;;){check();const {done,value}=await reader.read();if(done)break;if(offset+value.length>bytes.length)throw fail('MODEL_INTEGRITY','CF stage exceeded manifest');bytes.set(value,offset);offset+=value.length;}}
 finally{await reader.cancel();reader.releaseLock();}
 if(offset!==bytes.length||await digest(bytes)!==stage.sha256)throw fail('MODEL_INTEGRITY','CF stage integrity mismatch');return bytes;
}
async function gpuSetup(record){
 const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw fail('GPU_UNAVAILABLE','CF WebGPU unavailable');
 const request=adapter.requestDevice.bind(adapter);
 adapter.requestDevice=async descriptor=>{
  const device=record.device=await request(descriptor);record.deviceDestroyed=false;
  device.lost.then(info=>{record.lost=info;}).catch(()=>{});
  const create=device.createBuffer.bind(device);
  device.createBuffer=descriptor=>{
   if(!Number.isSafeInteger(descriptor.size)||descriptor.size<0||descriptor.size>device.limits.maxBufferSize||record.gpuLive+descriptor.size>512*1024**2)throw fail('GPU_MEMORY_LIMIT','CF retained GPU buffers exceed512MiB');
   const buffer=create(descriptor),destroy=buffer.destroy.bind(buffer);let retired=false;record.gpuLive+=descriptor.size;record.gpuPeak=Math.max(record.gpuPeak,record.gpuLive);record.gpuCreated++;
   buffer.destroy=()=>{if(retired)return;destroy();retired=true;record.gpuLive-=descriptor.size;};return buffer;
  };return device;
 };
 record.ort.env.webgpu.adapter=adapter;
}
async function initialize(job){
 if(model)throw fail('BUSY','CF model already initialized');if(closing)throw fail('DISPOSED','CF worker closing');
 cancelled=false;controller=new AbortController();const start=performance.now();
 const contracts=await import(job.config.contractModuleUrl);contracts.validateAiManifest(job.manifest,'community-forensics');
 if(job.manifest.stages.length>4)throw fail('MODEL_CONTRACT','Resident prototype requires grouped CF stages (at most4)');
 const ort=await import(job.config.ortModuleUrl),policy=job.policy??{};
 if(![1,2,4].includes(policy.cpuThreads??1))throw fail('MODEL_CONTRACT','Unsupported CF thread limit');
 ort.env.wasm.numThreads=crossOriginIsolated?(policy.cpuThreads??1):1;ort.env.wasm.proxy=false;if(job.config.ortWasmPaths)ort.env.wasm.wasmPaths=job.config.ortWasmPaths;
 const record=model={ort,contracts,manifest:job.manifest,backend:job.backend,policy,sessions:[],device:null,deviceDestroyed:true,gpuLive:0,gpuPeak:0,gpuCreated:0,lost:null,inferences:0};
 if(job.backend==='webgpu'){
  const policyModule=await import(job.config.gpuPolicyModuleUrl);
  if(!policyModule.AI_GPU_BROWSER_FAMILIES.includes(policyModule.aiDetectorBrowserFamily()))throw fail('GPU_UNAVAILABLE','CF GPU family is not qualified');
  await gpuSetup(record);
 }
 for(let i=0;i<job.manifest.stages.length;i++){
  check();const stage=job.manifest.stages[i],bytes=await weights(stage,job.manifestUrl);check();
  const cpu=job.backend==='cpu'||(policy.cpuEdges===true&&(i===0||i===job.manifest.stages.length-1))||(policy.cpuHead===true&&i===job.manifest.stages.length-1);
  // Keep bytes immutable while the associated session is retained. There is
  // deliberately no shared weight arena that a live session could still read.
  const item={stage,bytes,session:null,backend:cpu?'cpu':'webgpu'};record.sessions.push(item);
  item.session=await ort.InferenceSession.create(bytes,{executionProviders:cpu?['wasm']:['webgpu','wasm'],graphOptimizationLevel:'all',enableCpuMemArena:false,enableMemPattern:false});
  if(item.session.inputNames.length!==1||item.session.inputNames[0]!==stage.inputNames[0]||item.session.outputNames.join('\0')!==stage.outputNames.join('\0'))throw fail('MODEL_CONTRACT','CF resident session names mismatch');
 }
 await fence(record);
 if(job.backend==='webgpu'&&(!record.device||!record.gpuCreated))throw fail('GPU_TRACKING_UNAVAILABLE','CF WebGPU resource ownership was not observed');
 return{initializationMs:performance.now()-start,stageCount:record.sessions.length,retainedModelBytes:record.sessions.reduce((n,s)=>n+s.bytes.byteLength,0)};
}
async function fence(record){if(record?.device){if(record.lost)throw fail('GPU_DEVICE_LOST','CF resident device was lost');await record.device.queue.onSubmittedWorkDone();}}
async function infer(job){
 if(!model||closing)throw fail('DISPOSED','CF resident model unavailable');cancelled=false;const record=model,{ort,contracts}=record,start=performance.now();let current,outputs,primary;
 const timings=[];
 try{
  contracts.validateAiTensor({type:'float32',data:job.data,dims:job.dims},record.manifest.input.dims);const inputSha256=await digest(new Uint8Array(job.data.buffer,job.data.byteOffset,job.data.byteLength));check();
  current=new ort.Tensor('float32',job.data,job.dims);
  for(const item of record.sessions){
   check();const t=performance.now();contracts.validateAiTensor(current,item.stage.inputShape);outputs=await item.session.run({[item.stage.inputNames[0]]:current});check();
   const shapes=contracts.aiOutputShapes(item.stage);if(Object.keys(outputs).length!==item.stage.outputNames.length)throw fail('MODEL_CONTRACT','CF output count mismatch');
   for(const name of item.stage.outputNames)contracts.validateAiTensor(outputs[name],shapes[name]);
   const next=outputs[item.stage.outputNames[0]];current.dispose();current=next;for(const tensor of Object.values(outputs))if(tensor!==next)tensor.dispose();outputs=null;
   timings.push({stage:item.stage.name,backend:item.backend,computeMs:performance.now()-t});
  }
  contracts.validateAiTensor(current,[1,1]);const logit=Number(current.data[0]);if(!Number.isFinite(logit))throw fail('NUMERICAL_ERROR','CF resident non-finite logit');
  const score=logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit));record.inferences++;
  return{logit,score,inputSha256,totalMs:performance.now()-start,timings,modelInferenceOrdinal:record.inferences,performancePolicy:{prefetch:false,residentSessions:true,cpuThreads:ort.env.wasm.numThreads,cpuEdges:record.policy.cpuEdges===true,cpuHead:record.policy.cpuHead===true},temporaryStorageBytes:0,gpu:{tracking:record.gpuCreated>0,limits:{maxBufferSize:record.device?.limits.maxBufferSize??null,maxStorageBufferBindingSize:record.device?.limits.maxStorageBufferBindingSize??null},peakRequestedBufferBytes:record.gpuPeak,liveRequestedBufferBytes:record.gpuLive,createdBuffers:record.gpuCreated,physicalMemoryMeasured:false}};
 }catch(error){primary=error;throw error;}
 finally{
  const errors=[];for(const tensor of new Set([...Object.values(outputs??{}),...(current?[current]:[])]))try{tensor.dispose();}catch(e){errors.push(e);}
  try{await fence(record);}catch(e){errors.push(e);}
  if(errors.length){const e=new AggregateError([...(primary?[primary]:[]),...errors],primary?.message??'CF inference retirement failed',{cause:primary});e.code=primary?.code??'CF_RETIREMENT_PENDING';e.cleanupErrors=errors;throw e;}
 }
}
async function dispose(){
 closing=true;cancelled=true;controller?.abort();const record=model;
 if(!record)return{sessionsReleased:0,deviceDestroyed:true,retainedModelBytes:0};
 const errors=[];let released=0;
 for(const item of record.sessions)if(item.session)try{await item.session.release();item.session=null;item.bytes=null;released++;}catch(e){errors.push(e);}
 if(record.device&&!record.deviceDestroyed){
  try{if(!record.lost)await record.device.queue.onSubmittedWorkDone();}catch(e){errors.push(e);}
  try{record.device.destroy();record.deviceDestroyed=true;record.gpuLive=0;}catch(e){errors.push(e);}
 }
 if(errors.length){const e=new AggregateError(errors,'CF model retirement failed');e.code='CF_RETIREMENT_PENDING';e.cleanupErrors=errors;throw e;}
 model=null;return{sessionsReleased:released,deviceDestroyed:record.deviceDestroyed,retainedModelBytes:0,gpuLiveRequestedBufferBytes:record.gpuLive,gpuPeakRequestedBufferBytes:record.gpuPeak};
}
onmessage=({data})=>{
 if(data?.cfResident!==1)return;
 if(data.action==='cancel'){cancelled=true;controller?.abort();return;}
 if(data.action==='dispose'){closing=true;cancelled=true;controller?.abort();}
 const run=async()=>{
  try{let value;if(data.action==='initialize')value=await initialize(data);else if(data.action==='infer')value=await infer(data);else if(data.action==='dispose')value=await dispose();else throw fail('INVALID_INPUT','Unknown CF resident action');
   postMessage({cfResident:1,id:data.id,ok:true,value,executionRetired:true,retirementAck:data.action==='dispose'});if(data.action==='dispose')close();
  }catch(error){let executionRetired=false;try{await fence(model);executionRetired=!error?.cleanupErrors?.length;}catch{}
   const reported=cancelled&&data.action!=='dispose'?Object.assign(fail('CANCELLED','CF resident job cancelled'),error?.cleanupErrors?{cleanupErrors:error.cleanupErrors}:{}):error;
   postMessage({cfResident:1,id:data.id,ok:false,error:plain(reported),executionRetired,retirementAck:false});}
 };
 queue=queue.then(run,run);
};
