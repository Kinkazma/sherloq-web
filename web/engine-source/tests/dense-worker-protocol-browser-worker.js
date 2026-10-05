import {Budget} from '../src/cache.js';
import {SiftPool} from '../src/sift-paged.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
self.onmessage=async()=>{try{
 const wasm=new Uint8Array(await(await fetch('../vendor/sift-paged/sift-paged.wasm')).arrayBuffer()),NativeWorker=globalThis.Worker,reports=[];let expected;
 for(const fault of ['none','null','allocation']){console.log('Protocol native case',fault);
  const budget=new Budget(300*1024**2),owner={budget,profile:{maxWorkers:3},workers:new Set()},results=[],counts=new Map();let created=0,domainReclaims=0;
  const realReclaim=budget.reclaimAllocation.bind(budget);budget.reclaimAllocation=async(bytes,settings)=>{domainReclaims++;assert(settings.kind==='array-buffer','Wrong failed allocator domain');return realReclaim(bytes,settings);};
  globalThis.Worker=class extends NativeWorker{constructor(url,options){super(fault!=='none'&&created++===0?new URL('./sift-paged-protocol-fault-worker.js?fault='+fault,import.meta.url):url,options);}};
  const pool=new SiftPool(owner,{budget,heap:64*1024**2,cost:()=>80*1024**2,provider:'cpu',backend:'cpu',wasm,layers:3,contrast:.04});
  try{await pool.open(3);await pool.run(Array.from({length:9},(_,i)=>i),async index=>{counts.set(index,(counts.get(index)??0)+1);return {kind:'prepare',input:Uint8Array.from({length:32*32},(_,i)=>(i*17+index*31)%251),width:32,height:32,core:[8,8,16,16],normalize:false};},async(result,index)=>{assert(!results[index],'Repeated committed tile');results[index]=Array.from(new Uint32Array(result.base.buffer));});
   console.log('Protocol native complete',fault);const serialized=JSON.stringify(results);if(expected)assert(serialized===expected,'Native output changed across recovery');else expected=serialized;
   assert(pool.records.length===3,'Worker width changed');assert(pool.metrics.retries===(fault==='none'?0:1),'Unexpected retry count');assert([...counts.values()].reduce((a,b)=>a+b,0)===(fault==='null'?10:9),'Useful peers were replayed');assert(domainReclaims===(fault==='allocation'?1:0),'Transport fabricated an allocation reclaim');reports.push({fault,tiles:results.length,retries:pool.metrics.retries,width:pool.records.length,domainReclaims,exact:true});
  }finally{pool.close();globalThis.Worker=NativeWorker;}assert(budget.total()===0,'Policy bytes leaked');assert(getExecutionScheduler(budget).snapshot().active.cpu===0,'CPU credit leaked');
 }
 // Native command handlers reject unreadable input instead of throwing outside
 // their asynchronous error relay and stranding the owner's pending init RPC.
 for(const file of ['sift-paged-worker.js','dense-paged-field-worker.js','dense-field-kernel-worker.js','dense-zernike-tile-worker.js','dense-sift-stream-worker.js','dense-texture-worker.js']){
  console.log('Protocol null command',file);const reply=await new Promise((resolve,reject)=>{const worker=new NativeWorker(new URL('../src/'+file,import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();resolve(data);};worker.onerror=event=>{worker.terminate();reject(Error(event.message));};worker.postMessage(null);});assert(reply.error?.code==='WORKER_MESSAGE_FAILED','Native null envelope was not relayed: '+file);reports.push({worker:file,nullRelayed:true});
 }
 self.postMessage({result:{reports}});
}catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}};
