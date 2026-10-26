import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {readVerifiedModelAsset} from '../d2prl/model.js';
import {createCmsegBackbone} from './cmseg-backbone.js';
import {createParameterCache} from './parameter-cache.js';
import {retireCompositeOwners} from '../../src/composite-owner-release.js';
export const CMSEG_WINDOW_NATIVE_SHAPES=Object.freeze([[1,16,256,256],[1,24,128,128],[1,32,64,64],[1,96,32,32],[1,1280,16,16]].map(Object.freeze));
const HEAP=512*1024**2,FEATURE_BYTES=CMSEG_WINDOW_NATIVE_SHAPES.reduce((n,s)=>n+4*s.reduce((a,b)=>a*b,1),0);
const exact=(value,shape)=>value?.data instanceof Float32Array&&JSON.stringify(value.shape)===JSON.stringify(shape)&&value.data.length===shape.reduce((a,b)=>a*b,1)&&value.data.every(Number.isFinite);

/** Exposes the ORIGINAL five encoder grids and ORIGINAL decoder as separate
 * stages. No graph, mean, convolution, weight or backend is rewritten here.
 * The existing native inference Worker remains the sole ORT owner; the native
 * custom backbone and parameter cache keep their existing implementations.
 */
export function createCmsegWindowCnnRuntime({budget,model,modelUrl,backend='cpu',maxWorkers,
 workerFactory=url=>new Worker(url,{type:'module'}),backboneFactory=createCmsegBackbone,
 readAsset=readVerifiedModelAsset,onOwner}={}){
 requireValue(budget?.reserve&&budget?.registerReclaimer&&['cpu','webgpu'].includes(backend)&&(backend==='cpu'||model?.backbone||model?.correlationGpuOnly||(model?.gpu?.correlationGpuOnly===true&&model.gpu.sharedAssets===true&&model.gpu.id===model.id&&model.gpu.sha256===model.sha256&&model.gpu.bytes===model.bytes))&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64,'Native CMSeg CNN, backend and requested worker grant required');
 const controller=new AbortController(),loans=new Set(),stageOwners=new Set(),heldCredits=new Set(),retirementErrors=[];let worker,workerCredit,leased=false,graph,graphCredit,running,closing,closed=false;
 const counts={workerCreations:0,workerReuses:0,pressureEvictions:0,encoderCalls:0,decoderCalls:0};
 const settings={model,modelUrl,ortUrl:new URL('../../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,runtimeFactoryUrl:new URL('../../vendor/d2prl/factory.mjs',import.meta.url).href,wasmPaths:{mjs:new URL('../../vendor/d2prl/factory.mjs',import.meta.url).href,wasm:new URL('../../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href}};
 function drop(pressure=false){if(leased)return;const existed=!!worker;if(worker)worker.terminate();worker=undefined;workerCredit?.();workerCredit=undefined;if(existed&&pressure)counts.pressureEvictions++;}
 const unregister=budget.registerReclaimer(()=>drop(true));
 const parameters=createParameterCache({budget,enabled:backend==='webgpu'&&!!model.backbone,read:(spec,hooks)=>readAsset(new URL(spec.file,modelUrl).href,spec,hooks)});
 async function retireChild(child){await (child.release??child.dispose).call(child);stageOwners.delete(child);}
 const owner={async release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}requireValue(!leased,'CMSeg native CNN Worker still leased');await retireCompositeOwners([...stageOwners].map(child=>()=>retireChild(child)));drop();for(const free of heldCredits){free();heldCredits.delete(free);}parameters.dispose();graph=null;graphCredit?.();graphCredit=undefined;unregister();closed=true;})().finally(()=>closing=undefined);return closing;},get pendingACKs(){return (worker?1:0)+loans.size+stageOwners.size+heldCredits.size;}};
 onOwner?.(owner);
 function acquire(){requireValue(!leased&&!closed,'CMSeg native CNN already leased');leased=true;try{if(worker)counts.workerReuses++;else{workerCredit=budget.reserve(HEAP+3*(model.assetBytes+model.bytes)+2*FEATURE_BYTES);worker=workerFactory(new URL('./cmseg-inference-worker.js',import.meta.url));counts.workerCreations++;}return worker;}catch(error){leased=false;drop();throw error;}}
 function rpc(kind,data,signal,onProgress){
  const target=acquire();return new Promise((resolve,reject)=>{
   const cleanup=()=>{signal.removeEventListener('abort',abort);target.onmessage=null;target.onerror=null;leased=false;};
   const abort=()=>{cleanup();try{drop();}catch(error){reject(error);return;}reject(new EngineError('CANCELLED','CMSeg native CNN stage cancelled'));};
   target.onerror=event=>{cleanup();reject(new EngineError('WORKER_FAILED',event.message));};
   target.onmessage=({data})=>{try{if(data.phase){onProgress?.(data);return;}cleanup();if(!data.ok)throw new EngineError('MODEL_FAILED',data.error);requireValue(Number.isInteger(data.heapBytes)&&data.heapBytes>0&&data.heapBytes<=HEAP,'Original CMSeg CNN heap bound');resolve(data);}catch(error){cleanup();reject(error);}};
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();
   try{target.postMessage({...settings,...data,kind});}catch(error){cleanup();reject(error);}
  });
 }
 async function work(kind,input,{signal,onProgress}={}){
  requireValue(!closed&&!closing&&!stageOwners.size&&!heldCredits.size,'CMSeg native CNN must retire refused stage owners before reuse');const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);checkAbort(combined);
  let scratch,outputCredit,backbone,backboneOutput,primary,failed=false,result;
  const outputBytes=kind==='encode'?FEATURE_BYTES:4*512**2;
  try{
   let inputBytes=0;
   if(kind==='encode'){requireValue(input instanceof Float32Array&&input.length===3*512**2&&input.every(Number.isFinite),'Native CMSeg Pillow512 FP32 RGB input required');inputBytes=input.byteLength;}
   else{const expected={x1:CMSEG_WINDOW_NATIVE_SHAPES[0],x5:CMSEG_WINDOW_NATIVE_SHAPES[4],c2:[1,24,128,128],c3:[1,32,64,64],c4:[1,96,32,32]};requireValue(Object.keys(input).length===5&&Object.entries(expected).every(([key,shape])=>exact(input[key],shape)),'Original CMSeg decoder grids required');inputBytes=Object.values(input).reduce((n,v)=>n+v.data.byteLength,0);}
   scratch=budget.reserve(2*inputBytes+2*outputBytes);outputCredit=budget.reserve(outputBytes);
   if(kind==='encode'){
    if(model.backbone&&backend==='cpu')drop(); // Same native useful-CPU-backbone admission.
    if(model.backbone){
     if(!graph){let free=budget.reserve(model.backbone.bytes*10);try{const bytes=await readAsset(new URL(model.backbone.file,modelUrl).href,model.backbone,{signal:combined});graph=JSON.parse(new TextDecoder().decode(bytes));checkAbort(combined);graphCredit=free;free=undefined;}finally{free?.();}}
     backbone=await backboneFactory({budget,graph,backend,maxWorkers,read:parameters.read});stageOwners.add(backbone);backboneOutput=await backbone.run(input,{signal:combined,onProgress});stageOwners.add(backboneOutput);await retireChild(backbone);backbone=null;checkAbort(combined);
    }
    result=await rpc(model.backbone?'bypass':'encoder',model.backbone?{input:backboneOutput.values.bypass.data}:{input},combined,onProgress);checkAbort(combined);
    if(model.backbone)for(const key of ['x2','x3','x4','x5'])result.values[key]={data:backboneOutput.values[key].data,shape:backboneOutput.values[key].shape};
    for(let i=0;i<5;i++)requireValue(exact(result.values['x'+(i+1)],CMSEG_WINDOW_NATIVE_SHAPES[i]),'Original CMSeg encoder feature geometry/precision changed');counts.encoderCalls++;
   }else{result=await rpc('decoder',{inputs:input},combined,onProgress);checkAbort(combined);requireValue(exact(result.values.probability,[1,1,512,512])&&result.values.probability.data.every(v=>v>=0&&v<=1),'Original CMSeg probability512 grid required');counts.decoderCalls++;}
  }catch(error){failed=true;primary=error;}
  finally{
   try{await retireCompositeOwners([...stageOwners].map(child=>()=>retireChild(child)),failed?{primary}:{});}catch(error){if(!failed){failed=true;primary=error;}}
   if(stageOwners.size){if(scratch)heldCredits.add(scratch);if(outputCredit)heldCredits.add(outputCredit);}
   else{scratch?.();if(failed)outputCredit?.();}
   if(failed)try{drop();}catch(error){retirementErrors.push(error);}
  }
  if(failed)throw primary;
  let released=false;const loan={values:result.values,heapBytes:result.heapBytes,ort:result.ort,timings:result.timings,backend:backend==='webgpu'?'webgpu-cpu':'cpu',stage:kind,modelId:model.id,release(){if(released)return;released=true;loans.delete(loan);outputCredit();}};loans.add(loan);return loan;
 }
 const stage=(kind,input,hooks)=>{requireValue(!running&&!closed&&!closing,'CMSeg native CNN stage busy or retired');const promise=Promise.resolve().then(()=>work(kind,input,hooks));running=promise;promise.finally(()=>{if(running===promise)running=null;}).catch(()=>{});return promise;};
 return Object.freeze({encode:(input,hooks={})=>stage('encode',input,hooks),decode:(input,hooks={})=>stage('decode',input,hooks),release:owner.release,dispose:owner.release,snapshot:()=>({...counts,modelId:model.id,backend,requestedMaxWorkers:maxWorkers,nativeThreadsPerOrtSession:1,wasmMaximumBytes:HEAP,outputLoans:loans.size,retirementErrorCount:retirementErrors.length,sessionResidentBytes:workerCredit?HEAP+3*(model.assetBytes+model.bytes)+2*FEATURE_BYTES:0,parameters:parameters.snapshot()}),get pendingACKs(){return owner.pendingACKs;}});
}
