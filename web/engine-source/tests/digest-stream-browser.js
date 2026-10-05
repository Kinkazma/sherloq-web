import {createWorkerEngine} from '../src/worker-client.js';import {checkSegmentedDigest} from './digest-stream-fixture.js';import {storageInventory} from './source-api-browser.js';
export async function digestStreamBrowserTest(){
 const reference=(await(await fetch('/tests/data/digest-stream-native.json')).json()).cases.at(-1),blob=await(await fetch('/tests/data/'+reference.file)).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:116*1024**2,cpuKernel:'single'});
 try{const result=await checkSegmentedDigest(engine,blob,reference);await engine.loadBlob({id:'cancel',blob});const controller=new AbortController();let error;
  try{await engine.run({id:'cancel',imageId:'cancel',operation:'file.digest'},{signal:controller.signal,onProgress:e=>{if(e.phase==='perceptual-hashes'&&e.fraction>.85)controller.abort();}});}catch(e){error=e;}
  if(error?.code!=='CANCELLED'||error.cancellationMode!=='storage-closed-before-worker-termination')throw Error('Worker cancellation cleanup failed');
  await engine.loadBlob({id:'reload',blob});const after=await engine.run({id:'reload',imageId:'reload',operation:'file.digest'});if(after.metrics.cache.result||after.data.imageHashes['Radial variance'].some((v,i)=>v!==reference.hashes['Radial variance'][i]))throw Error('Reload digest failed');await engine.unload('reload');if(JSON.stringify(await storageInventory())!==JSON.stringify(before))throw Error('Storage leak');
  const temporaryStorage=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./digest-stream-storage-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.results);};worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.postMessage({});});if(JSON.stringify(await storageInventory())!==JSON.stringify(before))throw Error('Temporary backend storage leak');
  return {...result,cancellationMode:error.cancellationMode,reload:true,storageCleanup:true,temporaryStorage};
 }finally{await engine.dispose();}
}
