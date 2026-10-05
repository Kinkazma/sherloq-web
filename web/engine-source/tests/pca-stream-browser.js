import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
export async function pcaStreamBrowserTest(){
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const reference=await(await fetch('/.build/pca-stream-reference/reference.json')).json(),blob=await(await fetch('/.build/pca-stream-reference/source.jpg')).blob();
 const before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:64*1024**2}),cases=[];
 try{
  const loaded=await engine.loadBlob({id:'pca',blob});assert(loaded.provenance?.layout==='segmented-scanlines'||loaded.surface.storage,'source loaded');
  assert(loaded.availableOperations.includes('colors.pca'),'segmented PCA capability');
  for(const [index,expected] of reference.cases.entries()){
   const phases=[],result=await engine.run({id:'pca-'+index,imageId:'pca',operation:'colors.pca',params:expected.params},{onProgress:e=>phases.push(e.phase)});
   assert(result.layout==='surface','segmented output');
   for(const [j,key] of ['mean','eigenvectors','eigenvalues'].entries())assert(result.data[key].every((v,i)=>v===expected.model[j][i]),'native model '+key);
   const state=await createSHA256();
   for(let y=0;y<reference.height;y+=32){const part=await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect:{x:0,y,width:reference.width,height:Math.min(32,reference.height-y)}});state.update(part.pixels.data);}
   const hash=state.digest('hex');assert(hash===expected.sha256,'complete native PCA checksum '+index+' '+hash+' vs '+expected.sha256);
   if(index)assert(result.metrics.basisCached&&!phases.includes('covariance')&&!phases.includes('mean'),'basis cache skips statistics');
   cases.push({params:expected.params,sha256:hash,metrics:result.metrics});await engine.releaseSurface(result.surface.id);
  }
  await engine.unload('pca');await engine.dispose();const after=await storageInventory();assert(JSON.stringify(before)===JSON.stringify(after),'temporary stores fully removed');
  return {status:'passed',dimensions:[reference.width,reference.height],budgetBytes:64*1024**2,cases,storageArtifactsRemaining:after.length-before.length};
 }finally{await engine.dispose();}
}
