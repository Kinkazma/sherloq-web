import {study} from './m2-browser-study.mjs';
await study('trufor-bounded',async provider=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
  const base='/.build/trufor-unfused/',ref=await(await fetch(base+'bounded-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
  const assets={trufor:{...ref,url:new URL(base+ref.file,location.href).href}},runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
  const budget=new Budget(3*1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets,runtimes}),records=[];
  try{
    for(const c of ref.cases){
      const input=new Float32Array(await(await fetch(base+c.files.rgb.file)).arrayBuffer());
      const output=await pool.run('trufor',{rgb:{data:input,dims:c.files.rgb.shape},attention_budget:{data:new BigInt64Array([8192n]),dims:[],type:'int64'},fusion_budget:{data:new BigInt64Array([8192n]),dims:[],type:'int64'}},{backend:provider==='wasm'?'cpu':'webgpu',workspaceBytes:256*1024**2,outputBytes:(c.width*c.height*3+1)*4});
      try{
        const record={case:c.id,width:c.width,height:c.height,outputs:{},metrics:output.metrics};
        for(const name of ['map','confidence','score','noiseprint_pp'])record.outputs[name]=compare(output.result[name].data,new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer()));
        records.push(record);
      }finally{output.release();}
    }
  }finally{pool.dispose();}
  return {provider,checkpointSha256:ref.checkpointSha256,graphSha256:ref.sha256,records,memory:budget.snapshot(),passed:records.every(r=>Object.values(r.outputs).every(x=>!x.shapeMismatch&&x.maxError<=1e-4))&&budget.active===0&&budget.retained===0};
});
