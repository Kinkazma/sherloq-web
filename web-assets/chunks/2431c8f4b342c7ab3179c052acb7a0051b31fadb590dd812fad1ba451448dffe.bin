import {toneTable,fusedCpu} from '../src/ela-lut.js';import {DEFAULT_ELA_PARAMS} from '../src/ela.js';
const now=()=>performance.now();
function rpc(worker,data,transfer=[]){return new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data);worker.onerror=e=>reject(new Error(e.message));worker.postMessage(data,transfer);});}
export async function poolBenchmark(){
 const side=1024,n=side*side,params={...DEFAULT_ELA_PARAMS,grayscale:true},a=new Uint8Array(n*3),b=new Uint8Array(n*3);
 for(let i=0;i<a.length;i++){a[i]=(i*17+(i>>8))%256;b[i]=(i*23+(i>>6))%256;}
 const table=await toneTable(params),expected=await fusedCpu(a,b,params,table),results=[];
 const memoryBudgetBytes=64*1024**2;
 for(const count of [1,2,4,8].filter(x=>x<=(navigator.hardwareConcurrency||1))){
  const reservedBytes=n*32+table.byteLength*count; if(reservedBytes>memoryBudgetBytes)continue;
  const start=now(),workers=Array.from({length:count},()=>new Worker(new URL('./lut-worker.js',import.meta.url),{type:'module'}));
  try{await Promise.all(workers.map(w=>rpc(w,{table})));const startupMs=now()-start;
   for(let iteration=0;iteration<4;iteration++){
    const t=now(),parts=await Promise.all(workers.map((w,i)=>{const begin=Math.floor(n*i/count)*3,end=Math.floor(n*(i+1)/count)*3,aa=a.slice(begin,end),bb=b.slice(begin,end);return rpc(w,{a:aa,b:bb,params},[aa.buffer,bb.buffer]);}));
    const output=new Uint8Array(a.length);let at=0;for(const part of parts){output.set(part.result,at);at+=part.result.length;}
    const totalMs=now()-t;let differentBytes=0;for(let i=0;i<a.length;i++)differentBytes+=output[i]!==expected[i];if(differentBytes)throw new Error('Pool parity failed');
    results.push({workers:count,iteration,startupMs,totalMs,reservedBytes,differentBytes});
   }
  }finally{workers.forEach(w=>w.terminate());}
 }
 return {schema:1,pixels:n,memoryBudgetBytes,internalThreadsPerWorker:1,scope:'Kernel slices only; startup/copy/transfer/assembly measured; JPEG remains one dependency',results};
}
