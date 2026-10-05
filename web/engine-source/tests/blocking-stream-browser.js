import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
export async function blockingStreamBrowserTest({memoryBudgetBytes=64*1024**2,hardwareConcurrency=4,expectParallel=false}={}){
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const reference=await(await fetch('/.build/blocking-large/reference.json')).json(),blob=await(await fetch('/.build/blocking-large/source.jpg')).blob();
 const before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes,resourceHints:{hardwareConcurrency}}),cases=[];
 try{
  const loaded=await engine.loadBlob({id:'wavelet',blob,layout:'segmented'});assert(loaded.provenance?.layout==='segmented-scanlines'||loaded.surface.storage,'source loaded');
  assert(loaded.availableOperations.includes('noise.blocking'),'segmented wavelet capability');
  for(const [index,expected] of reference.cases.entries()){
   const phases=[],result=await engine.run({id:'wavelet-'+index,imageId:'wavelet',operation:'noise.blocking',params:expected.params},{onProgress:e=>phases.push(e.phase)}).catch(async error=>{error.message+=' phase='+phases.at(-1)+' memory='+JSON.stringify((await engine.capabilities()).memory);throw error;});
   assert(result.layout==='surface','segmented output');if(expectParallel&&index===0)assert(result.metrics.workers>1&&result.metrics.preflightExecutions===0,'Useful parallel workers executed');
   const state=await createSHA256();
   for(let y=0;y<reference.height;y+=32){const part=await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect:{x:0,y,width:reference.width,height:Math.min(32,reference.height-y)}});state.update(part.pixels.data);}
   const hash=state.digest('hex');assert(hash===expected.sha256,'complete native blocking checksum '+index+' '+hash+' vs '+expected.sha256);
   if(index)assert(result.metrics.detailCached&&!phases.some(p=>p.startsWith('db8-axis')),'detail cache skips decomposition');
   const noiseHash=await createSHA256();for(let offset=0;offset<result.tables.noise.rowCount;offset+=257){const page=await engine.readTable({tableId:result.tables.noise.id,revision:1,offset,length:257});const values=Float64Array.from({length:page.length},(_,i)=>page.data[i*3+2]);noiseHash.update(new Uint8Array(values.buffer));}const noiseSha256=noiseHash.digest('hex');assert(noiseSha256===expected.noiseSha256,'Native noise grid checksum');const csv=await engine.readTableCsv({tableId:result.tables.noise.id,revision:1,offset:0,length:2});assert(new TextDecoder().decode(csv.bytes).startsWith('block_row,block_col,noise'),'Noise CSV');await engine.releaseTable(result.tables.noise.id);
   cases.push({noiseSha256,params:expected.params,sha256:hash,metrics:result.metrics});await engine.releaseSurface(result.surface.id);
  }
  await engine.unload('wavelet');await engine.dispose();const after=await storageInventory();assert(JSON.stringify(before)===JSON.stringify(after),'temporary stores fully removed');
  return {status:'passed',dimensions:[reference.width,reference.height],budgetBytes:memoryBudgetBytes,cases,storageArtifactsRemaining:after.length-before.length};
 }finally{await engine.dispose();}
}
