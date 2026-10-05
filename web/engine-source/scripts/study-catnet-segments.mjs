import {study} from './m2-browser-study.mjs';
await study('catnet-segmented-network',async provider=>{
 const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{createNeuralTensor}=await import('/src/neural-tensor-store.js'),{catnetSegmentedNetwork}=await import('/src/catnet-segmented-network.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/catnet-segments/',manifest=await(await fetch(base+'manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}])),assets=Object.fromEntries(Object.entries(manifest.assets).map(([name,a])=>[name,{...a,url:new URL(base+a.file,location.href).href}]));
 const budget=new Budget(3*1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:4},{assets,runtimes}),records=[];let sources=[],output;
 try{
  for(const c of manifest.cases){
   const start=performance.now();for(const name of ['rgb','codes']){const f=c.files[name],data=new Float32Array(await(await fetch(base+f.file)).arrayBuffer()),t=await createNeuralTensor(...f.dims.slice(1),{budget,chunkBytes:4093});await t.writeRows(0,t.height,data);sources.push(t);}
   const table={data:new Float32Array(await(await fetch(base+c.files.table.file)).arrayBuffer()),dims:c.files.table.dims};let last=0;
   output=await catnetSegmentedNetwork(...sources,table,{manifest,pool,budget,backend:provider==='wasm'?'cpu':'webgpu',windowBytes:16384,storage:'memory',onProgress:e=>{if(performance.now()-last>10000){console.error(JSON.stringify({case:c.id,...e}));last=performance.now();}}});
   const outputs={};for(const key of ['native_map','padded_map']){const t=output[key],part=await t.readRows(0,t.height);try{const expected=new Float32Array(await(await fetch(base+c.files[key].file)).arrayBuffer());outputs[key]={...compare(part.data,expected),meanAbsoluteError:part.data.reduce((s,v,i)=>s+Math.abs(v-expected[i]),0)/part.data.length,thresholdChanges:part.data.reduce((s,v,i)=>s+((v>=.5)!==(expected[i]>=.5)),0)};}finally{part.release();}}
   records.push({case:c.id,metadata:c.metadata,outputs,ms:performance.now()-start,operations:output.executions.reduce((n,e)=>n+e.calls,0)});await output.release();output=null;for(const t of sources)await t.dispose();sources=[];
  }
 }finally{await output?.release();for(const t of sources)await t.dispose();pool.dispose();}
 return {records,memory:budget.snapshot(),scope:'Complete native RGB/DCT HRNet, forced row boundaries, all interbranch global bilinear resizes, native softmax map and full padded map. Native preprocessed input; source JPEG and 96 MP are separate qualifications.',passed:records.every(r=>Object.values(r.outputs).every(f=>!f.shapeMismatch&&f.maxError<1e-3&&f.thresholdChanges===0))&&budget.total()===0};
});
