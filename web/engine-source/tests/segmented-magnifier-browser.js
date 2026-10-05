import {createWorkerEngine} from '../src/worker-client.js';import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function code(p,expected){let error;try{await p;}catch(e){error=e;}assert(error?.code===expected,'Expected '+expected+', got '+error?.code);return error;}
export async function segmentedMagnifierBrowserTest(){
 const reference=await(await fetch('/.build/magnifier-12000x8000-reference.json')).json(),blob=await(await fetch('/.build/jpeg-12000x8000.jpg')).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2}),cases=[];let stage='load';
 try{
  const started=performance.now(),loaded=await engine.loadBlob({id:'source',blob}),loadMs=performance.now()-started;
  assert(loaded.sha256===reference.originalSha256&&loaded.width===12000&&loaded.height===8000,'Original identity and full dimensions');assert(loaded.metrics.storage==='temporary','Force bounded source storage');
  const capabilities=await engine.capabilities();assert(loaded.availableOperations.includes('inspection.magnifier')&&capabilities.sourceAccess.segmentedOperations.includes('inspection.magnifier'),'Public capability');
  assert(loaded.operationConstraints['inspection.magnifier'].regionMustFitBudget&&capabilities.sourceAccess.segmentedOperationConstraints['inspection.magnifier'].resultLayout==='contiguous','Public ROI constraints');
  let exported;
  for(const [i,expected] of reference.cases.entries()){
   stage='variant-'+i;const at=performance.now(),result=await engine.run({id:'roi-'+i,imageId:'source',operation:'inspection.magnifier',params:expected.params}),rpcMs=performance.now()-at;
   const actual=result.pixels?await hash(result.pixels.data):null;assert(actual===expected.sha256,'Native ROI output '+i);assert(JSON.stringify(result.data.bounds)===JSON.stringify(expected.bounds),'Source bounds '+i);
   assert(result.provenance.originalSha256===reference.originalSha256&&result.provenance.layout==='segmented','Source provenance');
   if(result.pixels)assert(JSON.stringify(result.layers[0].origin)===JSON.stringify(expected.bounds.slice(0,2)),'Layer origin');
   if(i===0){exported=await engine.exportResult(result,{format:'json'});const parsed=JSON.parse(new TextDecoder().decode(exported.bytes));assert(await hash(Uint8Array.from(parsed.pixels.data))===expected.sha256,'JSON roundtrip');result.pixels.data.fill(0);}
   const hit=await engine.run({id:'cache-'+i,imageId:'source',operation:'inspection.magnifier',params:expected.params});assert(hit.metrics.cache.result&&hit.metrics.sourceWindowBytes===0,'Result cache');assert((hit.pixels?await hash(hit.pixels.data):null)===expected.sha256,'Caller mutation isolation');
   if(i%7!==0&&!result.data.empty)assert(result.metrics.cache.input,'Input reuse across display settings');
   cases.push({params:expected.params,bounds:expected.bounds,sha256:actual,rpcMs,metrics:result.metrics,cacheMetrics:hit.metrics});
  }
  stage='refusal';await code(engine.run({id:'full',imageId:'source',operation:'inspection.magnifier'}),'MEMORY_LIMIT');
  const original=await engine.readOriginal('source',{offset:65530,length:777});assert(await hash(original.bytes)===await hash(await blob.slice(65530,66307).arrayBuffer()),'Original bytes unchanged');assert((await engine.originalBlob('source')).size===blob.size,'Original Blob retained');
  stage='cancel';const controller=new AbortController();let abortAt;
  const cancelled=await code(engine.run({id:'cancel',imageId:'source',operation:'inspection.magnifier',params:{bounds:[2000,1000,4000,2500],mode:'contrast'}},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&!controller.signal.aborted){abortAt=performance.now();controller.abort();}}}),'CANCELLED'),cancellationMs=performance.now()-abortAt;
  assert(cancelled.imagesCleared&&cancelled.cancellationMode==='storage-closed-before-worker-termination'&&!cancelled.temporaryCleanupFailures?.length,'Public pixel cancellation clears source after storage closure');
  assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'Cancellation removes temporary source');
  stage='reload';await engine.loadBlob({id:'source',blob});const expected=reference.cases[0],retry=await engine.run({id:'retry',imageId:'source',operation:'inspection.magnifier',params:expected.params});assert(await hash(retry.pixels.data)===expected.sha256&&!retry.metrics.cache.result&&!retry.metrics.cache.input,'Reload after cancellation invalidates cache');
  stage='unload';await engine.unload('source');await code(engine.run({id:'stale',imageId:'source',operation:'inspection.magnifier',params:expected.params}),'NOT_FOUND');const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes===0&&memory.cacheBytes===0&&memory.activeReservationBytes===0,'Source, cache and reservation released');
  await engine.dispose();const after=await storageInventory();assert(JSON.stringify(after)===JSON.stringify(before),'No temporary source remains');
  return{schema:1,status:'passed',scope:'Real common worker, 96 MP synthetic JPEG under 256 MiB; exact native ROI equalization/contrast, caches, JSON, budget refusal, original bytes, cancellation/storage closure, reload/unload. Functional timings, not isolated benchmarks.',dimensions:[reference.width,reference.height],originalSha256:reference.originalSha256,nativeSources:reference.nativeSources,loadMs,loadMetrics:loaded.metrics,cases,jsonBytes:exported.bytes.length,cancellation:cancelled.cancellationMode,cancellationMs,memory,storageArtifactsRemaining:after.length-before.length};
 }catch(error){error.message=stage+': '+error.message;throw error;}finally{await engine.dispose();}
}
