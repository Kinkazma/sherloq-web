import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {allocateWasmMemory,allocateOwnedTypedArray,wasmAllocationFailure} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2,page=65536,maximum=2*1024**3;
const names=['thrs','fids','child','segs','nSegs','eBins','eBnds'];
export function ssgNpyPayload(bytes,array){
 requireValue(bytes instanceof Uint8Array&&bytes.length>=10&&bytes[0]===147&&new TextDecoder().decode(bytes.subarray(1,6))==='NUMPY'&&bytes[6]===1,'SSG requires a standard NPY1 model array.');
 const offset=10+new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(8,true),header=new TextDecoder().decode(bytes.subarray(10,offset));
 requireValue(header.includes("'descr': '"+array.dtype+"'")&&(!header.includes("'fortran_order': False")||array.shape.length===1)&&offset+array.dataBytes===bytes.length,'SSG NPY dtype/layout/length differs from its identity.');return bytes.subarray(offset);
}
export function ssgEdgesMemoryPlan(width,height,modelBytes=218140772){
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>=16),'Invalid SSG forest geometry.');
 const padded=(width+35)*(height+35),bytes=Math.ceil((modelBytes+padded*150+64*MiB)/page)*page;
 if(bytes>maximum)throw new EngineError('MEMORY_LIMIT','SSG structured-forest workspace exceeds the qualified wasm32 arena.',{details:{width,height,requestedBytes:bytes,maximumBytes:maximum,allocationKind:'wasm',bandedPathAvailable:false}});
 return {maximumBytes:bytes,initialPages:512,maximumPages:bytes/page,workspaceBytes:padded*150,modelBytes};
}
export function createSsgEdges({budget,profile,fetcher=fetch,moduleImporter=url=>import(url)}={}){
 requireValue(budget&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'SSG forest requires a shared budget and worker profile.');
 const scheduler=getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers});let runtime,memory,releaseHeap,manifest,identity,cap=0,busy=false,closed=false,modelPointers=[];
 const retire=()=>{if(busy)return 0;const bytes=memory?.buffer.byteLength??0;try{runtime?._ssg_edges_shutdown?.();}finally{runtime=null;memory=null;manifest=null;identity=null;cap=0;modelPointers=[];releaseHeap?.();releaseHeap=null;if(bytes)budget.notifyBackingRelease?.('wasm',bytes);}return bytes;};
 const cleanupCause=(primary,cleanup)=>{primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),serializeEngineError(cleanup)]};};
 const unregister=budget.registerReclaimer?.(retire,{owner:'ssg-edges',label:'idle immutable structured-forest model',allocationKind:'wasm'});
 async function withAsset(spec,signal,consume){const release=budget.reserve(spec.bytes);let backing;try{const bytes=await fetchVerifiedAsset(spec,{signal,fetcher});backing=budget.registerBacking?.('array-buffer',bytes.byteLength,{owner:'ssg-download',label:spec.url,identity:bytes.buffer});return await consume(bytes);}finally{const retired=backing?.();release();if(backing&&retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??spec.bytes);}}
 async function ensure(spec,plan,signal){
  if(runtime&&identity===spec.sha256&&cap>=plan.maximumBytes)return true;
  const active=busy;busy=false;retire();busy=active;releaseHeap=budget.reserve(plan.maximumBytes);cap=plan.maximumBytes;
  try{
   manifest=await withAsset(spec,signal,bytes=>JSON.parse(new TextDecoder().decode(bytes)));requireValue(manifest.schema==='sherloq.ssg-structured-forest/1'&&manifest.nodes===79861&&manifest.arrays.length===7&&names.every((n,i)=>manifest.arrays[i].name===n)&&manifest.opts.sharpen===2&&manifest.opts.nTreesEval===4,'SSG requires the pinned original structured-forest model.');
   const shared=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function'&&profile.maxWorkers>1,base=shared?'edges-shared':'edges',script=manifest.runtime[base+'.mjs'],binary=manifest.runtime[base+'.wasm'];requireValue(script&&binary,'SSG forest runtime identity missing.');
   const jsUrl=new URL(base+'.mjs',spec.url).href,wasmUrl=new URL(base+'.wasm',spec.url).href;
   await withAsset({...script,url:jsUrl},signal,()=>{});
   memory=allocateWasmMemory({initial:plan.initialPages,maximum:plan.maximumPages,...(shared?{shared:true}:{})},{label:'SSG shared immutable model and reusable workspace'});
   runtime=await withAsset({...binary,url:wasmUrl},signal,async wasmBinary=>(await moduleImporter(jsUrl)).default({wasmMemory:memory,wasmBinary,maximumHeapBytes:cap,workerCount:shared?Math.max(1,profile.maxWorkers-1):1,mainScriptUrlOrBlob:globalThis.process?.versions?.node&&jsUrl.startsWith('file:')?decodeURIComponent(new URL(jsUrl).pathname):jsUrl}));
   for(const a of manifest.arrays){checkAbort(signal);await withAsset({...a,url:new URL(a.file,spec.url).href},signal,bytes=>{const p=runtime._malloc(a.dataBytes);if(!p)throw wasmAllocationFailure(runtime,'SSG model allocation failed.',a.dataBytes);runtime.HEAPU8.set(ssgNpyPayload(bytes,a),p);modelPointers.push(p);});}
   const status=runtime._ssg_edges_set_model(...modelPointers,manifest.nodes,manifest.arrays[5].shape[0],manifest.arrays[6].shape[0]);requireValue(status===0,'SSG forest model initialization failed.');identity=spec.sha256;runtime.ssgShared=shared;return false;
  }catch(error){const active=busy;busy=false;try{retire();}catch(cleanup){cleanupCause(error,cleanup);}finally{busy=active;}throw error;}
 }
 return {
  releaseIdle:retire,
  dispose(){requireValue(!busy,'SSG forest busy.');closed=true;retire();unregister?.();},
  async run({rgb,width,height,model},hooks={}){
   requireValue(!busy&&!closed&&rgb instanceof Uint8Array&&rgb.length===width*height*3,'Invalid or busy SSG structured-forest input.');checkAbort(hooks.signal);const plan=ssgEdgesMemoryPlan(width,height);busy=true;let lease,input=0,owner,complete=false,primaryError;
   try{
    const reused=await ensure(model,plan,hooks.signal),cpu=runtime.ssgShared?profile.maxWorkers:1;lease=await scheduler.acquire({cpu,signal:hooks.signal,label:'ssg-structured-forest',resourceOwner:'ssg'});runtime._ssg_edges_set_team(cpu);
    input=runtime._malloc(rgb.length);if(!input)throw wasmAllocationFailure(runtime,'SSG forest image allocation failed.',rgb.length);
    // MATLAB channels are column-major planar RGB; original image remains RGB8
    // row-major. Populate only the admitted native input, without a JS duplicate.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)runtime.HEAPU8[input+c*width*height+x*height+y]=rgb[(y*width+x)*3+c];
    checkAbort(hooks.signal);const started=performance.now(),count=runtime._ssg_edges_detect(input,height,width,0);
    if(count===-2)throw wasmAllocationFailure(runtime,'SSG forest workspace allocation failed.',runtime._ssg_edges_allocation_bytes());if(count<0)throw new EngineError('FEATURE_EXTRACTION_FAILED','SSG structured forest failed.',{details:{stage:'structured-forest',nativeStatus:count}});requireValue(count===width*height,'SSG forest output dimensions differ.');checkAbort(hooks.signal);
    owner=allocateOwnedTypedArray(Float32Array,count,{budget,owner:'ssg-edge-map',label:'SSG true structured-edge output'});const p=runtime._ssg_edges_output()/4;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)owner.data[y*width+x]=runtime.HEAPF32[p+x*height+y];
    const output={edgeMap:owner.data,width,height,metadata:{modelSha256:model.sha256,modelBytes:plan.modelBytes,sharpen:2,nTreesEval:4,sharedImmutableModel:runtime.ssgShared,cpuTeamAdmitted:cpu,physicalCpuMeasured:false,runtimeReused:reused,wallMs:performance.now()-started,heapBytes:memory.buffer.byteLength},release(){owner.release();output.edgeMap=null;}};complete=true;return output;
   }catch(error){primaryError=error;throw error;}finally{let cleanupError;const clean=action=>{try{action();}catch(error){if(primaryError)cleanupCause(primaryError,error);else cleanupError??=error;}};clean(()=>runtime?._ssg_edges_release());clean(()=>{if(input)runtime?._free(input);});clean(()=>lease?.release());if(!complete)clean(()=>owner?.release());busy=false;if(!complete)clean(retire);if(cleanupError)throw cleanupError;}
  },
 };
}
