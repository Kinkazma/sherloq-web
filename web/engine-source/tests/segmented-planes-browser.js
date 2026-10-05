import {createWorkerEngine} from '../src/worker-client.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function code(p,expected){let error;try{await p;}catch(e){error=e;}assert(error?.code===expected,'Expected '+expected+', got '+error?.code);return error;}
export async function segmentedPlanesBrowserTest(){
 const reference=await(await fetch('/.build/bit-planes-12000x8000-reference.json')).json(),blob=await(await fetch('/.build/jpeg-12000x8000.jpg')).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2}),cases=[];let stage='load';
 try{
  await engine.loadBlob({id:'source',blob});let last;
  for(const [i,expected] of reference.cases.entries()){
   stage='variant-'+i;const started=performance.now(),result=await engine.run({id:'plane'+i,imageId:'source',operation:'noise.planes',params:expected.params}),computeMs=performance.now()-started,mask=result.maskSurfaces.plane;
   assert(result.layout==='surface'&&!result.pixels&&!result.masks,'No whole image or mask transfer');assert(mask.format==='mask8'&&mask.range[0]===0&&mask.range[1]===1,'Explicit raw mask semantics');
   for(const {rect,rgbSha256,maskSha256} of expected.windows){const rgb=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect}),raw=await engine.readMask({surfaceId:mask.id,revision:1,rect});assert(await hash(rgb.pixels.data)===rgbSha256,'Native display window');assert(await hash(raw.mask.data)===maskSha256,'Native raw mask window');}
   let fullRgbSha256=null,fullMaskSha256=null;
   if(i===2){const rgbHash=await createSHA256(),maskHash=await createSHA256();for(let y=0;y<reference.height;y+=64){const rect={x:0,y,width:reference.width,height:Math.min(64,reference.height-y)},rgb=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect}),raw=await engine.readMask({surfaceId:mask.id,revision:1,rect});rgbHash.update(rgb.pixels.data);maskHash.update(raw.mask.data);}fullRgbSha256=rgbHash.digest('hex');fullMaskSha256=maskHash.digest('hex');assert(fullRgbSha256===expected.rgbSha256&&fullMaskSha256===expected.maskSha256,'Native complete Gaussian display and raw mask');}
   cases.push({params:expected.params,windows:expected.windows.length,fullRgbSha256,fullMaskSha256,computeMs,metrics:result.metrics});last={rgb:result.surface.id,mask:mask.id};
   if(i<reference.cases.length-1){await engine.releaseSurface(result.surface.id);const {rect,maskSha256}=expected.windows[0];assert(await hash((await engine.readMask({surfaceId:mask.id,revision:1,rect})).mask.data)===maskSha256,'Releasing RGB does not corrupt owned mask');await engine.releaseSurface(mask.id);await code(engine.readMask({surfaceId:mask.id,revision:1,rect}),'NOT_FOUND');}
  }
  stage='unload';await engine.unload('source');await code(engine.readMask({surfaceId:last.mask,revision:1,rect:reference.cases[0].windows[0].rect}),'NOT_FOUND');
  stage='cancel-load';await engine.loadBlob({id:'cancel',blob});const controller=new AbortController();let abortAt;
  stage='cancel-render';const error=await code(engine.run({id:'cancel',imageId:'cancel',operation:'noise.planes',params:{filter:2}},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>.55&&!controller.signal.aborted){abortAt=performance.now();controller.abort();}}}),'CANCELLED'),cancellationMs=performance.now()-abortAt;
  assert(error.cancellationMode==='storage-closed-before-worker-termination'&&!error.temporaryCleanupFailures?.length,'Both unpublished arrays close before termination');
  stage='dispose-load';await engine.loadBlob({id:'dispose',blob});stage='dispose-result';await engine.run({id:'live',imageId:'dispose',operation:'noise.planes'});const failures=await engine.dispose();assert(!failures?.length,'Dispose source, display and mask');
  const after=await storageInventory();assert(JSON.stringify(after)===JSON.stringify(before),'No source/display/mask artifacts remain');
  return {schema:1,status:'passed',scope:'Real96MP segmented bit-plane display and raw-mask handles; nine settings/four windows each; complete Gaussian display and mask checksums; release/unload/cancel/dispose. Functional timings, not isolated benchmarks.',dimensions:[reference.width,reference.height],originalSha256:reference.originalSha256,nativeSourceSha256:reference.sourceSha256,cases,cancellationMs,cancellation:error.cancellationMode,storageArtifactsRemaining:after.length-before.length};
 }catch(error){error.message=stage+': '+error.message;throw error;}finally{await engine.dispose();}
}
