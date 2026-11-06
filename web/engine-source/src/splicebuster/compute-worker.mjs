/* Dedicated CPU worker; no independent Budget or hardware quota. */
import {EngineError,serializeEngineError,requireValue} from '../errors.js';
import {installWorkerMessageProtocol} from '../worker-message-protocol.js';
let backend,features,pending,busy=false,grant;
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
function transfers(result){return [...new Set(Object.values(result).filter(ArrayBuffer.isView).map(a=>a.buffer))];}
installWorkerMessageProtocol(self,async data=>{
 if(data.command==='execute'){if(!grant||data.id!==pending?.id)throw new EngineError('WORKER_PROTOCOL','No matching admitted task.');const resume=grant;grant=null;resume();return;}
 requireValue(data.command==='run'&&!busy,'Worker requires one run at a time.');busy=true;pending=data;
 const started=performance.now();let initializationMs=0;
 try {
  let binary,factory;
  if(data.kind==='statistics'&&!backend){
   const module=await import(data.runtime?.moduleURL??'./cpu/backend.mjs');factory=module[data.runtime?.factory??'createCpuBackend'];
   const response=await fetch(data.runtime.url);if(!response.ok)throw new EngineError('MODEL_FETCH','Unable to fetch Splicebuster CPU module.');
   binary=new Uint8Array(await response.arrayBuffer());
   if(binary.byteLength!==data.runtime.bytes||await sha(binary)!==data.runtime.sha256)throw new EngineError('MODEL_IDENTITY','Splicebuster CPU module identity mismatch.');
  } else if(data.kind==='features'&&!features)features=await import('./features/backend.mjs');
  await new Promise(resolve=>{grant=resolve;self.postMessage({id:data.id,executionReady:true});});
  const computeStart=performance.now();
  if(factory){backend=await factory({memoryMaximumBytes:data.heapMaximumBytes,wasmBinary:binary});binary=null;initializationMs=performance.now()-computeStart;}
  let result;
  if(data.kind==='statistics'){
   const allowed=['prepare','fitReplica','map','featureSums','featureCovarianceChunk','basis','projectChunk','trainingSums','varianceChunk','initialIndices','initialModel','expectationChunk','meanFromMoments','covarianceChunk','modelUpdate','factorModel'];
   requireValue(allowed.includes(data.operation)&&typeof backend[data.operation]==='function','Unknown statistical operation.');
   result=backend[data.operation](data.inputs);if(ArrayBuffer.isView(result))result={[({map:'map',basis:'basis',initialIndices:'indices',meanFromMoments:'mu'})[data.operation]]:result};
  } else {
   requireValue(['prepareRaw','poolRows','normalize'].includes(data.operation),'Unknown feature operation.');
   result=await features[data.operation](data.inputs);
  }
  const computeMs=performance.now()-computeStart-initializationMs;
  pending=null;self.postMessage({id:data.id,result,heapBytes:backend?.heapBytes()??0,timing:{computeMs,initializationMs,workerMs:performance.now()-started}},transfers(result));
 }catch(error){pending=null;self.postMessage({id:data.id,error:serializeEngineError(error,'SPLICBUSTER_EXECUTION')});}
 finally{busy=false;pending=null;grant=null;}
},{label:'splicebuster-compute',onFailure:error=>{self.postMessage({id:pending?.id??0,error:serializeEngineError(error,'WORKER_PROTOCOL')});}});
