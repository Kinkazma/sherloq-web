import "../../runtime-context.js?v=0.30.0";
import {neuralWindowAck} from './neural-window-job-owner.js';
import {ALIKED_CM2_SEGMENTS} from './aliked-cm2-segments-assets.js';
import {extractAlikedSegmented} from './aliked-segmented.js';
import {createAlikedStrictOwner} from './aliked-strict-owner.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {describeAlikedPreparedKeys} from './aliked-prepared-key-sampler.js';
import {alikedNativeParameters} from './aliked-native-parameters.js';
import {ALIKED_NATIVE_RUNTIME_POLICY} from './aliked-native-output-transport.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {efficientLoFtrRuntimes} from './efficient-loftr-assets.js';
import {ALIKED_MODELS} from './aliked-assets.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2;

// Only the session boundary changes: the existing pool owns ORT, its real
// Workers, graph bytes and output loans. Core never imports an ORT runtime.
// CPU readback placement differs from native14 and needs its own native receipt.
export function createAlikedStrictPoolRuntime({provider,profile,models,inputSide=1024,detectionThreshold=.2,modelKind='aliked-n16',signal,onProgress,onPoolReceipt,poolFactory=(...a)=>new NeuralGraphPool(...a)}={}){
 alikedNativeParameters({inputSide,detectionThreshold});const fine=inputSide===2048&&provider==='wasm',fineOwners=new Set();const identity=ALIKED_MODELS[modelKind],grant=provider==='webgpu'?1:globalThis.crossOriginIsolated?Math.min(8,profile?.maxWorkers):1;
 requireValue(['wasm','webgpu'].includes(provider)&&identity&&models&&Number.isInteger(grant)&&grant>0,'Pinned ALIKED models, native provider and profile required.');
 for(const [name,id]of Object.entries(identity.graphs))requireValue(models[name]?.data instanceof Uint8Array&&models[name].data.byteLength===id.bytes&&models[name].sha256===id.sha256,'ALIKED pool model differs from its native identity.');
 let arena,pool,closing,closed=false,lastHeap=16*MiB,modelCredit,forwards=0,peakHeap=16*MiB;const urls=[],sessions=new Set(),actualThreads=new Set();
 const bounds=(name,inputs)=>{const n=inputs.image?inputs.image.dims[2]*inputs.image.dims[3]:inputs.scores?.data.length??inputs.features?.dims.slice(2).reduce((a,b)=>a*b,1)??0,k=inputs.indices?.data.length??(inputs.keypoints?.data.length??0)/2;
  const outputBytes=name==='dense'?516*n:name==='detect'?4*n+4:name==='localize'?16*k:640*k,workspaceBytes=name==='dense'?64*MiB+1536*n:name==='detect'?32*MiB+64*n:name==='localize'?32*MiB+64*n+1024*k:64*MiB+1536*n+32768*k,inputBytes=Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0);
  // The stage already prepays its full2GiB native runtime. Keep that
  // admitted CPU heap for dense too: native ORT allocations can fail before
  // reaching a smaller, geometry-only heuristic cap. No graph or resize changes.
  const cpuWorkspaceBytes=name==='dense'?2048*MiB-64*MiB-(pool?.modelCacheBytes??0)-2*identity.graphs[name].bytes:undefined;
  return{outputBytes,workspaceBytes,...(cpuWorkspaceBytes!==undefined?{cpuWorkspaceBytes}:{}),gpuWasmWorkspaceBytes:Math.max(256*MiB,64*MiB+inputBytes+outputBytes)};
 };
 const scoped=async(work,onOwner=()=>{})=>{let close;const owned=createAlikedStrictOwner({signal,onOwner:o=>{const own=o.own;o.own=(action,label)=>own(()=>neuralWindowAck(action),label);close=async()=>{await o.dispose();fineOwners.delete(close);};fineOwners.add(close);onOwner({dispose:close});}});let failed=false,primary,value;try{value=await owned.run(()=>work(owned));}catch(error){failed=true;primary=error;}if(failed){try{await close();}catch{}throw primary;}return{value,close};};
 const api={provider,runtimeHeapBytes:2048*MiB,executionKind:'native',
  bindRuntimeBudget(budget){requireValue(!closed&&!arena&&budget?.reserve,'ALIKED graph pool must bind once to its prepaid stage arena.');arena=budget;
   const bytes=Object.values(models).reduce((n,m)=>n+m.data.byteLength,0);modelCredit=arena.reserve(bytes);
   try{const assets={};for(const [name,id]of Object.entries(identity.graphs)){const url=URL.createObjectURL(new Blob([models[name].data]));urls.push(url);assets[name]={...id,url,wasmMaximumBytes:2048*MiB,...(provider==='webgpu'?{alikedNativeRuntimePolicy:ALIKED_NATIVE_RUNTIME_POLICY,...(name==='dense'?{preferredOutputLocation:{features:'gpu-buffer',scores:'cpu'}}:{})}:{})};}
    if(fine){const segmented=ALIKED_CM2_SEGMENTS[modelKind];requireValue(segmented?.checkpointSha256===identity.weightSha256,'Fine native operator checkpoint differs.');for(const [key,g]of Object.entries(segmented.assets))assets[key]={...g,url:new URL('../vendor/aliked-cm2-segments/'+modelKind+'/'+g.file,import.meta.url).href,wasmMaximumBytes:2048*MiB};}
    pool=poolFactory(arena,provider==='wasm'?{...profile,maxWorkers:grant}:profile,{assets,runtimes:efficientLoFtrRuntimes(),resourceOwner:'aliked-strict-native',retryableAlikedRetirement:provider==='webgpu'});return{dispose:()=>api.dispose()};
   }catch(error){for(const url of urls.splice(0))URL.revokeObjectURL(url);modelCredit?.();modelCredit=null;throw error;}
  },
  getActualHeapBytes:()=>lastHeap,
  metadata:()=>({adapter:'existing-neural-graph-pool/1',provider,requestedGrant:grant,actualThreadGrants:[...actualThreads],graphForwards:forwards,peakWasmHeapBytes:peakHeap,outputPlacement:provider==='webgpu'?'native14 dense GPU features and CPU scores; acknowledged GPU readback copied independently through existing Worker transport':'unchanged native WASM CPU output transport',runtimeHeapPolicy:provider==='webgpu'?'native14 full2GiB charged to the real pool slot':'unchanged native WASM'}),
  async dispose(){closed=true;if(closing)return closing;const task=(async()=>{for(const close of [...fineOwners])await close();for(const s of [...sessions])await s.release();if(pool){requireValue(typeof pool.disposeGracefully==='function','ALIKED native Worker retirement requires an acknowledged pool endpoint.');if(fine)await neuralWindowAck(()=>pool.disposeGracefully());else await pool.disposeGracefully();pool=null;}for(const url of urls.splice(0))URL.revokeObjectURL(url);modelCredit?.();modelCredit=null;})();closing=task;try{return await task;}finally{if(closing===task)closing=null;}},
  ort:{env:{wasm:{numThreads:grant}},Tensor:class{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}dispose(){}},InferenceSession:{async create(data,options){
   requireValue(!closed&&pool&&JSON.stringify(options.executionProviders)===JSON.stringify([provider]),'ALIKED session needs its admitted native provider.');checkAbort(signal);
   const name=Object.keys(models).find(n=>models[n].data===data);requireValue(name,'ALIKED session received another model buffer.');let active,retired=false,reply;
   const session={async run(inputs){requireValue(!retired&&!active,'ALIKED graph session is closed or busy.');checkAbort(signal);active=pool.run(name,inputs,{...bounds(name,inputs),backend:provider==='webgpu'?'webgpu':'cpu',signal,onProgress});
    try{reply=await active;checkAbort(signal);requireValue(reply.metrics?.provider===provider&&Number.isSafeInteger(reply.metrics.wasmHeapBytes)&&reply.metrics.wasmHeapBytes>=16*MiB&&reply.metrics.wasmHeapBytes<=2048*MiB,'ALIKED worker runtime exceeded its native provider/heap admission.');lastHeap=reply.metrics.wasmHeapBytes;peakHeap=Math.max(peakHeap,lastHeap);forwards++;actualThreads.add(reply.metrics.threads);await onPoolReceipt?.({graph:name,provider,threads:reply.metrics.threads,metrics:reply.metrics,outputTransport:'unchanged FP32 graph outputs, existing pool CPU readback; no graph rewrite'});
     return Object.fromEntries(Object.entries(reply.result).map(([key,t])=>[key,{...t,dispose(){}}]));
    }finally{active=null;}
   },async release(){retired=true;await active?.catch(()=>{});await reply?.release();reply=null;sessions.delete(session);}};sessions.add(session);return session;
  }}}
 };
 if(fine){
  const operatorPool={async run(...args){const reply=await pool.run(...args);forwards++;if(Number.isSafeInteger(reply.metrics?.wasmHeapBytes)){lastHeap=reply.metrics.wasmHeapBytes;peakHeap=Math.max(peakHeap,lastHeap);}actualThreads.add(reply.metrics?.threads??1);return reply;}};
  api.collectDense=async(prepared,c,{onOwner}={})=>{requireValue(!closed&&pool&&arena&&prepared instanceof Float32Array&&prepared.length===3*c.preparedWidth*c.preparedHeight,'Fine native dense input changed.');const held=await scoped(async owned=>{
   const raw=await extractAlikedSegmented({width:c.preparedWidth,height:c.preparedHeight},{pool:operatorPool,budget:arena,preparedFloat32:prepared,returnDense:true,retireDenseIntermediates:true,backend:'cpu',storage:'auto',windowBytes:64*MiB,signal:owned.signal,onProgress,onOwner:o=>owned.own(()=>o.dispose(),'fine native pyramid')});owned.own(()=>raw.release(),'fine native dense stores');checkAbort(owned.signal);const scores=allocateOwnedTypedArray(Float32Array,c.preparedWidth*c.preparedHeight,{budget:arena,owner:'aliked-strict-fine',label:'actual original fine dense scores'});owned.credit(()=>scores.release());await raw.scores.readInto(scores.data,0,{signal:owned.signal});return{scores:scores.data,store:raw.features};
  },onOwner);return{scores:held.value.scores,features:{readInto:(bytes,offset=0,options)=>held.value.store.readBytes(bytes,offset,options),dispose:held.close},dispose:held.close};};
  api.describePreparedKeys=async(features,keys,c,consume)=>{const held=await scoped(owned=>describeAlikedPreparedKeys(features,keys,c,{budget:arena,pool:operatorPool,owner:owned,signal:owned.signal,onProgress,consume}));let failed=false,primary;try{await held.close();}catch(error){failed=true;primary=error;}if(failed)throw primary;return held.value;};
 }
 return api;
}
