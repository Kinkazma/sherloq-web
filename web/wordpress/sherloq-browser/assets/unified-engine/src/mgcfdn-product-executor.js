import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {MGCFDN_BASE_SHA256} from './mgcfdn-global-head-graph.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {segmentationCpuZoneCapacity} from '../experiments/segmentation/zone-scheduler.js';
const MODEL=Object.freeze({bytes:89060850,side:256,kind:'sigmoid'}),RESIDENT=512*1024**2+3*MODEL.bytes+32*1024**2;
// No diagnostic root token in the normal product API. The caller's admission
// and source lifetime, budget reservation, exact assets and scheduler authorize
// useful work. The public source capability remains separately closed.
export function createMgcfdnProductExecutor(admission,{budget,modelUrl,profile,own,onNativeCall,signal,workerFactory=(url,options)=>new Worker(url,options)}={}){
 admission.assertCurrent();requireValue(admission.modelSha256===MGCFDN_BASE_SHA256&&typeof own==='function','Current base admission and synchronous parent ownership required');
 const url=new URL(modelUrl);requireValue(['http:','https:'].includes(url.protocol),'Native model mirror required');
 const scheduler=getExecutionScheduler(budget,{maxWorkers:profile?.maxWorkers}),lanes=[],assigned=new Map();let closing,closed=false,failed=false;
 const policy={modelSha256:MGCFDN_BASE_SHA256,sourceIdentity:admission.sourceIdentity,assertCurrent(){requireValue(!closed&&!closing&&!failed,'MGCFDN executor retired');admission.assertCurrent();}};
 const owner={release(){if(closing)return closing;if(closed)return Promise.resolve();closing=Promise.resolve().then(async()=>{let refused=false,first;for(const lane of lanes)try{await lane.release();}catch(e){if(!refused){refused=true;first=e;}}if(refused)throw first;closed=true;}).finally(()=>closing=undefined);return closing;}};own(owner);
 function lane(index){
  while(lanes.length<=index){
   const credit=budget.reserve(RESIDENT),waits=new Map();let worker,init,next=0,disposed=false,retiring,fatal;
   const request=data=>new Promise((resolve,reject)=>{if(fatal){reject(fatal);return;}const id=++next;waits.set(id,{resolve,reject});try{worker.postMessage({...data,id});}catch(e){waits.delete(id);reject(e);}});
   const child={async run(label,feeds,{own:ownJob,signal}){
    let jobId,done=false,ack;const loan={outputs:null,release(){if(ack)return ack;if(!jobId||done||disposed){done=true;return Promise.resolve();}ack=request({type:'retire',jobId}).then(()=>{done=true;}).finally(()=>ack=undefined);return ack;}};ownJob(loan);checkAbort(signal);policy.assertCurrent();
    if(!init){
     worker=workerFactory(new URL('./mgcfdn-product-worker.js',import.meta.url),{type:'module'});
     worker.onmessage=({data})=>{const w=waits.get(data.id);if(w){waits.delete(data.id);data.ok?w.resolve(data):w.reject(data.error);}};
     worker.onerror=e=>{fatal=Error(e.message);failed=true;for(const w of waits.values())w.reject(fatal);waits.clear();};
     const factory=new URL('../vendor/d2prl/factory.mjs',import.meta.url).href;
     init=request({type:'init',config:{modelUrl:url.href,modelSha256:MGCFDN_BASE_SHA256,precision:'float32',side:256,featureSide:40,topk:40,runtimeFactoryUrl:factory,ortUrl:new URL('../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,wasmPaths:{mjs:factory,wasm:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href}}});
    }
    await init;checkAbort(signal);policy.assertCurrent();const lease=await scheduler.acquire({cpu:1,signal,label:'mgcfdn-product-'+label});
    try{checkAbort(signal);policy.assertCurrent();onNativeCall?.({label,lane:index});jobId=next+1;const result=await request({type:'run',label,feeds});done=true;loan.outputs=result.outputs;loan.metrics=result.metrics;checkAbort(signal);return loan;}finally{lease.release();}
   },release(){if(retiring)return retiring;if(disposed)return Promise.resolve();retiring=Promise.resolve().then(async()=>{if(init)try{await init;}catch{worker?.terminate();worker=undefined;disposed=true;credit();return;}if(worker){if(fatal){worker.terminate();worker=undefined;}else{await request({type:'close'});worker.terminate();worker=undefined;}}disposed=true;credit();}).finally(()=>retiring=undefined);return retiring;}};
   // Capture the lane before Worker construction or any init await can fail.
   lanes.push(child);
  }return lanes[index];
 }
 function run(label,feeds,options){return lane(assigned.get(options.context?.index)??0).run(label,feeds,options);}
 async function mapContexts(contexts,job){
  policy.assertCurrent();checkAbort(signal);const grant=segmentationCpuZoneCapacity({budget,model:MODEL,zones:contexts,segmented:true,hardwareConcurrency:profile?.maxWorkers,reclaimableInferenceBytes:lanes.length*RESIDENT});
  let next=0,failed=false,primary;const values=new Array(contexts.length);
  await Promise.all(Array.from({length:grant},(_,index)=>(async()=>{while(next<contexts.length&&!failed){const i=next++;assigned.set(contexts[i].index,index);try{checkAbort(signal);values[i]=await job(contexts[i]);}catch(error){if(!failed){failed=true;primary=error;}}}})()));
  if(failed)throw primary;checkAbort(signal);return values;
 }

 return Object.freeze({run,mapContexts,policy,release:owner.release,get residentBytes(){return lanes.length*RESIDENT;},get grant(){return lanes.length;}});
}
