import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';
import {createDenseDistanceGPU} from '../src/dense-distance-gpu.js';
const MiB=1024**2;
self.onmessage=async({data:settings})=>{
 const started=performance.now(),budget=new Budget(settings.budgetMiB*MiB),owned=[];let gpu,result,firstDescriptor,secondDescriptor;
 const allocate=async array=>{const store=await createSegmentedBytes(array.byteLength,{budget,shared:true});owned.push(store);await store.write(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));return store;};
 try{
  const {width,height}=settings,dimensions=128;let input;
  if(settings.kind==='compact-sift'){
   const rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*31+(i/19|0)*17+(i/997|0)*23)&255),image={surface:{descriptor:{format:'rgb8',width,height},async readWindow({x,y,width:w,height:h}){const data=new Uint8Array(w*h*3);for(let row=0;row<h;row++)data.set(rgb.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);return {pixels:{width:w,height:h,data},release(){}};}}};
   firstDescriptor=await preparePagedSift(image,{patch:3,support:3,quarter:false,budget,maxWorkers:4});secondDescriptor=await preparePagedSift(image,{patch:3,support:3,mirror:true,quarter:false,budget,maxWorkers:4});const w=width-9,h=height-9;
   input={first:firstDescriptor,second:secondDescriptor,mask:await allocate(new Uint8Array(w*h).fill(1)),width:w,height:h,dimensions};
  }else{
   const n=width*height,make=factor=>Float32Array.from({length:n*dimensions},(_,i)=>Math.fround((((i*factor+(i/17|0)*13)%257)-128)/128));
   input={first:await allocate(make(19)),second:await allocate(make(31)),mask:await allocate(new Uint8Array(n).fill(1)),width,height,dimensions};
  }
  const preparationMs=performance.now()-started;let gpuInitializationMs=0;
  const distanceBatch=settings.gpu?async job=>{if(!gpu){const t=performance.now();gpu=await createDenseDistanceGPU({budget,maxPairs:4096});gpuInitializationMs=performance.now()-t;}return gpu.batch(job);}:undefined;
  const solveStart=performance.now();result=await runPagedDenseField(input,{budget,iterations:settings.iterations,radius:64,minimum:3,seed:729,workspaceBytes:settings.workspaceMiB*MiB,parallelism:4,maxParallelism:4,distanceBatch});const solveMs=performance.now()-solveStart;
  const hashes={};for(const key of ['targets','distancesSquared','allowed']){const bytes=new Uint8Array(result[key].byteLength);await result[key].readInto(bytes);hashes[key]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  const metrics={kind:settings.kind,gpu:settings.gpu,width,height,iterations:settings.iterations,budgetMiB:settings.budgetMiB,workspaceMiB:settings.workspaceMiB,preparationMs,solveMs,gpuInitializationMs,totalMs:performance.now()-started,comparisons:String(result.comparisons),hashes,parallel:result.metrics.parallel,gpuMetrics:gpu?.metrics??null};
  await result.dispose();result=null;gpu?.dispose();gpu=null;await firstDescriptor?.dispose();firstDescriptor=null;await secondDescriptor?.dispose();secondDescriptor=null;await Promise.all(owned.splice(0).map(store=>store.dispose()));metrics.remainingBudgetBytes=budget.total();self.postMessage({result:metrics});
 }catch(error){self.postMessage({error:{message:error.message,stack:error.stack}});}
 finally{await result?.dispose();gpu?.dispose();await firstDescriptor?.dispose();await secondDescriptor?.dispose();await Promise.allSettled(owned.map(store=>store.dispose()));}
};
