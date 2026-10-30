import "../../runtime-context.js?v=0.30.0";
import {VIG_WINDOW_HEAD_BASE_CREDIT,vigWindowHeadWorkspace} from './mgcfdn-vig-window-head-memory.js';
import {requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {MGCFDN_VIG_WINDOW_SOURCE_SHA256,rewriteMgcfdnVigWindowContexts} from './mgcfdn-vig-window-head-graph.js';

export const VIG_WINDOW_HEAD_PINS=Object.freeze({base:Object.freeze({bytes:28780877,sha256:MGCFDN_VIG_WINDOW_SOURCE_SHA256})});
const LIMIT=512*1024**2,labels=new Set(['normalize-candidates','global-consistency','window-pools','context-f3','candidate-attention','context-decode']);
// One unchanged native VIG WASM tail lane, separate from its real GPU backbone. Dependencies are explicit to test retirement with
// controlled tensors/sessions without constructing an ORT session or GPU.
// The Worker entry supplies the shipped runtime and pinned asset reader.
export function createVigWindowHeadStageRuntime({budget,read,createSession,createTensor,gpu,heapBytes,version,signal,onOwner,contextCells,candidateCells}){
  requireValue(budget?.reserve&&typeof read==='function'&&typeof createSession==='function'&&typeof createTensor==='function'&&gpu?.begin&&gpu?.end&&gpu?.snapshot&&typeof heapBytes==='function','Native bounded VIG dependencies required');
  requireValue(Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&Number.isSafeInteger(candidateCells)&&candidateCells>=40&&candidateCells<=contextCells,'Distinct VIG context/candidate populations required');
  const jobs=new Set(),controller=new AbortController();let running,closing,closed=false,currentSession,currentLabel,head,baseCredit,sessionNeedsRetirement=false,gpuNeedsEnd=false;
  const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
  const current=()=>{checkAbort(combined);requireValue(!closed&&!closing,'VIG head WASM lane retired');};
  const retireJob=async job=>{await retireCompositeOwners([...job.tensors].map(t=>async()=>{await t.dispose();job.tensors.delete(t);}));job.temporaryCredit?.();job.temporaryCredit=undefined;jobs.delete(job);};
  const retireSession=async()=>{if(currentSession){sessionNeedsRetirement=true;await currentSession.release();currentSession=undefined;currentLabel=undefined;sessionNeedsRetirement=false;}};
  const retireGpu=async()=>{if(gpuNeedsEnd){await gpu.end();gpuNeedsEnd=false;}};
  // Synchronous ownership publication precedes model fetch, graph rewrite,
  // session construction, or a result whose cleanup might later reject.
  const owner={release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}await retireGpu();await retireCompositeOwners([...jobs].map(job=>()=>retireJob(job)));await retireSession();head?.dispose();head=undefined;baseCredit?.();baseCredit=undefined;closed=true;})().finally(()=>closing=undefined);return closing;},get pendingACKs(){return jobs.size+(currentSession?1:0)+(gpuNeedsEnd?1:0);}};
  onOwner?.(owner);
  async function bytesFor(label){
    if(!head){let credit=budget.reserve(VIG_WINDOW_HEAD_BASE_CREDIT);try{const bytes=await read('base',VIG_WINDOW_HEAD_PINS.base,{signal:combined});current();head=await rewriteMgcfdnVigWindowContexts(bytes,{budget,signal:combined,contextCells,candidateCells});baseCredit=credit;credit=undefined;}finally{credit?.();}}
    return head.stages.find(s=>s.label===label).bytes;
  }
  async function work(label,feeds,{own,signal:jobSignal}={}){
    current();checkAbort(jobSignal);requireValue(labels.has(label)&&typeof own==='function','Exact native VIG WASM head stage and parent owner required');
    // Failed tensor/session ACKs block the next useful run, including all
    // falsy/frozen refusals. Never silently replace that still-live session.
    await retireGpu();await retireCompositeOwners([...jobs].map(job=>()=>retireJob(job)));if(sessionNeedsRetirement)await retireSession();current();checkAbort(jobSignal);
    const job={tensors:new Set(),temporaryCredit:budget.reserve(vigWindowHeadWorkspace(feeds))};jobs.add(job);let published=false,copiedCredit,copiedBytes=0;
    const result={outputs:null,metrics:null,async release(){if(published){result.outputs=null;copiedCredit?.();copiedCredit=undefined;published=false;}}};
    try{
      own(result);
      if(currentLabel!==label){await retireSession();current();const bytes=await bytesFor(label);current();currentSession=await createSession(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});currentLabel=label;current();}
      const nativeFeeds={};for(const[name,t]of Object.entries(feeds)){requireValue(t.data instanceof Float32Array&&Array.isArray(t.dims)&&t.dims.every(n=>Number.isSafeInteger(n)&&n>=0)&&t.dims.reduce((a,b)=>a*b,1)===t.data.length,'Exact FP32 native VIG head feeds required');const value=createTensor('float32',t.data,t.dims);job.tensors.add(value);nativeFeeds[name]=value;}
      let outputs,failed=false,primary;try{gpuNeedsEnd=true;await gpu.begin();outputs=await currentSession.run(nativeFeeds);for(const t of Object.values(outputs))job.tensors.add(t);}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([retireGpu],failed?{primary}:{});}
      current();checkAbort(jobSignal);
      // Copied outputs are a different lifetime from native input/scratch.
      // Reserve their exact FP32 extents BEFORE reading/copying output data.
      for(const t of Object.values(outputs))if(t.type==='float32'){requireValue(Array.isArray(t.dims)&&t.dims.every(n=>Number.isSafeInteger(n)&&n>=0),'Native FP32 output dimensions required');const bytes=t.dims.reduce((n,v)=>n*BigInt(v),4n);requireValue(bytes<=BigInt(Number.MAX_SAFE_INTEGER-copiedBytes),'Native copied output admission overflow');copiedBytes+=Number(bytes);}
      copiedCredit=budget.reserve(copiedBytes);const copied={};for(const[name,t]of Object.entries(outputs)){if(t.type==='float32'){requireValue(t.data instanceof Float32Array&&t.data.byteLength===t.dims.reduce((n,v)=>n*v,4),'Native FP32 output extent differs');copied[name]={data:new Float32Array(t.data),dims:[...t.dims]};}}

      const heap=heapBytes(),stats=gpu.snapshot();requireValue(Number.isSafeInteger(heap)&&heap>0&&heap<=LIMIT,'Original VIG tailWASM512MiB maximum required');
      await retireJob(job);current();checkAbort(jobSignal);result.outputs=copied;result.metrics={backend:'cpu-wasm',stage:label,stageBackends:['wasm'],heapBytes:heap,gpu:stats,ort:version,numThreadsPerSession:1,wasmMaximumBytes:LIMIT,gpuMaximumBytes:0,contextCells,candidateCells,copiedOutputBytes:copiedBytes,graphMemory:budget.snapshot()};published=true;return result;
    }finally{if(!published){copiedCredit?.();copiedCredit=undefined;if(!job.tensors.size)await retireJob(job);}}
  }
  function run(label,feeds,options){requireValue(!running&&!closed&&!closing,'VIG head WASM stage busy or retired');const promise=Promise.resolve().then(()=>work(label,feeds,options));running=promise;promise.then(()=>{if(running===promise)running=null;},()=>{if(running===promise)running=null;});return promise;}
  return Object.freeze({run,release:owner.release,get pendingACKs(){return owner.pendingACKs;}});
}
