import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function code(promise,expected){let error;try{await promise;}catch(e){error=e;}assert(error?.code===expected,'Expected '+expected+', got '+error?.code);return error;}
export async function segmentedResultsBrowserTest(){
 const reference=await(await fetch('/.build/pixel-stats-12000x8000-reference.json')).json(),blob=await(await fetch('/.build/jpeg-12000x8000.jpg')).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2}),cases=[];let stage='load-initial';
 try{
  await engine.loadBlob({id:'source',blob});let last;
  for(const [i,expected] of reference.cases.entries()){
   stage='variant-'+i;const started=performance.now(),result=await engine.run({id:'stats'+i,imageId:'source',operation:'colors.stats',params:expected.params}),computeMs=performance.now()-started;
   assert(result.layout==='surface'&&!result.pixels,'No full result transfer');assert(result.surface.width===reference.width&&result.surface.height===reference.height,'Preserve dimensions');assert(result.metrics.storage==='temporary','Large result uses owned storage');
   for(const {rect,sha256} of expected.windows){const part=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect});assert(await hash(part.pixels.data)===sha256,'Native result window');}
   let fullSha256=null;
   if(i===0){const state=await createSHA256();for(let y=0;y<reference.height;y+=64){const part=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y,width:reference.width,height:Math.min(64,reference.height-y)}});state.update(part.pixels.data);}fullSha256=state.digest('hex');assert(fullSha256===expected.rgbSha256,'Native complete result checksum');
    await engine.run({id:'hist',imageId:'source',operation:'inspection.histogram'});const {rect,sha256}=expected.windows[0],part=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect});assert(await hash(part.pixels.data)===sha256,'Live result survives later useful work');
   }
   const json=await engine.exportResult(result);assert(JSON.parse(new TextDecoder().decode(json.bytes)).surface.id===result.surface.id,'Result metadata export');
   cases.push({params:expected.params,windows:expected.windows.length,fullSha256,computeMs,metrics:result.metrics});last=result.surface;
   if(i<reference.cases.length-1){await engine.releaseSurface(result.surface.id);await code(engine.readPixels({surfaceId:result.surface.id,revision:1,rect:expected.windows[0].rect}),'NOT_FOUND');}
  }
  stage='unload';await engine.unload('source');await code(engine.readPixels({surfaceId:last.id,revision:1,rect:reference.cases[0].windows[0].rect}),'NOT_FOUND');
  stage='reload-for-cancel';await engine.loadBlob({id:'cancel',blob});stage='cancel-run';const controller=new AbortController();let abortAt;
  const error=await code(engine.run({id:'cancel',imageId:'cancel',operation:'colors.stats'},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0&&!controller.signal.aborted){abortAt=performance.now();controller.abort();}}}),'CANCELLED'),cancellationMs=performance.now()-abortAt;
  assert(error.cancellationMode==='storage-closed-before-worker-termination'&&!error.temporaryCleanupFailures?.length,'Partial result storage closes before termination');
  stage='reload-for-dispose';await engine.loadBlob({id:'dispose',blob});stage='dispose-run';await engine.run({id:'live',imageId:'dispose',operation:'colors.stats'});const failures=await engine.dispose();assert(!failures?.length,'Dispose live source and result');
  const after=await storageInventory();assert(JSON.stringify(after)===JSON.stringify(before),'No source/result storage artifacts remain');
  return {schema:1,status:'passed',scope:'Real96MP result surfaces; six native rank variants/four windows each; complete RGB checksum for min/strict; owned results, metadata export, release/unload/cancel/dispose. Functional timings, not isolated benchmarks.',dimensions:[reference.width,reference.height],originalSha256:reference.originalSha256,nativeSourceSha256:reference.sourceSha256,cases,cancellationMs,cancellation:error.cancellationMode,storageArtifactsRemaining:after.length-before.length};
 }catch(error){error.message=stage+': '+error.message;throw error;}finally{await engine.dispose();}
}
