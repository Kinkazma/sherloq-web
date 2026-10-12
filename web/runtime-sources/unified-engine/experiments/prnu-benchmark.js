import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
function present(data){const start=performance.now(),table=document.createElement('table');for(const score of data.scores){const row=table.insertRow();row.insertCell().textContent=score.camera;row.insertCell().textContent=String(score.score);}document.body.appendChild(table);table.getBoundingClientRect();table.remove();return performance.now()-start;}
export async function prnuBenchmark({samples=3}={}){
 const reference=await(await fetch('/fixtures/prnu-reference.json')).json(),f=reference.cases.find(x=>x.name===reference.benchmark.case),bytes=await read(f.file),database=await read('prnu-snapshot.h5'),engine=createWorkerEngine({computeProfile:'maximum',cpuKernel:'single'}),report={schema:1,scope:'Sequential 1 MP synthetic RGB query, exact native Wiener/NCC against two native fingerprint crops. One worker. RPC includes copies/transfers. Cold includes lazy FFT seed fetch; HDF5 database loading is measured separately. No full-resolution database or physical-device claim.',samples:[]};
 try{
  let start=performance.now();const loaded=await engine.loadPrnuDatabase({id:'db',bytes:database});report.database={rpcMs:performance.now()-start,metrics:loaded.metrics};
  const task={id:'match',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}};
  for(let i=-1;i<samples;i++){
   start=performance.now();await engine.load({id:'q',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});const loadMs=performance.now()-start;
   start=performance.now();const result=await engine.run(task),rpcMs=performance.now()-start;
   for(let j=0;j<reference.benchmark.scores.length;j++){const [name,score]=reference.benchmark.scores[j];if(result.data.scores[j].camera!==name||result.data.scores[j].score!==score)throw new Error('Native PRNU benchmark score');}
   const presentationMs=present(result.data);start=performance.now();const cached=await engine.run(task),cachedRpcMs=performance.now()-start;if(!cached.metrics.cache.result)throw new Error('PRNU cache');
   const row={loadMs,rpcMs,presentationMs,pipelineMs:loadMs+rpcMs+presentationMs,cachedRpcMs,metrics:result.metrics};if(i<0)report.cold=row;else report.samples.push(row);await engine.unload('q');console.log('PRNU measured',i,JSON.stringify({rpcMs,cachedRpcMs}));
  }
  report.medianRpcMs=median(report.samples.map(x=>x.rpcMs));report.medianPipelineMs=median(report.samples.map(x=>x.pipelineMs));report.capabilities=await engine.capabilities();return report;
 }finally{engine.dispose();}
}
