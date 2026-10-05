export async function idbPageCacheBenchmark(){
 const worker=new Worker(new URL('./idb-page-cache-worker.js',import.meta.url),{type:'module'});
 try{return await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>{if(data.progress){console.log('IDB cache benchmark: '+data.progress);return;}if(data.error)reject(Object.assign(Error(data.error.message),{code:data.error.code}));else resolve(data.result);};worker.postMessage({});});}finally{worker.terminate();}
}
