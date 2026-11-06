import {Budget} from './cache.js';
import {createNeuralWindowPeer,decodeNeuralWindowFailure} from './neural-window-peer.js';
import {createNeuralWindowGlueOrt} from './neural-window-glue-ort.js';
import {CSR_NATIVE_SOFTMAX_WASM} from './sparse-glue-csr-native-assets.js';
import {SPARSE_GLUE_PAGED_WASM} from './sparse-glue-paged-assets.js';
import {AcknowledgedPagedGlueAttention} from './sparse-glue-csr-ack-attention.js';
import {UsefulAutoGlueAttention} from './xfeat-glue-useful-auto.js';
import {serializeEngineError,EngineError,checkAbort} from './errors.js';
import {createDualGlueOwner} from './xfeat-glue-dual-owner.js';
import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {GlobalGlueAttention,glueCSR} from './xfeat-glue-global-attention.js';
async function evaluate(job,state){
 let attention;const start=performance.now();
 try{
  const {provider,maximumHeapBytes,threads,model,inputs,edges}=job;globalThis.__m3MaximumWasmPages=maximumHeapBytes/65536;
  const stageProvider='wasm',rawCpu=await import('../vendor/m3-ort/ort.wasm.min.mjs'),rawGpu=provider==='webgpu'&&job.kind==='xfeat'?(glueWindowOrt??=createNeuralWindowGlueOrt({cpu:rawCpu,peer:glueWindowPeer,signal:()=>active?.controller.signal,maximumJobBytes:glueWindowGrant?.maximumJobBytes,gpuWorkingBytes:glueWindowGrant?.gpuWorkingBytes,budget:glueWindowBudget,onOwner:owner=>{glueWindowOrt=owner;}})):provider==='webgpu'?await import('../vendor/m3-ort/ort.webgpu.min.mjs'):rawCpu,resources=(sharedResources??=createDualGlueOwner(rawCpu,rawGpu,{getSignal:()=>active?.controller.signal})),ort=resources.ort,attentionOrt=provider==='wasm'?resources.ort:resources.attentionOrt,factoryUrl=new URL('../vendor/m3-ort/factory.mjs',import.meta.url).href;
  state.resources=resources;checkAbort(state.controller.signal);if(provider==='webgpu'&&job.kind==='xfeat')glueWindowOrt.beginJob();
  ort.env.wasm.wasmBinary??=await fetchM3Asset(new URL(M3_ORT_ASSETS.cpu.path,import.meta.url),M3_ORT_ASSETS.cpu);ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(M3_ORT_ASSETS.cpu.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?threads:1;ort.env.wasm.proxy=false;
  if(provider==='webgpu'&&job.kind!=='xfeat'){const gpu=attentionOrt;gpu.env.wasm.wasmBinary??=await fetchM3Asset(new URL(M3_ORT_ASSETS.gpu.path,import.meta.url),M3_ORT_ASSETS.gpu);gpu.env.wasm.wasmPaths={mjs:new URL('../vendor/m3-ort/factory.asyncify.mjs',import.meta.url).href,wasm:new URL(M3_ORT_ASSETS.gpu.path,import.meta.url).href};gpu.env.wasm.numThreads=1;gpu.env.wasm.proxy=false;}
  if(!['identity-only-cross-final-spatial','spatial-cross-final-spatial','native-spatial-csr'].includes(job.callerPolicy))throw new EngineError('INVALID_INPUT','The intra-image XFeat caller requires explicit observation identity masking.');const size=new DataView(model.buffer,model.byteOffset,4).getUint32(0,true),manifest=JSON.parse(new TextDecoder().decode(model.subarray(4,4+size))),stages=new Map(manifest.stages.map(s=>[s.name,model.subarray(4+size+s.offset,4+size+s.offset+s.bytes)]));
  const kind=job.kind??'xfeat',expected=kind==='xfeat'?[1,96,6]:['aliked','sift'].includes(kind)?[4,256,9]:null;if(!expected||manifest.heads!==expected[0]||manifest.dim!==expected[1]||manifest.layers!==expected[2])throw new EngineError('ASSET_INTEGRITY','Unexpected pinned global Glue family dimensions.');
  const tensor=(data,dims)=>({data,dims}),run=async(name,sides)=>{let session;try{session=await ort.InferenceSession.create(stages.get(name),{executionProviders:[stageProvider],graphOptimizationLevel:'all'});const results=[];for(const side of sides){const tensors=[],feeds={};try{for(const key of session.inputNames){let source=side[key];const t=new ort.Tensor('float32',source.data,source.dims);tensors.push(t);feeds[key]=t;}const outputs=await session.run(feeds);tensors.push(...Object.values(outputs));results.push(Object.fromEntries(Object.entries(outputs).map(([k,t])=>[k,tensor(t.data.slice(),t.dims)])));}finally{for(const t of tensors)t.dispose();}}return results;}finally{await session?.release();}};
  const n=inputs.keypoints0.shape[0],m=inputs.keypoints1.shape[0],csr0=glueCSR(edges,n,0),csr1=glueCSR(edges,m,1),shapeInput=name=>tensor(inputs[name].data,inputs[name].shape),prepare=[0,1].map(side=>({keypoints:shapeInput('keypoints'+side),descriptors:shapeInput('descriptors'+side),scaleOri:shapeInput('scaleOri'+side),imageSize:shapeInput('imageSize')}));
  let sides=await run('prepare',prepare);attention=job.callerPolicy==='native-spatial-csr'?new AcknowledgedPagedGlueAttention({signal:state.controller.signal}):job.autoOperators?new UsefulAutoGlueAttention(ort,attentionOrt,{totalWork:manifest.layers*4*n*m*manifest.dim}):new GlobalGlueAttention(attentionOrt);if(job.callerPolicy==='native-spatial-csr'){state.additionalOwners??=[];state.additionalOwners.push(attention);}attention.signal=state.controller.signal;attention.verifyFmaEveryDot=false;await attention.open(provider);attention.spatialCrossMask=job.callerPolicy==='spatial-cross-final-spatial';attention.assignmentMaskFinal=attention.spatialCrossMask||job.callerPolicy==='identity-only-cross-final-spatial';const identities=job.callerPolicy==='identity-only-cross-final-spatial'?[job.observation0,job.observation1]:null;if(identities&&!identities.every((ids,i)=>ids instanceof Int32Array&&ids.length===(i?m:n)&&ids.every(x=>x>=0)))throw Error('Caller observation identities differ');
  for(let layer=0;layer<manifest.layers;layer++){
   const self=await run('self-'+layer,sides.map(s=>({x:s.x,cos:s.cos,sin:s.sin}))),contexts=[];
   contexts.push(await attention.attention(self[0].q.data,self[1].q.data,self[1].v.data,csr0,manifest.heads,manifest.dim/manifest.heads,identities?{query:identities[0],key:identities[1],queryBank:job.observationBank0??0,keyBank:job.observationBank1??0}:undefined));contexts.push(await attention.attention(self[1].q.data,self[0].q.data,self[0].v.data,csr1,manifest.heads,manifest.dim/manifest.heads,identities?{query:identities[1],key:identities[0],queryBank:job.observationBank1??0,keyBank:job.observationBank0??0}:undefined));
   const finished=await run('finish-'+layer,self.map((s,i)=>({x:s.next,context:tensor(contexts[i],[manifest.heads,i?m:n,manifest.dim/manifest.heads])})));sides=sides.map((s,i)=>({...s,x:finished[i].next}));postMessage({progress:(layer+1)/(manifest.layers+1),layer});
  }
  const last=await run('final',sides.map(s=>({x:s.x}))),confidence=await attention.assignment(last[0].projected.data,last[1].projected.data,last[0].matchability.data,last[1].matchability.data,edges,csr0,csr1),{heapBytes}=await import(factoryUrl);if(!confidence.every(Number.isFinite))throw Error('Nonfinite paged confidence');
  let maximumConfidence=0;const above={point1:0,point3:0,point7:0,point9:0};for(const c of confidence){maximumConfidence=Math.max(maximumConfidence,c);above.point1+=c>=.1;above.point3+=c>=.3;above.point7+=c>=.7;above.point9+=c>=.9;}return {confidence,metadata:{provider:job.autoOperators?(attention.selection.gpuPages||attention.selection.assignmentGpuPages?'webgpu':'wasm'):provider,...(job.autoOperators?{autoSelection:attention.selection}:{}),learnedStageProvider:stageProvider,learnedArtifactSha256:M3_ORT_ASSETS.cpu.sha256,operatorArtifactSha256:job.callerPolicy==='native-spatial-csr'?SPARSE_GLUE_PAGED_WASM.sha256:provider==='webgpu'?M3_ORT_ASSETS.gpu.sha256:M3_ORT_ASSETS.cpu.sha256,...(job.callerPolicy==='native-spatial-csr'?{operatorImplementation:provider==='webgpu'?'ordered GPU dot, Native CPU CSR weights, ordered GPU accumulation, unchanged CPU assignment/finish':'Native CPU CSR attention/assignment/finish',actualGpuWork:provider==='webgpu'&&attention.metrics.attentionPages>0}:{}),dualRuntime:job.callerPolicy!=='native-spatial-csr'&&provider==='webgpu',...(provider==='webgpu'&&job.kind==='xfeat'?{windowExecution:glueWindowOrt.execution,actualGpuWork:glueWindowOrt.execution.actualGpuWork}:{}),operatorThreads:job.callerPolicy==='native-spatial-csr'||provider==='webgpu'?1:threads,execution:job.callerPolicy==='native-spatial-csr'?'unchanged-native-spatial-csr-cpu-layers-gpu-attention':attention.spatialCrossMask?'native-spatial-candidates-cross-and-final':identities?'global-cross-except-same-source-observation-spatial-final':'complete-global-cross-attention-spatial-final',callerPolicy:job.callerPolicy??'authors-unmasked-reference',actualHeapBytes:heapBytes(),attentionHeapBytes:attention.cpu.HEAPU8.byteLength,nativeWeightsHeapBytes:attention.weightsCpu?.HEAPU8.byteLength??0,combinedAttentionHeapBytes:attention.cpu.HEAPU8.byteLength+(attention.weightsCpu?.HEAPU8.byteLength??0),nativeWeightsArtifactSha256:attention.weightsCpu?CSR_NATIVE_SOFTMAX_WASM.sha256:null,maximumHeapBytes,threads:ort.env.wasm.numThreads,totalMs:performance.now()-start,maximumConfidence,above,...attention.metrics}};
 }catch(error){throw error;}
}


let active=null,lastJob=null,sharedResources=null,closingContext=false;
let glueWindowPeer,glueWindowOrt,glueWindowGrant,glueWindowBudget;
const retireGlueContext=async()=>{const retirement=await(sharedResources?.retire()??{ack:true,state:{devices:0,tensors:0,sessions:0,unacknowledgedDevices:0}});if(retirement.ack&&!retirement.failed)await glueWindowOrt?.dispose();return retirement;};
const retire=async state=>{await state.compute;for(const owner of [...(state.additionalOwners??[])].reverse()){await owner.dispose();state.additionalOwners.splice(state.additionalOwners.indexOf(owner),1);}return state.resources?state.resources.retire():{ack:true,failed:false,state:{devices:0,sessions:0,tensors:0,unacknowledgedDevices:0}};};
const completion=async state=>{
 const retirement=await retire(state);
 if(retirement.failed&&!state.failed){state.failed=true;state.primary=retirement.error;}
 if(state.controller.signal.aborted&&!state.failed){state.failed=true;state.primary=new EngineError('CANCELLED','Sparse Glue cancelled.');}
 if(!retirement.ack&&!state.failed){state.failed=true;state.primary=new EngineError('WORKER_FAILED','Glue retirement requires another ACK.',{details:{glueRetirementPending:true}});}
 const packet={id:state.id,cleanupAck:retirement.ack,retirement:retirement.state};
 if(state.failed)packet.error=serializeEngineError(state.primary,'LEARNED_INFERENCE_FAILED');
 else{packet.result=state.result;packet.result.metadata={...packet.result.metadata,cleanupAck:true,retirement:retirement.state};}
 postMessage({glueComplete:packet},state.failed?[]:[state.result.confidence.buffer]);
 state.result=null;state.completed=true;lastJob=state;active=null;
};
self.onmessage=({data})=>{
 if(data.glueWindow){
  try{if(glueWindowPeer||active||closingContext)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue Window attachment.');glueWindowGrant=data.glueWindow;if(glueWindowGrant.localBudgetBytes!==64*1024**2)throw new EngineError('INVALID_INPUT','The unchanged Glue transport overhead is required.');const localBudget=glueWindowBudget=new Budget(glueWindowGrant.localBudgetBytes);glueWindowPeer=createNeuralWindowPeer({port:glueWindowGrant.port,nonce:glueWindowGrant.nonce,binding:glueWindowGrant.binding,budget:localBudget,onOwner:owner=>{glueWindowPeer=owner;}});}catch(error){postMessage({protocolError:error?.message??String(error)});}return;
 }
 if(data.neuralWindowControl){const control=data.neuralWindowControl;if(control.kind==='transport-failure')void glueWindowPeer?.settleTransportFailure(decodeNeuralWindowFailure(control.failure),{retired:control.retired===true});return;}
 if(data.glueJob){
  const job=data.glueJob;
  if(active||closingContext){postMessage({protocolError:'Dedicated Glue worker already received a job.'});return;}
  const state=active={id:job.id,controller:new AbortController(),resources:null,failed:false,result:null};
  state.compute=evaluate(job,state).then(result=>{state.result=result;},error=>{state.failed=true;state.primary=error;});
  void completion(state).catch(error=>postMessage({glueComplete:{id:state.id,cleanupAck:false,error:serializeEngineError(error,'WORKER_FAILED')}}));
 }else if(data.cancelGlue){if(active?.id===data.cancelGlue.id)active.controller.abort();}
 else if(data.closeGlue){const request=data.closeGlue;closingContext=true;active?.controller.abort();const compute=active?.compute??Promise.resolve();void compute.then(retireGlueContext).then(retirement=>postMessage({glueClosed:{...request,cleanupAck:retirement.ack,retirement:retirement.state,...(retirement.failed?{error:serializeEngineError(retirement.error,'WORKER_FAILED')}:{})}}),error=>postMessage({glueClosed:{...request,cleanupAck:false,error:serializeEngineError(error,'WORKER_FAILED')}}));}
 else if(data.retireGlue){const request=data.retireGlue,state=active??lastJob;if(!state||state.id!==request.id){postMessage({glueRetired:{...request,cleanupAck:false,error:serializeEngineError(new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue retirement job.'))}});return;}
  state.controller.abort();void retire(state).then(retirement=>postMessage({glueRetired:{...request,cleanupAck:retirement.ack,retirement:retirement.state,...(retirement.failed?{error:serializeEngineError(retirement.error,'WORKER_FAILED')}:{})}}),error=>postMessage({glueRetired:{...request,cleanupAck:false,error:serializeEngineError(error,'WORKER_FAILED')}}));
 }
};
postMessage({glueReady:true});
