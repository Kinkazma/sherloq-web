import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(v,m)=>{if(!v)throw new Error(m);};
export async function stereoBrowserTest(){
 const ref=await(await fetch('/fixtures/stereo-reference.json')).json(),engine=createWorkerEngine(),report={schema:1,status:'passed',searches:0,flows:0,views:0,absent:0};
 try{
  for(const f of ref.cases){const bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});
   for(let mode=0;mode<4;mode++){
    const r=await engine.run({id:'s',imageId:'i',operation:'various.stereogram',params:{mode}});
    assert(r.data.offset===f.offset&&JSON.stringify(Array.from(r.data.differences))===JSON.stringify(f.difference??[]),'Stereo native search '+f.name);
    assert(r.metrics.cache.analysis===(mode%2===1),'Stereo analysis cache');
    if(f.offset===null){assert(!r.pixels&&!r.data.flow,'Absent period gives no raster');continue;}
    assert(await hash(r.pixels.data)===f.views[mode],'Stereo view '+f.name+' '+mode);report.views++;
    assert(r.pixels.width===f.width-f.offset&&r.pixels.height===f.height,'Stereo crop dimensions');
    if(mode<2)assert(!r.data.flow,'Stereo lazy flow');else{assert(await hash(r.data.flow)===f.flowSha256,'Stereo flow '+f.name);r.data.flow.fill(17);if(mode===2)report.flows++;}
    if(mode===2)assert(r.metrics.cache.stages.search&&r.metrics.cache.stages.pattern&&!r.metrics.cache.stages.flow,'Stereo reuses pattern before flow');
    r.pixels.data.fill(17);r.data.differences.fill(-1);
   }
   report.searches++;if(f.offset===null)report.absent++;await engine.unload('i');console.log('Stereo qualified',f.name);
  }
  const large=ref.cases.at(-1),bytes=await read(large.file),input={id:'large',bytes,pixels:{width:large.width,height:large.height,format:'rgb8',data:bytes}};
  await engine.load(input);const controller=new AbortController();let cancelled=false;
  try{await engine.run({id:'cancel',imageId:'large',operation:'various.stereogram',params:{mode:2}},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}assert(cancelled,'Stereo hard cancellation');
  await engine.load(input);const recovery=await engine.run({id:'recover',imageId:'large',operation:'various.stereogram',params:{mode:2}});assert(await hash(recovery.data.flow)===large.flowSha256,'Stereo reload recovery');await engine.unload('large');
  report.memory=(await engine.capabilities()).memory;assert(report.memory.retainedBytes===0&&report.memory.cacheBytes===0&&report.memory.activeReservationBytes===0,'Stereo cache release');
  const limited=createWorkerEngine({memoryBudgetBytes:96*1024**2});try{await limited.load(input);let code;try{await limited.run({id:'low',imageId:'large',operation:'various.stereogram'});}catch(e){code=e.code;}assert(code==='MEMORY_LIMIT','Stereo memory admission');assert((await limited.capabilities()).memory.activeReservationBytes===0,'Stereo failed admission cleanup');}finally{limited.dispose();}
  report.cancellation='Abort, reload, lazy-flow cache, owned result buffers, insufficient budget and unload verified';return report;
 }finally{engine.dispose();}
}
