import {study} from './m2-browser-study.mjs';
await study('noiseprint',async provider=>{
 const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/noiseprint/',ref=await(await fetch(base+'manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const assets=Object.fromEntries(Object.entries(ref.assets).map(([k,v])=>[k,{...v,url:new URL(base+v.file,location.href).href}])),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 if(ref.cases.length!==5)throw Error('Five completed native reference cases required.');
 const budget=new Budget(1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets,runtimes}),records=[];
 try{
  for(const c of ref.cases){
   const data=new Float32Array(await(await fetch(base+c.gray)).arrayBuffer()),expected=new Float32Array(await(await fetch(base+c.noise)).arrayBuffer());
   const output=await pool.run(String(c.quality),{gray:{data,dims:[1,1,c.height,c.width]}},{backend:provider==='wasm'?'cpu':'webgpu',workspaceBytes:c.width*c.height*4096,outputBytes:c.width*c.height*4});
   try{records.push({quality:c.quality,...compare(output.result.noise.data,expected)});}finally{output.release();}
  }
 }finally{pool.dispose();}
 return {provider,records,memory:budget.snapshot(),passed:records.every(x=>!x.shapeMismatch&&x.maxError<=1e-4)&&budget.active===0&&budget.retained===0};
});
