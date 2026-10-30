import {d2prlInputSide} from './input-side.js';
import {loadRoleModel} from './role-model.js';
import {validateRoleRuntime,validateRoleFactory,validateRoleHeap} from './role-runtime.js';
import {strictRoleContract,validateStrictRoleFeeds} from './strict-role-contract.js';
import {adaptD2PRLFragmentRoleGraph,D2PRL_FRAGMENT_ROLE_GRAPHS} from '../../src/d2prl-fragment-role-graph.js';
import {adaptD2PRLFragmentRoleRoutingGraph} from '../../src/d2prl-fragment-role-routing-graph.js';
import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {requireValue,serializeEngineError} from '../../src/errors.js';
let inputSide=448,model,ort,runtime,bound,session,part,heapBytes=0,busy=false;
const reportHeap=()=>{const bytes=runtime?.heapBytes()??0;if(bytes&&bytes!==heapBytes){validateRoleHeap(bound,bytes);self.postMessage({phase:'parameter-backing',backing:{id:Number.MAX_SAFE_INTEGER,action:heapBytes?'resize':'allocate',kind:'wasm',bytes,label:'strict-role-ort'}});heapBytes=bytes;}};
installWorkerMessageProtocol(self,async data=>{
 const feeds={},outputs={};let response;
 try{
  requireValue(!busy,'Strict role worker is busy.');busy=true;
  if(data.type==='init'){requireValue(!model,'Strict role worker was already initialized.');inputSide=d2prlInputSide(data.inputSide);bound=validateRoleRuntime(data.roleRuntime,{modelBytes:data.modelBytes,modelSha256:data.modelSha256,inputs:data.modelInputs,outputs:data.modelOutputs});runtime=await import(data.runtimeFactoryUrl);validateRoleFactory(bound,runtime);ort=await import(data.ortUrl);ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=data.wasmPath;model=await loadRoleModel({modelUrl:data.modelUrl,modelBytes:data.modelBytes,modelSha256:data.modelSha256,onBacking:backing=>self.postMessage({phase:'parameter-backing',backing}),onRecovery:event=>self.postMessage({...event,phase:'resource-recovery'})});}
  else if(data.type==='run'){
   requireValue(model,'Strict role worker is not initialized.');const c=validateStrictRoleFeeds(data.part,data.feeds,inputSide);
   if(part!==data.part){await session?.release();session=null;part=null;const adapted=Object.hasOwn(D2PRL_FRAGMENT_ROLE_GRAPHS,data.part)?await adaptD2PRLFragmentRoleGraph(model.data,{part:data.part,inputSide}):await adaptD2PRLFragmentRoleRoutingGraph(model.data,{part:data.part,inputSide});session=await ort.InferenceSession.create(adapted.bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});part=data.part;reportHeap();}
   for(const p of c.inputs){const values=data.feeds[p.name];for(const value of values)requireValue(Number.isFinite(value),'Nonfinite strict role stage input.');feeds[p.name]=new ort.Tensor('float32',values,p.shape);}
   Object.assign(outputs,await session.run(feeds));reportHeap();const values={};for(const p of c.outputs){const t=outputs[p.name];requireValue(t?.data instanceof Float32Array&&t.data.length===p.shape.reduce((n,v)=>n*v,1),'Strict role output differs from its native tensor boundary.');for(const v of t.data)requireValue(Number.isFinite(v),'Nonfinite strict role stage output.');values[p.name]=t.data.slice();}response={values,part,heapBytes,ort:ort.env.versions};
  }else if(data.type==='dispose'){await session?.release();session=null;part=null;model?.release();model=null;reportHeap();}
  else requireValue(false,'Unknown strict role worker request.');
  if(response)self.postMessage({id:data.id,ok:true,...response},Object.values(response.values).map(v=>v.buffer));else self.postMessage({id:data.id,ok:true,heapBytes});
 }catch(error){try{reportHeap();}catch(cause){error=cause;}self.postMessage({id:data.id,ok:false,error:serializeEngineError(error)});}
 finally{for(const t of Object.values(feeds))t.dispose();for(const t of Object.values(outputs))t.dispose();busy=false;}
},{label:'d2prl-strict-roles',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
