import {verifyM3Bytes} from './m3-asset.js';
import {XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,requireValue,checkAbort,deserializeWorkerError} from './errors.js';

const MiB=1024**2,f=Math.fround,bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
/** One actual local-backbone pool for all admitted contexts. It uses the
 * existing worker/graph, native256 halo and original backend retry policy.
 * Context inputs share ONE InstanceNorm; no per-context sessions are created
 * by the feature-bank orchestrator and no inter-context RGB mosaic is sent. */
export function createXfeatStrictWindowPool({budget,profile,model,backend='auto',signal,workerFactory=url=>new Worker(url,{type:'module'}),coreSize=1024}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0&&['auto','cpu','webgpu'].includes(backend)&&Number.isSafeInteger(coreSize)&&coreSize>=32&&coreSize%32===0,'Native XFeat pool requires its unchanged budget/profile/backend.');
 const admission={budget,profile,resourceOwner:'xfeat-strict'},workers=[],extra=[],jobs=[],metrics={executions:0,retries:0,failures:[],halo:256,coreSize,preflightExecutions:0};let closed=false,reserved=false,active=false,done=Promise.resolve(),modelFree,disposal;
 const terminate=()=>{cancelScheduledWorkerCalls(admission);for(const r of workers){r.worker?.terminate();r.worker=null;r.reject?.(new EngineError('CANCELLED','Strict XFeat native work stopped.'));r.reject=null;}};
 const abort=()=>terminate();signal?.addEventListener('abort',abort,{once:true});
 const cost=(r)=>r.heap+64*MiB+r.pixels*24+(r.provider==='webgpu'?r.pixels*384+64*MiB:0),heap=(pixels,provider)=>Math.min(2048*MiB,Math.ceil((128*MiB+pixels*(provider==='wasm'?320:64))/(64*MiB))*64*MiB);
 return{
  get metrics(){return structuredClone(metrics);},
  async reserve(records){
   requireValue(!reserved&&!closed,'XFeat pool already reserved or closed.');checkAbort(signal);requireValue(model?.data instanceof Uint8Array&&model.sha256===XFEAT_PAGED_MODEL.sha256,'Strict XFeat requires the unchanged pinned local backbone.');await verifyM3Bytes(model.data,XFEAT_PAGED_MODEL,signal);checkAbort(signal);
   modelFree=budget.reserve(model.data.byteLength*3+8*MiB);for(const context of records)if(context.evaluable)for(let y=0;y<context.height;y+=coreSize)for(let x=0;x<context.width;x+=coreSize){extra.push(budget.reserve(512));jobs.push({context,x,y,cw:Math.min(coreSize,context.width-x),ch:Math.min(coreSize,context.height-y),x0:Math.max(0,x-256),y0:Math.max(0,y-256),x1:Math.min(context.width,x+coreSize+256),y1:Math.min(context.height,y+coreSize+256)});}
   const pixels=jobs.reduce((n,j)=>Math.max(n,(j.x1-j.x0)*(j.y1-j.y0)),0);let provider=backend==='cpu'?'wasm':backend==='webgpu'||globalThis.navigator?.gpu?'webgpu':'wasm';for(let i=0;i<Math.min(profile.maxWorkers,jobs.length);i++){
    const rec={provider,pixels,heap:heap(pixels,provider),worker:null,reject:null,initialized:false,release:null};try{rec.release=budget.reserve(cost(rec));}catch(error){if(workers.length)break;if(provider==='webgpu'&&backend==='auto'){metrics.failures.push({provider,stage:'admission',code:error.code});provider='wasm';rec.provider=provider;rec.heap=heap(pixels,provider);rec.release=budget.reserve(cost(rec));}else throw error;}workers.push(rec);
   }
   metrics.workers=workers.length;metrics.workerAdmittedBytes=workers.reduce((n,r)=>n+cost(r),0);reserved=true;
  },
  async execute(population,consume,{onProgress}={}){
   requireValue(reserved&&!closed&&!active&&typeof consume==='function','XFeat pool must be reserved before execution.');checkAbort(signal);active=true;let finish;done=new Promise(resolve=>finish=resolve);let next=0,completed=0,firstFailure;const committed=new Set();
   try{
    for(;;){
    const work=await Promise.allSettled(workers.map(async rec=>{
     while(next<jobs.length&&!firstFailure){const index=next++;if(committed.has(index))continue;const tile=jobs[index],context=tile.context;let output,input;
      for(;;){checkAbort(signal);const tw=tile.x1-tile.x0,th=tile.y1-tile.y0;input=allocateOwnedTypedArray(Float32Array,tw*th,{budget,reserve:bytes=>{requireValue(bytes<=rec.pixels*4,'XFeat input exceeds its admitted worker slot.');return()=>{};},owner:'xfeat-strict-input',label:'actual native normalized context window; credited by worker slot'});
       try{
        for(let y=0;y<th;y++){checkAbort(signal);await context.gray.readInto(bytes(input.data.subarray(y*tw,(y+1)*tw)),((tile.y0+y)*context.width+tile.x0)*4,{signal});}for(let i=0;i<input.data.length;i++)input.data[i]=f(f(input.data[i]-population.normalization.mean)*population.normalization.inverseStd);metrics.executions++;
        if(!rec.worker){rec.worker=workerFactory(new URL('./xfeat-paged-worker.js',import.meta.url));rec.initialized=false;}
        const threads=rec.provider==='wasm'&&globalThis.crossOriginIsolated?Math.max(1,Math.floor(profile.maxWorkers/workers.length)):1,data=input.data;output=await scheduledWorkerCall(admission,()=>new Promise((resolve,reject)=>{rec.reject=reject;rec.worker.onmessage=({data})=>{rec.reject=null;data.error?reject(deserializeWorkerError(data.error,data.message)):resolve(data);};rec.worker.onerror=e=>{rec.reject=null;reject(new EngineError('WORKER_FAILED',e.message||'Native XFeat worker failed.'));};rec.worker.postMessage({input:data,width:tw,height:th,core:[tile.x-tile.x0,tile.y-tile.y0,tile.cw,tile.ch],...(!rec.initialized?{model:model.data,provider:rec.provider,maximumHeapBytes:rec.heap,threads}:{})},[data.buffer]);}),{signal,cpu:threads,gpu:rec.provider==='webgpu'?1:0,label:'xfeat-strict-local-backbone'});rec.initialized=true;checkAbort(signal);requireValue(output.heat instanceof Float32Array&&output.heat.length===tile.cw*tile.ch&&output.dense instanceof Float32Array&&output.dense.length===tile.cw*tile.ch&&output.reliability instanceof Float32Array&&output.reliability.length===tile.cw*tile.ch/64,'Native XFeat worker changed its output geometry.');metrics.maximumActualHeapBytes=Math.max(metrics.maximumActualHeapBytes??0,output.actualHeapBytes??0);await consume(context,tile,output);committed.add(index);completed++;onProgress?.({phase:'xfeat-strict-native-windows',completed,total:jobs.length,fraction:completed/jobs.length});break;
       }catch(error){checkAbort(signal);rec.worker?.terminate();rec.worker=null;rec.initialized=false;metrics.failures.push({provider:rec.provider,stage:'useful-work',code:error.code});let changed=false;if(rec.provider==='webgpu'&&backend==='auto'&&['MEMORY_LIMIT','LEARNED_INFERENCE_FAILED','WORKER_FAILED'].includes(error.code)){rec.provider='wasm';rec.heap=heap(rec.pixels,'wasm');changed=true;}else if(error.code==='MEMORY_LIMIT'&&rec.heap<2048*MiB){rec.heap=Math.min(rec.heap*2,2048*MiB);changed=true;}if(!changed)throw error;rec.release();rec.release=null;rec.release=budget.reserve(cost(rec));metrics.retries++;
       }finally{input?.release();input=null;}
      }
     }
    }).map(p=>p.catch(error=>{firstFailure??=error;terminate();throw error;})));
    if(!firstFailure){for(const result of work)if(result.status==='rejected')throw result.reason;break;}checkAbort(signal);if(firstFailure.code!=='MEMORY_LIMIT'||workers.length===1)throw firstFailure;
    // Identical to the existing paged extractor: only real useful-work memory
    // pressure can retire concurrency; committed cores are never recomputed.
    terminate();for(const record of workers){record.release?.();record.release=null;}const provider=workers.some(r=>r.provider==='wasm')?'wasm':'webgpu',pixels=Math.max(...workers.map(r=>r.pixels)),maximum=Math.max(heap(pixels,provider),...workers.map(r=>r.heap)),record={provider,pixels,heap:maximum,worker:null,reject:null,initialized:false};record.release=budget.reserve(cost(record));workers.splice(0,workers.length,record);metrics.concurrencyReductions=(metrics.concurrencyReductions??0)+1;metrics.retries++;next=0;firstFailure=null;
    }
    checkAbort(signal);metrics.finalWorkers=workers.length;metrics.provider=workers.some(r=>r.provider==='webgpu')?'webgpu':'wasm';metrics.providers=[...new Set(workers.map(r=>r.provider))];return this.metrics;
   }finally{active=false;finish();}
  },
  stop:terminate,
  dispose(){if(disposal)return disposal;closed=true;terminate();disposal=(async()=>{await done;signal?.removeEventListener('abort',abort);const errors=[];for(const action of[...workers.map(r=>()=>r.release?.()),()=>modelFree?.(),...extra])try{action();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'XFeat native worker-owner retirement failed.');})();return disposal;},
 };
}
