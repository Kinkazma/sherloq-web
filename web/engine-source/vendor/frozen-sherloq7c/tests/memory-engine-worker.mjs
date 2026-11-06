import {createMemory7C} from '../sherloq7c-memory.mjs';
import {createResidentPng16} from '../engine/src/sherloq7c-resident-png-source.js';
import {Budget} from '../engine/src/cache.js';

onmessage=async({data:q})=>{
 let writes=0;const storageInterceptors={};const forbidden=()=>{writes++;throw Error('Temporary storage is forbidden for this resident calculation.');};
 for(const [label,object,key]of [['opfs',globalThis.navigator?.storage,'getDirectory'],['indexedDB',globalThis.indexedDB,'open'],['cache',globalThis.caches,'open']]){storageInterceptors[label]=object?'failed':'unavailable';if(object)try{Object.defineProperty(object,key,{value:forbidden});storageInterceptors[label]=object[key]===forbidden?'installed':'failed';}catch{}}
 const budget=new Budget((q.budgetMiB??4096)*1024**2),start=performance.now();let source,engine,out;
 const timings={},events=[];const progress=event=>{events.push({...event,elapsedMs:performance.now()-start});if(events.length>100)events.shift();postMessage({type:'progress',job:q,...event,elapsedMs:performance.now()-start,accountedBytes:budget.total()});};
 try{
  if(Object.values(storageInterceptors).some(v=>v==='failed'))throw Error('Storage interceptors must precede input allocation.');
  const side=q.side??128,palette=[4000,17000,39000,62000];
  engine=createMemory7C({budget,gpu:q.gpu!==false,gpuInitializer:{seedMode:q.seedMode??'schwarz',...(q.iterations===undefined?{}:{iterations:q.iterations})}});
  const generateAt=performance.now();source=await engine.createSource({width:side,height:side,readRows(top,rows,target){for(let y=0;y<rows;y++)for(let x=0;x<side;x++){
   let value;if(q.pattern==='constant')value=32000;else if(q.pattern==='hash'){let a=Math.imul(x+(top+y)*side+31,2654435761)>>>0;a^=a>>>13;a=Math.imul(a,2246822519)>>>0;value=(1+(a>>>16))&65535;}else value=palette[(x&1)+2*((top+y)&1)];
   const at=3*(y*side+x);target[at]=target[at+1]=target[at+2]=value;
  }}});timings.sourceMs=performance.now()-generateAt;
  out=await engine.run(source,{path:q.path??'auto',revelation:q.revelation??1,micro:q.micro??1,precision:q.precision??'1e-2',backend:q.backend??'auto'},{onProgress:progress});
  const calculatedMs=performance.now()-start,windows=[];
  for(const [x,y]of [[0,0],[Math.floor(side/2),Math.floor(side/2)],[Math.max(0,side-7),Math.max(0,side-5)]]){
   const w=await out.readWindow({x,y,width:Math.min(7,side-x),height:Math.min(5,side-y)},{includeScalar:true});
   windows.push({x,y,scalar:[...w.scalar],pixels16:[...w.data]});w.release();
  }
  let stream=null;
  if(q.stream){let samples=0,sum=0,xor=0;const at=performance.now();await out.pipeRows(new WritableStream({write(data){samples+=data.length;for(let i=0;i<data.length;i++){sum=(sum+data[i])>>>0;xor^=data[i];}}}),{rows:64});stream={samples,sum,xor,elapsedMs:performance.now()-at};if(samples!==3*side*side)throw Error('Incomplete native output stream.');}
  let png=null,roundtrip=null;
  if(q.png||q.pngRoundtrip){
   const at=performance.now();let consumed=0,chunks=[],leases=[];
   try{
    png=await out.pipePng(new WritableStream({write(bytes){consumed+=bytes.byteLength;if(q.pngRoundtrip){const free=budget.reserve(bytes.byteLength);try{chunks.push(bytes.slice());leases.push(free);}catch(error){free();throw error;}}}}),{compression:q.compression??3});png.elapsedMs=performance.now()-at;if(consumed!==png.byteLength)throw Error('PNG sink mismatch');
    if(q.pngRoundtrip){let blob,decoded;const blobFree=budget.reserve(consumed),begin=performance.now();
     try{
      blob=new Blob(chunks);decoded=await createResidentPng16(blob,{budget});blob=null;chunks=[];for(const free of leases)free();leases=[];
      let samples=0;for(let y=0;y<side;y+=64){const part=await out.readWindow({x:0,y,width:side,height:Math.min(64,side-y)});try{for(let i=0;i<part.data.length;i++){if(part.data[i]!==decoded.sampleAt(3*y*side+i))throw Error('PNG roundtrip pixel mismatch');samples++;}}finally{part.release();}}
      roundtrip={samples,exact:true,elapsedMs:performance.now()-begin};
     }finally{decoded?.release();blob=null;blobFree();}
    }
   }finally{chunks=[];for(const free of leases)free();}
  }
  const metrics=out.metrics,sourceMemory=source.memory();await engine.dispose();const retained=await out.readWindow({x:0,y:0,width:1,height:1});retained.release();await out.release();out=null;source.release();source=null;
  if(budget.total()!==0)throw Error('Resident budget leak: '+budget.total());if(writes)throw Error('Unexpected storage calls');
  postMessage({type:'done',timings,calculatedMs,metrics,sourceMemory,stream,png,roundtrip,windows,peakAfterOutputBytes:budget.peak,budgetAfter:budget.total(),temporaryStorageCalls:writes,storageInterceptors,events});
 }catch(error){try{await out?.release();await engine?.dispose();source?.release();}catch{}postMessage({type:'error',error:{message:error.message,code:error.code,details:error.details,stack:error.stack},timings,events,budgetAfter:budget.total(),temporaryStorageCalls:writes,storageInterceptors});}
};
