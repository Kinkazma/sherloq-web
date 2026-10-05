import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
export async function waveletStreamBrowserTest({memoryBudgetBytes=64*1024**2,hardwareConcurrency=4,expectParallel=false}={}){
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const reference=await(await fetch('/.build/wavelet-stream-reference/reference.json')).json(),blob=await(await fetch('/.build/wavelet-stream-reference/source.jpg')).blob();
 const before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes,resourceHints:{hardwareConcurrency}}),cases=[];
 try{
  const loaded=await engine.loadBlob({id:'wavelet',blob,layout:'segmented'});assert(loaded.provenance?.layout==='segmented-scanlines'||loaded.surface.storage,'source loaded');
  assert(loaded.availableOperations.includes('detail.wavelets'),'segmented wavelet capability');
  for(const [index,expected] of reference.cases.entries()){
   const phases=[],result=await engine.run({id:'wavelet-'+index,imageId:'wavelet',operation:'detail.wavelets',params:expected.params},{onProgress:e=>phases.push(e.phase)}).catch(async error=>{error.message+=' phase='+phases.at(-1)+' memory='+JSON.stringify((await engine.capabilities()).memory);throw error;});
   assert(result.layout==='surface','segmented output');if(expectParallel&&index===0)assert(result.metrics.workers>1&&result.metrics.preflightExecutions===0,'Useful parallel workers executed');
   const state=await createSHA256();
   for(let y=0;y<reference.height;y+=32){const part=await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect:{x:0,y,width:reference.width,height:Math.min(32,reference.height-y)}});state.update(part.pixels.data);}
   const hash=state.digest('hex');assert(hash===expected.sha256,'complete native wavelet checksum '+index+' '+hash+' vs '+expected.sha256);
   if(index)assert(result.metrics.coefficientsCached&&!phases.some(p=>p.startsWith('decompose')),'coefficient cache skips decomposition');
   cases.push({params:expected.params,sha256:hash,metrics:result.metrics});await engine.releaseSurface(result.surface.id);
  }
  await engine.unload('wavelet');await engine.dispose();const after=await storageInventory();assert(JSON.stringify(before)===JSON.stringify(after),'temporary stores fully removed');
  return {status:'passed',dimensions:[reference.width,reference.height],budgetBytes:memoryBudgetBytes,cases,storageArtifactsRemaining:after.length-before.length};
 }finally{await engine.dispose();}
}
