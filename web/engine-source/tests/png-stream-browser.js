import {createWorkerEngine} from '../src/worker-client.js';import {checkPngStream} from './png-stream-fixture.js';import {storageInventory} from './source-api-browser.js';
export async function pngStreamBrowserTest(){
 const before=await storageInventory(),root='/tests/data/png-stream/',ref=await(await fetch(root+'reference.json')).json(),results=[];
 const corpus=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./png-stream-corpus-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data);};worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.postMessage({});});
 for(const [index,item]of ref.cases.entries()){
  const blob=await(await fetch(root+item.file)).blob(),engine=createWorkerEngine({memoryBudgetBytes:(index?42:96)*1024**2,cpuKernel:'single'});
  try{results.push(await checkPngStream(engine,blob,item,{storage:'temporary',hashes:!index}));
   if(index){const controller=new AbortController();let error;try{await engine.loadBlob({id:'cancel',blob},{signal:controller.signal,onProgress:e=>{if(e.phase==='decode'&&e.fraction>.2)controller.abort();}});}catch(e){error=e;}if(error?.code!=='CANCELLED'||error.cancellationMode!=='storage-closed-before-worker-termination'||error.temporaryCleanupFailures?.length)throw Error('PNG load cancellation failed');results[index].cancellationMode=error.cancellationMode;const loaded=await engine.loadBlob({id:'reload',blob});if(loaded.sha256!==item.sourceSha256)throw Error('PNG reload failed');await engine.unload('reload');}
  }finally{await engine.dispose();}
 }
 if(JSON.stringify(await storageInventory())!==JSON.stringify(before))throw Error('PNG storage leak');return {status:'passed',corpus,results,storageCleanup:true};
}
