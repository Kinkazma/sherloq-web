// Offline useful-work measurements, never called by a product session.
import {createWorkerEngine} from '../src/worker-client.js';
const ensure=(v,m)=>{if(!v)throw Error(m);},median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function autoZonesBenchmark(){
 const reference=await(await fetch('/fixtures/auto-zones/reference.json')).json(),compressed=await(await fetch('/fixtures/auto-zones/reference.bin.gz')).arrayBuffer();ensure(await hash(compressed)===reference.payload.compressedSha256,'Fixture identity');
 const payload=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());ensure(await hash(payload)===reference.payload.sha256,'Payload identity');
 const report={schema:1,scope:'Three alternating single/auto useful cold runs, including worker startup; warm engine reload and result cache measured separately. Both modes currently use one computation worker. Fixture I/O is outside timing. Geometry-only Canvas submission is illustrative, not physical paint or WordPress. No preflight or discarded warm-up. Accounted memory is not RSS.',cases:[]};
 for(const name of ['grid-7-255','outer-edges-1031-1024','tie-palette-1031-1024']){
  const row=reference.cases.find(x=>x.name===name),blob=new Blob([payload.subarray(row.source.offset,row.source.offset+row.source.length)]),task={id:'panels',imageId:'image',operation:'subimages.detect'},samples=[];
  const check=r=>ensure(JSON.stringify(r.data.polygons)===JSON.stringify(row.polygons),'Native panel geometry');
  for(let sample=0;sample<3;sample++)for(const cpuKernel of sample%2?['auto','single']:['single','auto']){
   const engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,cpuKernel,computeProfile:'maximum'});
   try{
    let t=performance.now();const loaded=await engine.loadBlob({id:'image',blob});const imageLoadMs=performance.now()-t;t=performance.now();const result=await engine.run(task),rpcMs=performance.now()-t;check(result);
    t=performance.now();const canvas=document.createElement('canvas');canvas.width=row.width;canvas.height=row.height;const ctx=canvas.getContext('2d');for(const {bounds:[x0,y0,x1,y1]}of result.data.regions)ctx.strokeRect(x0,y0,x1-x0,y1-y0);document.body.appendChild(canvas);canvas.getBoundingClientRect();canvas.remove();const presentationMs=performance.now()-t;
    const record={sample,cpuKernel,imageLoadMs,loadMetrics:loaded.metrics,rpcMs,presentationMs,pipelineMs:imageLoadMs+rpcMs+presentationMs,transportSchedulingMs:rpcMs-result.metrics.totalMs,metrics:result.metrics};
    t=performance.now();const cached=await engine.run(task);record.cacheRpcMs=performance.now()-t;ensure(cached.metrics.cache.result,'Cache reuse');check(cached);
    if(sample===0){await engine.unload('image');t=performance.now();await engine.loadBlob({id:'image',blob});record.warmLoadMs=performance.now()-t;t=performance.now();const warm=await engine.run(task);record.warmRpcMs=performance.now()-t;check(warm);ensure(!warm.metrics.cache.result,'Fresh warm analysis');}
    await engine.unload('image');record.cleanup=(await engine.capabilities()).memory;ensure(!record.cleanup.retainedBytes&&!record.cleanup.cacheBytes&&!record.cleanup.activeReservationBytes,'Cleanup');samples.push(record);
   }finally{await engine.dispose();}
  }
  report.cases.push({name,width:row.width,height:row.height,polygons:row.polygons,samples,summary:['single','auto'].map(cpuKernel=>{const rows=samples.filter(x=>x.cpuKernel===cpuKernel);return {cpuKernel,...Object.fromEntries(['imageLoadMs','rpcMs','presentationMs','pipelineMs','transportSchedulingMs','cacheRpcMs'].map(k=>[k,median(rows.map(x=>x[k]))])),peakAccountedBytes:Math.max(...rows.map(x=>x.cleanup.peakAccountedBytes))};})});
 }
 report.runtimeFiles={};for(const file of ['src/index.js','src/pixel-operations.js','src/auto-zones.js'])report.runtimeFiles[file]=await hash(await(await fetch('/'+file)).arrayBuffer());return report;
}
