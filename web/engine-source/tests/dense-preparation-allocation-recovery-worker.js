import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {preparePagedZernike} from '../src/dense-paged-zernike.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
self.onmessage=async()=>{
 const width=384,height=256,n=width*height,MiB=1024**2,RealSharedArrayBuffer=globalThis.SharedArrayBuffer,reports=[];
 try{
  for(const failure of ['none','bank','worker']){
   const inject=failure==='bank',budget=new Budget(256*MiB),session=await createTemporarySession({backend:'auto',budget});let surface,prepared,allocations=0,refusals=0,completed=0,recoveryProgress=0,submitted=0,created=0;
   try{
    const pixels=await createSegmentedBytes(n*3,{budget,storage:'temporary',temporarySession:session});await pixels.write(Uint8Array.from({length:n*3},(_,i)=>(i*37+(i/3|0)%17*23)%256));surface=createRgbSurface(pixels,{width,height,budget});
    if(inject)globalThis.SharedArrayBuffer=class extends RealSharedArrayBuffer{constructor(bytes){if(bytes===n*48-4*MiB&&++allocations===1){refusals++;throw new RangeError('Injected descriptor bank allocation refusal');}super(bytes);}};
    prepared=await preparePagedZernike({surface,session},{budget,storage:'memory',patch:8,reflection:true,maxWorkers:4,workerFactory(){const fail=failure==='worker'&&[1,3].includes(++created),worker=new Worker(failure==='worker'?'/tests/dense-preparation-allocation-fault-worker.js'+(fail?'?fail':''):'/src/dense-zernike-tile-worker.js',{type:'module'}),post=worker.postMessage.bind(worker);worker.postMessage=(message,...args)=>{if(message.rgb)submitted++;return post(message,...args);};return worker;},onProgress:progress=>{if(progress.completed<completed)throw Error('Preparation restarted');completed=progress.completed;if(progress.allocationRecoveries?.length)recoveryProgress++;}});
    globalThis.SharedArrayBuffer=RealSharedArrayBuffer;
    const hashes=[];for(const store of [prepared.first,prepared.second]){const hash=await createSHA256();await store.visit(bytes=>hash.update(bytes));hashes.push(hash.digest('hex'));}
    reports.push({failure,hashes,submitted,refusals,completed,recoveryProgress,recoveries:prepared.metrics.allocationRecoveries,workerRecoveries:prepared.metrics.execution.resourceRecoveries,storage:[prepared.first.storage,prepared.second.storage],workers:prepared.metrics.workers,backend:session.backend});
    if(submitted!==(failure==='worker'?8:6)||completed!==n)throw Error('Useful tiles were repeated or lost');
    if(failure==='worker'&&prepared.metrics.execution.resourceRecoveries!==2)throw Error('Native worker refusals were not recovered locally');
    if(inject&&(!recoveryProgress||refusals!==1||prepared.metrics.allocationRecoveries.length!==1||prepared.metrics.allocationRecoveries[0].status!=='completed'||!prepared.metrics.allocationRecoveries[0].bytesPreserved))throw Error('Recovery evidence missing '+JSON.stringify(reports.at(-1)));
   }finally{globalThis.SharedArrayBuffer=RealSharedArrayBuffer;await prepared?.dispose();await surface?.dispose();await session.dispose();if(budget.total())throw Error('Preparation budget leaked '+budget.total());}
  }
  if(reports.some(report=>reports[0].hashes.some((hash,index)=>hash!==report.hashes[index])))throw Error('Recovered descriptor bytes differ');self.postMessage({result:reports});
 }catch(error){globalThis.SharedArrayBuffer=RealSharedArrayBuffer;self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
};
