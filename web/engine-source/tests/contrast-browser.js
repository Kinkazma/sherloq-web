import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(value,message)=>{if(!value)throw new Error(message);};
export async function contrastBrowserTest(){
 const ref=await(await fetch('/fixtures/contrast-reference.json')).json(),engine=createWorkerEngine(),report={schema:1,status:'passed',maps:0,views:0};
 try{
  for(const f of ref.cases){
   const bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});
   for(const expected of f.expected){
    for(let mode=0;mode<3;mode++){
     const r=await engine.run({id:'contrast',imageId:'i',operation:'tampering.contrast',params:{block:expected.block,mode}});
     assert(await hash(r.data.values)===expected.sha256,'Contrast map '+f.name+' '+expected.block);
     assert(await hash(r.pixels.data)===expected.views[mode],'Contrast view '+f.name+' '+mode);
     assert(r.metrics.cache.analysis===(mode>0),'Contrast view reuses analysis');
     assert(r.pixels.width===f.width&&r.pixels.height===f.height,'Contrast keeps resolution');
     r.data.values.fill(-1);r.pixels.data.fill(17);report.views++;
    }
    report.maps++;
   }
   await engine.unload('i');console.log('Contrast qualified',f.name);
  }
  const large=ref.cases.find(f=>f.name==='large'),bytes=await read(large.file),input={id:'large',bytes,pixels:{width:large.width,height:large.height,format:'rgb8',data:bytes}};
  await engine.load(input);
  for(const change of [{backend:'webgpu'},{params:{block:16}},{params:{mode:3}},{regions:[{bounds:[0,0,20,20]}]}]){
   let code;try{await engine.run({id:'invalid',imageId:'large',operation:'tampering.contrast',...change});}catch(e){code=e.code;}
   assert(['UNSUPPORTED_BACKEND','INVALID_INPUT','UNSUPPORTED_REGION'].includes(code),'Explicit rejection '+JSON.stringify(change));
  }
  const controller=new AbortController();let cancelled=false;
  try{await engine.run({id:'cancel',imageId:'large',operation:'tampering.contrast'},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}
  assert(cancelled,'Contrast hard cancellation');await engine.load(input);
  const recovered=await engine.run({id:'recovery',imageId:'large',operation:'tampering.contrast'});
  assert(await hash(recovered.data.values)===large.expected.find(e=>e.block===64).sha256,'Contrast recovery');await engine.unload('large');
  report.memory=(await engine.capabilities()).memory;assert(report.memory.retainedBytes===0&&report.memory.cacheBytes===0&&report.memory.activeReservationBytes===0,'Contrast releases buffers');
  const limited=createWorkerEngine({memoryBudgetBytes:96*1024**2});
  try{await limited.load(input);let code;try{await limited.run({id:'low',imageId:'large',operation:'tampering.contrast'});}catch(e){code=e.code;}assert(code==='MEMORY_LIMIT','Contrast rejects insufficient budget');assert((await limited.capabilities()).memory.activeReservationBytes===0,'Failed admission leaves no reservation');await limited.unload('large');}finally{limited.dispose();}
  report.cancellation='Hard abort, source reload, cache ownership, low-budget admission and unload verified';return report;
 }finally{engine.dispose();}
}
