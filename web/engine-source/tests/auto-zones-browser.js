import {createWorkerEngine} from '../src/worker-client.js';
import {createAnalysisScopeController} from '../src/analysis-scope.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);},equal=(a,b,label)=>ensure(JSON.stringify(a)===JSON.stringify(b),label);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const fetchBytes=async path=>{const r=await fetch(path);ensure(r.ok,path);return new Uint8Array(await r.arrayBuffer());};
export async function autoZonesBrowserTest(){
 const reference=JSON.parse(new TextDecoder().decode(await fetchBytes('/fixtures/auto-zones/reference.json'))),compressed=await fetchBytes('/fixtures/auto-zones/reference.bin.gz');ensure(await hash(compressed)===reference.payload.compressedSha256,'Compressed identity');
 const payload=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());ensure(await hash(payload)===reference.payload.sha256,'Payload identity');
 const runtimeFiles={};for(const file of ['src/index.js','src/pixel-operations.js','src/auto-zones.js','src/analysis-scope.js','src/worker-client.js','src/worker.js'])runtimeFiles[file]=await hash(await fetchBytes('/'+file));
 const engine=createWorkerEngine({memoryBudgetBytes:256*1024**2}),task={id:'panels',imageId:'image',operation:'subimages.detect'},records=[];
 const input=row=>({id:'image',blob:new Blob([payload.subarray(row.source.offset,row.source.offset+row.source.length)],{type:row.mime})});
 const regions=row=>row.polygons.map((p,i)=>({id:'panel-'+i,bounds:[p[0][0],p[0][1],p[2][0]+1,p[2][1]+1]}));
 try{
  const capabilities=await engine.capabilities();ensure(capabilities.operations.some(x=>x.id===task.operation),'Callable detector');ensure(capabilities.unavailable.includes('analysis.complete'),'Complete analysis remains unavailable');
  for(const row of reference.cases){
   const load=await engine.loadBlob(input(row));ensure(load.sha256===row.source.sha256,'Original hash '+row.name);ensure(await hash((await engine.imagePixels('image')).data)===row.pixels.sha256,'Decoded pixels '+row.name);
   const progress=[],started=performance.now(),result=await engine.run(task,{onProgress:e=>progress.push(e.fraction)});
   equal(result.data.polygons,row.polygons,row.name+' polygons');equal(result.data.regions,regions(row),row.name+' regions');ensure(result.pixels===undefined&&!result.layers.length,'Geometry only');ensure(result.provenance.originalSha256===row.source.sha256,'Result provenance');ensure(progress.every((v,i)=>v>=0&&v<=1&&(!i||v>=progress[i-1])),'Monotonic progress');
   const json=JSON.parse(new TextDecoder().decode((await engine.exportResult(result)).bytes));equal(json.data.regions,regions(row),'Export');
   if(result.data.regions.length){result.data.regions[0].bounds.fill(999);result.data.polygons[0][0].fill(999);}const cached=await engine.run(task);ensure(cached.metrics.cache.result,'Cached analysis');equal(cached.data.polygons,row.polygons,'Owned cached polygons');equal(cached.data.regions,regions(row),'Owned cached bounds');
   records.push({name:row.name,regions:row.polygons.length,rpcAndVerificationMs:performance.now()-started,metrics:result.metrics});await engine.unload('image');
  }
  const large=reference.cases.find(x=>x.name==='outer-edges-1031-1024');await engine.loadBlob(input(large));const abort=new AbortController();let error;
  try{await engine.run(task,{signal:abort.signal,onProgress:e=>{if(e.fraction>=.1&&e.fraction<1)abort.abort();}});}catch(e){error=e;}
  ensure(error?.code==='CANCELLED'&&error.imagesCleared,'Worker cancellation clears source');ensure(!(await engine.capabilities()).memory.retainedBytes,'Cancellation cleanup');await engine.loadBlob(input(large));equal((await engine.run(task)).data.polygons,large.polygons,'Reload reproduces source');await engine.unload('image');
  const flat=reference.cases.find(x=>x.name==='flat-1031-1024');await engine.loadBlob(input(flat));let invoked=0;
  const scope=createAnalysisScopeController({imageId:'image',width:flat.width,height:flat.height,detectSubimages:async request=>(await engine.run(task,{signal:request.signal,onProgress:request.onProgress})).data.regions,analyze:async()=>{invoked++;return {testDouble:true};}});
  ensure((await scope.start()).status==='no-regions'&&invoked===0,'Empty real detector has no implicit whole-image fallback');scope.dispose();await engine.unload('image');
  const memory=(await engine.capabilities()).memory;ensure(!memory.retainedBytes&&!memory.cacheBytes&&!memory.activeReservationBytes,'All sources and reservations released');
  for(const [file,expected]of Object.entries(runtimeFiles))ensure(await hash(await fetchBytes('/'+file))===expected,'Runtime changed '+file);
  return {schema:1,status:'passed',version:capabilities.version,cases:records.length,native:reference.native,payloadSha256:reference.payload.sha256,runtimeFiles,records,cleanup:memory,cancellation:'Hard worker cancellation during useful panel work; original bytes reloaded and exact result reproduced',scope:'Actual detector with empty-result orchestration. Complete analysis remains unavailable; test callback is not a real analysis pipeline. Full-memory CPU only; no physical Safari/mobile/non-Apple or WordPress qualification. Timings include verification, not benchmarks.'};
 }finally{await engine.dispose();}
}
