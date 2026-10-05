import{storageInventory}from'./source-api-browser.js';
export async function neuralCompositionBrowserTest(options={}){
 const before=await storageInventory(),reference=await(await fetch('/.build/neural-composition/reference.json')).json(),worker=new Worker(new URL('./neural-composition-worker.js',import.meta.url),{type:'module'});
 try{const result=await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>{if(data.progress){console.log(JSON.stringify(data));return;}if(data.ok)resolve(data.report);else reject(Error(data.error?.message));};worker.postMessage({reference,...options});});const after=await storageInventory();if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Temporary arrays remain');return{...result,opencv:reference.opencv,storageArtifactsRemaining:after.length-before.length};}finally{worker.terminate();}
}
