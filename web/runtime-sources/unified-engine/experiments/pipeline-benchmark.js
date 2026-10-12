import {createWorkerEngine} from '../src/worker-client.js';
export async function pipelineBenchmark(){const runs=[];for(const side of [512,1024]){
 const bytes=new Uint8Array(await(await fetch(new URL('../fixtures/bench-'+side+'.jpg',import.meta.url))).arrayBuffer());
 let expected;
 for(const cpuKernel of ['reference','single','auto']){
  const e=createWorkerEngine({cpuKernel});try{const start=performance.now();const loaded=await e.load({id:'fixture',bytes});const loadRpcMs=performance.now()-start;
   for(let iteration=0;iteration<3;iteration++){const t=performance.now(),result=await e.run({id:String(iteration),imageId:'fixture',operation:'ela.classic',params:iteration===2?{scale:37}:{}}),rpcMs=performance.now()-t;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.pixels.data)),x=>x.toString(16).padStart(2,'0')).join('');
    if(cpuKernel==='reference'&&iteration===0)expected=hash;if(cpuKernel!=='reference'&&iteration===0&&hash!==expected)throw new Error('Pipeline parity failed');
    runs.push({side,cpuKernel,iteration,loadRpcMs,load:loaded.metrics,rpcMs,engine:result.metrics,resultSha256:hash});
   }
  }finally{e.dispose();}
 }
}return {schema:1,scope:'Actual persistent module worker + JPEG decode/recompression + ELA + output transfer; excludes UI painting',runs};}
