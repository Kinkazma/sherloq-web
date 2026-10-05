import {study} from './m2-browser-study.mjs';
await study('trufor-segmented-encoder',async provider=>{
 const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{createNeuralTensor}=await import('/src/neural-tensor-store.js'),{truforSegmentedBackbone}=await import('/src/trufor-segmented-backbone.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/trufor-segments/',manifest=await(await fetch(base+'manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}])),assets=Object.fromEntries(Object.entries(manifest.assets).map(([name,a])=>[name,{...a,url:new URL(base+a.file,location.href).href}]));
 const budget=new Budget(3*1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:4},{assets,runtimes}),records=[];let sources=[],output;
 try{
  for(const c of manifest.cases){
   const start=performance.now();for(const name of ['rgb','npp']){const f=c.files[name],data=new Float32Array(await(await fetch(base+f.file)).arrayBuffer()),t=await createNeuralTensor(3,c.height,c.width,{budget,chunkBytes:4093});await t.writeRows(0,c.height,data);sources.push(t);}
   output=await truforSegmentedBackbone(...sources,{manifest,pool,budget,backend:provider==='wasm'?'cpu':'webgpu',windowBytes:8192,attentionBytes:8192,storage:'memory',onProgress:e=>{if(e.phase==='trufor-encoder-stage')console.error(JSON.stringify(e));}});
   const features=[];for(let i=0;i<4;i++){const t=output.features[i],part=await t.readRows(0,t.height);try{features.push({stage:i+1,dims:part.dims,...compare(part.data,new Float32Array(await(await fetch(base+c.files['feature'+(i+1)].file)).arrayBuffer()))});}finally{part.release();}}
   records.push({case:c.id,features,ms:performance.now()-start,operations:output.executions.reduce((n,e)=>n+e.calls,0),reusedInputBytes:output.executions.reduce((n,e)=>n+(e.reusedInputBytes??0),0)});await output.release();output=null;for(const t of sources)await t.dispose();sources=[];
  }
 }finally{await output?.release();for(const t of sources)await t.dispose();pool.dispose();}
 return {records,memory:budget.snapshot(),scope:'Complete native encoder, global attention across query windows and global FRM/FFM statistics. Forced small row/query windows. Decoder/source/96MP are separate pending qualifications.',passed:records.every(r=>r.features.every(f=>!f.shapeMismatch&&f.maxError<1e-3))&&budget.total()===0};
});
