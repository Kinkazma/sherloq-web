import {createWorkerEngine} from '../src/worker-client.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function code(p,expected){let error;try{await p;}catch(e){error=e;}assert(error?.code===expected,'Expected '+expected+', got '+error?.code);return error;}
export async function segmentedColorSpacesBrowserTest(){
 const reference=await(await fetch('/.build/color-spaces-12000x8000-reference.json')).json(),blob=await(await fetch('/.build/jpeg-12000x8000.jpg')).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2}),cases=[];let stage='load';
 try{
  const started=performance.now(),loaded=await engine.loadBlob({id:'source',blob}),loadMs=performance.now()-started;
  assert(loaded.sha256===reference.originalSha256&&loaded.metrics.storage==='temporary','Admitted source and identity');assert(loaded.availableOperations.includes('colors.space'),'Public availability');
  let previous;
  for(const [i,expected]of reference.cases.entries()){
   stage='channel-'+i;const at=performance.now(),result=await engine.run({id:'color-'+i,imageId:'source',operation:'colors.space',params:expected.params}),rpcMs=performance.now()-at;
   assert(result.layout==='surface'&&!result.pixels&&result.surface.width===reference.width&&result.surface.height===reference.height,'Owned full-resolution result surface');
   assert(result.provenance.layout==='segmented'&&result.provenance.originalSha256===reference.originalSha256,'Original provenance');
   for(const e of expected.windows){const window=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:e.rect});assert(await hash(window.pixels.data)===e.sha256,'Native color window');}
   const full=await createSHA256();for(let y=0;y<reference.height;y+=64){const resultWindow=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y,width:reference.width,height:Math.min(64,reference.height-y)}});full.update(resultWindow.pixels.data);}
   const fullSha256=full.digest('hex');assert(fullSha256===expected.sha256,'Native complete image checksum');
   if(previous){const e=reference.cases[i-1].windows[0];assert(await hash((await engine.readPixels({surfaceId:previous,revision:1,rect:e.rect})).pixels.data)===e.sha256,'Previous channel result remains owned');await engine.releaseSurface(previous);await code(engine.readPixels({surfaceId:previous,revision:1,rect:e.rect}),'NOT_FOUND');}
   previous=result.surface.id;cases.push({params:expected.params,fullSha256,windows:expected.windows.length,rpcMs,metrics:result.metrics});
  }
  stage='cancel';const controller=new AbortController();let abortAt;const cancelled=await code(engine.run({id:'cancel',imageId:'source',operation:'colors.space',params:{space:'cmyk',channel:0}},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>.03&&!controller.signal.aborted){abortAt=performance.now();controller.abort();}}}),'CANCELLED'),cancellationMs=performance.now()-abortAt;
  assert(cancelled.imagesCleared&&cancelled.cancellationMode==='storage-closed-before-worker-termination'&&!cancelled.temporaryCleanupFailures?.length,'Close unpublished and owned results before worker termination');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'Cancellation removes all temporary arrays');
  stage='retry';await engine.loadBlob({id:'source',blob});const expected=reference.cases[0],retry=await engine.run({id:'retry',imageId:'source',operation:'colors.space',params:expected.params}),e=expected.windows[0];assert(await hash((await engine.readPixels({surfaceId:retry.surface.id,revision:1,rect:e.rect})).pixels.data)===e.sha256,'Retry after cancellation');
  stage='unload';await engine.unload('source');await code(engine.readPixels({surfaceId:retry.surface.id,revision:1,rect:e.rect}),'NOT_FOUND');const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes===0&&memory.cacheBytes===0&&memory.activeReservationBytes===0,'All retained bytes released');await engine.dispose();const after=await storageInventory();assert(JSON.stringify(after)===JSON.stringify(before),'No temporary artifact remains');
  return{schema:1,status:'passed',scope:'Common worker on public96MP JPEG under256MiB; three complete native color-space checksums, owned results/windows, release/unload, cancellation/storage closure and retry. Functional timings, not isolated benchmarks.',originalSha256:reference.originalSha256,nativeSourceSha256:reference.nativeSourceSha256,dimensions:[reference.width,reference.height],loadMs,loadMetrics:loaded.metrics,cases,cancellation:cancelled.cancellationMode,cancellationMs,memory,storageArtifactsRemaining:after.length-before.length};
 }catch(error){error.message=stage+': '+error.message;throw error;}finally{await engine.dispose();}
}
