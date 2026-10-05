import{storageInventory}from'./source-api-browser.js';
export async function neuralRowsPrepareBrowserTest(){
 const before=await storageInventory(),reference=await(await fetch('/.build/neural-rows-large-reference.json')).json(),blob=await(await fetch('/'+reference.file)).blob(),worker=new Worker(new URL('./neural-rows-prepare-worker.js',import.meta.url),{type:'module'});
 try{const result=await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>{if(data.progress){console.log(JSON.stringify(data));return;}if(data.ok)resolve(data.report);else reject(Error(data.error?.message));};worker.postMessage({blob,reference});});const after=await storageInventory();if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Temporary arrays remain');return{...result,nativeSources:reference.nativeSources,originalSha256:reference.originalSha256,storageArtifactsRemaining:after.length-before.length};}finally{worker.terminate();}
}
