import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {ECHO_HEAP_BYTES,echoHeapBytes,echoDerivatives,echoRender} from './echo-math.js';
import {EchoWorkers} from './echo-workers.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';

export async function segmentedEcho(image,p,{budget,signal,onProgress,rowsPerBlock,maxWorkers=1,adaptive=new AdaptiveConcurrency()}={}){
 const d=image.surface.descriptor,w=d.width,h=d.height,n=w*h,r=p.radius;
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid Echo row group.');
 requireValue(Number.isSafeInteger(maxWorkers)&&maxWorkers>=1,'Invalid Echo worker limit.');checkAbort(signal);
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w)));
 const heapRows=Math.floor((ECHO_HEAP_BYTES-2*1024**2-22*r*w)/(w*23));
 if(heapRows<1)throw new EngineError('MEMORY_LIMIT','One Echo row and its halo exceed the fixed arithmetic heap.');
 // A useful parallel band has at least as many core rows as halo rows where
 // possible. Explicit developer row sizes are retained exactly up to admission.
 const minimumRows=Math.min(targetRows,heapRows,Math.max(1,2*r));
 const overhead=count=>(count===1?ECHO_HEAP_BYTES:echoHeapBytes()+count*ECHO_HEAP_BYTES)+ioBytes+count*w*r*12+Math.max(w,h)*3+16384;
 const maximum=typeof Worker==='undefined'?1:Math.min(32,maxWorkers,Math.ceil(h/targetRows));
 const key=w+'/'+h+'/'+r,plan=adaptive.select(key,maximum,budget,c=>overhead(c)+c*w*28*minimumRows),started=performance.now();
 let count=plan.count,retry=null,executions=0;
 async function attempt(){
  const limits=new Float64Array([Infinity,0,Infinity,0,Infinity,0]);
  let raw,output,planning,staging,workers,blocks=0,workerJobs=0;
  const abort=()=>workers?.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   checkAbort(signal);planning=budget.reserve(overhead(count)+count*w*28*minimumRows);
   const storage={budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};
   raw=await createSegmentedBytes(n*12,storage);output=await createSegmentedBytes(n*3,storage);planning();planning=null;
   const rows=Math.min(targetRows,heapRows,Math.floor((budget.limit-budget.retained-budget.active-overhead(count))/(count*w*28)));
   if(rows<1)throw new EngineError('MEMORY_LIMIT','Echo staging does not fit the shared budget.');
   staging=budget.reserve(overhead(count)+count*w*rows*16);
   if(count>1)workers=new EchoWorkers(count,{budget});checkAbort(signal);
   const dispatchAccountedBytes=budget.total();
   // Reads/writes stay ordered: disjoint ranges may share one storage page.
   // Only independent arithmetic overlaps. Catch each pending job immediately
   // so cancellation during a following read cannot leak a rejected promise.
   async function batch(y,kind){
    const jobs=[],leases=[];
    try{
     for(let i=0;i<count&&y+i*rows<h;i++){
      await controlCheckpoint(signal);const topY=y+i*rows,coreRows=Math.min(rows,h-topY);let input;
      if(kind==='derivatives'){
       const top=Math.max(0,topY-r),bottom=Math.min(h,topY+coreRows+r);
       const window=await image.surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});leases.push(window.release);
       input={kind,image:window.pixels,start:topY-top,rows:coreRows,radius:r};
      }else{
       const length=w*coreRows*12;leases.push(budget.reserve(length));const bytes=new Uint8Array(length);await raw.readInto(bytes,topY*w*12);checkAbort(signal);
       input={kind,bytes,totalBytes:length,limits,params:p,total:n};
      }
      const promise=workers?workers.call(i,input):kind==='derivatives'
       ?echoDerivatives(input.image,input.start,input.rows,r,{signal})
       :echoRender(input.bytes,limits,p,n,{signal}).then(bytes=>({bytes}));
      if(workers)workerJobs++;
      jobs.push(promise.then(value=>({value,y:topY,rows:coreRows}),error=>({error})));
     }
     const results=await Promise.all(jobs);checkAbort(signal);
     for(const result of results){
      if(result.error)throw result.error;checkAbort(signal);
      const {value,y:topY,rows:coreRows}=result;
      if(kind==='derivatives'){
       for(let c=0;c<3;c++){limits[c*2]=Math.min(limits[c*2],value.limits[c*2]);limits[c*2+1]=Math.max(limits[c*2+1],value.limits[c*2+1]);}
       await raw.write(value.bytes,topY*w*12);blocks++;onProgress?.(.7*(topY+coreRows)/h);
      }else{await output.write(value.bytes,topY*w*3);onProgress?.(.7+.3*(topY+coreRows)/h);}
     }
    }catch(error){workers?.clear();await Promise.all(jobs);throw error;}
    finally{for(const release of leases)release();}
   }
   let at=performance.now();
   for(let y=0;y<h;y+=rows*count)await batch(y,'derivatives');
   await raw.flush();checkAbort(signal);const derivativesMs=performance.now()-at;
   at=performance.now();for(let y=0;y<h;y+=rows*count)await batch(y,'render');
   await output.flush();checkAbort(signal);const renderMs=performance.now()-at;
   await raw.dispose();raw=null;
   return{surface:createRgbSurface(output,{width:w,height:h,budget}),semantics:'Native Echo Laplacian with source-wide per-channel normalization, radius1–15 reflect101 halos, unchanged contrast LUT and optional gray display. Full-resolution oriented pixels.',metrics:{totalMs:performance.now()-started,derivativesMs,renderMs,blocks,rowsPerBlock:rows,workers:count,workerJobs,storage:output.storage,retainedResultBytes:n*3,arithmeticHeapCapacityBytes:count===1?ECHO_HEAP_BYTES:echoHeapBytes()+count*ECHO_HEAP_BYTES,dispatchAccountedBytes}};
  }catch(error){workers?.clear();await Promise.allSettled([raw?.dispose(),output?.dispose()]);throw normalizeResourceError(error);}
  finally{signal?.removeEventListener('abort',abort);workers?.clear();planning?.();staging?.();}
 }
 let result;
 try{executions++;result=await attempt();}
 catch(error){checkAbort(signal);if(count===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,count,{error});retry={failedWorkers:count,code:error.code??'MEMORY_ALLOCATION'};count=1;executions++;result=await attempt();}
 adaptive.observe(key,{count,maximum,milliseconds:performance.now()-started,units:n});
 result.metrics.scheduling={...plan,taskExecutions:executions,preflightExecutions:0,retry};return result;
}
