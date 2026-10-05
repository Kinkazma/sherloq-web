export async function windowReadBenchmark(){
 const blob=await(await fetch('/.build/jpeg-12000x8000.jpg')).blob(),worker=new Worker(new URL('./window-read-worker.js',import.meta.url),{type:'module'});
 try{return await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Object.assign(new Error(data.error.message),data.error)):resolve(data.result);worker.onerror=e=>reject(new Error(e.message));worker.postMessage({blob});});}finally{worker.terminate();}
}
