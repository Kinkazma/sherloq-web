import {createWorkerEngine} from '../src/worker-client.js';
import {exportAnalysis} from '../src/exports.js';
const read=async p=>new Uint8Array(await(await fetch(new URL('../fixtures/'+p,import.meta.url))).arrayBuffer());
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
export async function runPixelBrowserTests(){
 const start=performance.now(),ref=await(await fetch(new URL('../fixtures/pixel-reference.json',import.meta.url))).json(),engine=createWorkerEngine(),counts={},timings={};
 try{
  for(const fixture of ref.cases){
   const bytes=await read(fixture.file);assert(await hash(bytes)===fixture.sha256,'Input fixture hash');
   await engine.load({id:'i',bytes,pixels:{width:fixture.width,height:fixture.height,format:'rgb8',data:bytes},provenance:{decoder:'synthetic-rgb-fixture'}});
   for(const expected of fixture.expected){
    const label=fixture.name+' '+expected.operation+' '+JSON.stringify(expected.params),t=performance.now();
    const result=await engine.run({id:'oracle',imageId:'i',operation:expected.operation,params:expected.params});
    (timings[expected.operation]??=[]).push(performance.now()-t);
    if(expected.pixels)assert(await hash(result.pixels.data)===expected.pixels,label+' pixels');
    for(const [name,h] of Object.entries(expected.masks??{}))assert(await hash(result.masks[name].data)===h,label+' '+name);
    if(expected.flags){assert(await hash(result.data.flags.data)===expected.flags,label+' flags');assert(result.data.count===expected.count,label+' count');assert(await hash(exportAnalysis(result,{format:'csv'}).bytes)===expected.csvSha256,label+' native CSV');}
    if(expected.bins){assert(JSON.stringify(Array.from(result.data.bins))===JSON.stringify(expected.bins.flat()),label+' bins');assert(result.data.uniqueColors===expected.uniqueColors&&result.data.uniqueRatio===expected.uniqueRatio,label+' unique');assert(JSON.stringify(result.data.summary)===JSON.stringify(expected.summary),label+' summary');}
    counts[expected.operation]=(counts[expected.operation]??0)+1;
   }
   await engine.unload('i');
  }
  const capabilities=await engine.capabilities();assert(capabilities.memory.retainedBytes===0&&capabilities.memory.cacheBytes===0,'Worker unload clears payload caches');
  return {schema:1,status:'passed',fixtureCases:ref.cases.length,counts,totalOutputs:Object.values(counts).reduce((a,b)=>a+b,0),pixelAndMaskMismatches:0,nativeDefectCsvExact:true,rpcByOperation:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,{runs:v.length,totalMs:v.reduce((a,b)=>a+b,0)}])),durationMs:performance.now()-start,capabilities,limits:['Synthetic fixtures only','Real dedicated module worker; no WordPress UI validation','RPC smoke durations include caches and tiny inputs; not speed comparisons']};
 }finally{engine.dispose();}
}
export async function runPixelSmokeMeasurements(){
 const bytes=await read('bench-1024.jpg'),engine=createWorkerEngine(),results=[];
 try{
  const t=performance.now(),loaded=await engine.load({id:'i',bytes}),loadRpcMs=performance.now()-t;
  for(const operation of ['inspection.histogram','colors.stats','noise.planes','noise.minmax','pixels.defects']){
   const task={id:'measure',imageId:'i',operation},tc=performance.now(),cold=await engine.run(task),coldRpcMs=performance.now()-tc,tw=performance.now(),warm=await engine.run(task),warmRpcMs=performance.now()-tw;
   assert(warm.metrics.cache.result,'Warm cache '+operation);
   if(cold.pixels)assert(await hash(cold.pixels.data)===await hash(warm.pixels.data),'Warm pixels '+operation);
   results.push({operation,coldRpcMs,warmRpcMs,cold:cold.metrics,warm:warm.metrics});
  }
  const cancel=new AbortController();let cancelled=false;
  try{await engine.run({id:'cancel',imageId:'i',operation:'pixels.defects',params:{radius:2}},{signal:cancel.signal,onProgress:()=>cancel.abort()});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}
  assert(cancelled,'New engine hard cancellation');await engine.load({id:'i',bytes});await engine.run({id:'recover',imageId:'i',operation:'colors.stats'});
  return {schema:1,fixture:'bench-1024.jpg',loaded,loadRpcMs,results,cancellation:'Hard abort and reload verified',limits:['One run per state; smoke measurements only','No CPU/GPU or worker-count comparison yet','Cold engine/cache, not cold OS; display excluded','Correctness reference suite uses separate raw synthetic images']};
 }finally{engine.dispose();}
}
