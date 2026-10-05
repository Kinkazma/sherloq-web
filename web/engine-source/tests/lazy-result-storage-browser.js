import {createWorkerEngine} from '../src/worker-client.js';import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function code(p,expected){let error;try{await p;}catch(e){error=e;}assert(error?.code===expected,'Expected '+expected+', got '+error?.code);return error;}
function crop(p,rect,channels){const out=new Uint8Array(rect.width*rect.height*channels);for(let y=0;y<rect.height;y++)out.set(p.data.subarray(((y+rect.y)*p.width+rect.x)*channels,((y+rect.y)*p.width+rect.x+rect.width)*channels),y*rect.width*channels);return out;}
export async function lazyResultStorageBrowserTest(){
 const blob=await(await fetch('/fixtures/bench-1024.jpg')).blob(),before=await storageInventory(),rect={x:37,y:53,width:71,height:61},settings=[{operation:'colors.stats',params:{mode:'avg',inclusive:true}},{operation:'noise.planes',params:{channel:4,bit:3,filter:2}},{operation:'noise.minmax',params:{channel:4,minimum:1,maximum:0,filter:1}}],expected=[],cases=[];
 const reference=createWorkerEngine({memoryBudgetBytes:128*1024**2});try{await reference.loadBlob({id:'reference',blob});for(const setting of settings){const result=await reference.run({id:setting.operation,imageId:'reference',...setting});expected.push({rgb:await hash(crop(result.pixels,rect,3)),masks:Object.fromEntries(await Promise.all(Object.entries(result.masks??{}).map(async([name,mask])=>[name,await hash(crop(mask,rect,1))])))});}}finally{await reference.dispose();}
 for(const [index,setting] of settings.entries()){
  const engine=createWorkerEngine({memoryBudgetBytes:48*1024**2});let stage='load',sequence=0;
  async function spill(id){
   const loaded=await engine.loadBlob({id,blob});assert(loaded.metrics.storage==='memory'&&loaded.provenance.layout==='segmented-scanlines'&&!loaded.metrics.temporaryBackend,'Source starts segmented in RAM');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'No session before useful spill');const results=[];
   for(let i=0;i<20;i++){
    const result=await engine.run({id:'result'+sequence++,imageId:id,...setting});results.push(result);assert(result.metrics.memory.peakAccountedBytes<=48*1024**2,'Shared budget respected');
    if(result.metrics.temporaryBackend){assert((await storageInventory()).length===before.length+1,'Exactly one late source-owned session');return {loaded,results};}
    assert(result.surface.storage==='memory'&&Object.values(result.maskSurfaces??{}).every(mask=>mask.storage==='memory'),'RAM results before spill');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'No speculative session creation');
   }throw Error('No storage transition with20 live results');
  }
  async function verify(result){assert(await hash((await engine.readPixels({surfaceId:result.surface.id,revision:1,rect})).pixels.data)===expected[index].rgb,'Existing full CPU RGB reference');for(const [name,mask] of Object.entries(result.maskSurfaces??{}))assert(await hash((await engine.readMask({surfaceId:mask.id,revision:1,rect})).mask.data)===expected[index].masks[name],'Existing full CPU raw-mask reference');}
  try{
   const started=performance.now(),a=await spill('source');stage='verify-owned';await verify(a.results[0]);await verify(a.results.at(-1));const transitioned=a.results.at(-1);assert(transitioned.surface.storage==='temporary'||Object.values(transitioned.maskSurfaces??{}).some(m=>m.storage==='temporary'),'A retained result actually uses storage');
   stage='unload';await engine.unload('source');await code(engine.readPixels({surfaceId:a.results[0].surface.id,revision:1,rect}),'NOT_FOUND');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'Unload removes late session');
   stage='cancel-load';await spill('cancel');const controller=new AbortController();let abortAt;
   stage='cancel';const error=await code(engine.run({id:'cancel',imageId:'cancel',...setting},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0&&!controller.signal.aborted){abortAt=performance.now();controller.abort();}}}),'CANCELLED'),cancellationMs=performance.now()-abortAt;assert(error.cancellationMode==='storage-closed-before-worker-termination'&&!error.temporaryCleanupFailures?.length,'Late session closes cooperatively');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'Cancellation removes late session');
   stage='dispose';await spill('dispose');const failures=await engine.dispose();assert(!failures?.length,'Dispose closes late session');assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'No artifacts after dispose');
   cases.push({...setting,resultsUntilSpill:a.results.length,backend:transitioned.metrics.temporaryBackend,transitionMetrics:transitioned.metrics,firstSurfaceStorage:a.results[0].surface.storage,cancellationMs,cancellation:error.cancellationMode,sequenceMs:performance.now()-started});
  }catch(error){error.message=setting.operation+'/'+stage+': '+error.message;throw error;}finally{await engine.dispose();}
 }
 return {schema:1,status:'passed',scope:'Real1MP RAM-backed segmented JPEG,48MiB budget, multiple owned results and exact baseline CPU windows; lazy storage for ranks/bitplanes/extrema, preserved first result, unload/cancel/dispose and no speculative storage. Functional timings, not isolated benchmarks.',cases,storageArtifactsRemaining:(await storageInventory()).length-before.length};
}
