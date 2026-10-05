import {study} from './m2-browser-study.mjs';
await study('catnet-compact',async provider=>{
 const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/catnet/',ref=await(await fetch(base+'compact-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const assets={catnet:{...ref,url:new URL(base+ref.file,location.href).href}},runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const budget=new Budget(4*1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets,runtimes}),records=[];
 try{
  for(const c of ref.cases){
   const inputs={};for(const name of ['image','table'])inputs[name]={data:new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer()),dims:c.files[name].shape};
   const [,,height,width]=inputs.image.dims,n=height*width,codes=new Uint8Array(n);for(let i=0;i<n;i++)for(let k=0;k<21;k++)if(inputs.image.data[(3+k)*n+i]===1)codes[i]=k;
   inputs.image={data:inputs.image.data.slice(0,3*n),dims:[1,3,height,width]};inputs.dct_codes={data:codes,dims:[1,1,height,width],type:'uint8'};inputs.dct_budget={data:BigInt64Array.of(BigInt(width*512*48)),dims:[],type:'int64'};
   const output=await pool.run('catnet',inputs,{backend:provider==='wasm'?'cpu':'webgpu',workspaceBytes:256*1024**2,outputBytes:c.metadata.padded_shape.reduce((a,b)=>a*b,1)*8});
   try{const record={case:c.id,outputs:{},metrics:output.metrics};for(const name of ['native_map','padded_map'])record.outputs[name]=compare(output.result[name].data,new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer()));records.push(record);}finally{output.release();}
  }
 }finally{pool.dispose();}
 return {provider,checkpointSha256:ref.checkpointSha256,graphSha256:ref.sha256,records,memory:budget.snapshot(),passed:records.length===3&&records.every(r=>Object.values(r.outputs).every(x=>!x.shapeMismatch&&x.maxError<=1e-4))&&budget.active===0&&budget.retained===0};
});
