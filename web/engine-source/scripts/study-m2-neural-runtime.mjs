import {study} from './m2-browser-study.mjs';
await study('m2-neural-runtime',async provider=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js');
  const ref=await(await fetch('/.build/forgeryscope/aliked-heads-reference.json')).json(),manifest=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
  const budget=new Budget(256*1024**2),runtimes={};
  for(const [p,m]of Object.entries(manifest.providers))runtimes[p]={factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href};
  const asset={...ref.graphs.detect,url:new URL('/.build/forgeryscope/'+ref.graphs.detect.file,location.href).href};
  const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{detect:asset},runtimes});
  const file=ref.cases[0].files.scores,values=new Float32Array(await(await fetch('/.build/forgeryscope/'+file.file)).arrayBuffer()),inputs={scores:{data:values,dims:file.shape}};
  const records=[],options={workspaceBytes:8*1024**2,outputBytes:values.byteLength+4,backend:provider==='wasm'?'cpu':'webgpu'};
  try{
    const results=await Promise.all([pool.run('detect',inputs,options),pool.run('detect',inputs,options)]);
    const same=results[0].result.nms.data.every((x,i)=>x===results[1].result.nms.data[i]);
    records.push({case:'two-useful-jobs',same,slots:pool.slots.length,heaps:results.map(r=>r.heapBytes),preflightExecutions:results.map(r=>r.metrics.preflightExecutions)});
    for(const r of results)r.release();
    const abort=new AbortController();let cancelled=false;
    try{await pool.run('detect',inputs,{...options,signal:abort.signal,onProgress:({phase})=>{if(phase==='inference')abort.abort();}});}catch(e){cancelled=e.code==='CANCELLED';}
    records.push({case:'cancel-real-inference',cancelled,activeBytes:budget.active});
    const after=await pool.run('detect',inputs,options);records.push({case:'resume',values:after.result.nms.data.length});after.release();
  }finally{pool.dispose();}
  return {provider,records,memory:budget.snapshot(),passed:records[0].same&&records[0].slots===2&&records[1].cancelled&&budget.retained===0&&budget.active===0};
});
