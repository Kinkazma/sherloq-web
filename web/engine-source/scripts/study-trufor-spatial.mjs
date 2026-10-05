import {study} from './m2-browser-study.mjs';
await study('trufor-spatial',async provider=>{
 const {createTruforAnalyzer}=await import('/src/trufor-analyzer.js'),{Budget}=await import('/src/cache.js');
 const base='/.build/trufor-streamed/',ref=await(await fetch(base+'native-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const npp=await(await fetch('/.build/trufor-npp/native-manifest.json')).json();const noiseprint={asset:{...npp.weights,url:new URL('/.build/trufor-npp/'+npp.weights.file,location.href).href,program:{...npp.program,url:new URL('/.build/trufor-npp/'+npp.program.file,location.href).href}},runtime:{executor:'noiseprint-plus',factoryUrl:new URL('/.build/cfa-m2/operators.mjs',location.href).href,wasmUrl:new URL('/.build/cfa-m2/operators.wasm',location.href).href}};

 const cases=(await(await fetch('/.build/trufor-spatial/reference.json')).json()).cases,budget=new Budget(3*1024**3),api=createTruforAnalyzer({asset:{...ref,url:new URL(base+ref.file,location.href).href},runtimes,noiseprint,budget}),records=[];
 const {compare}=await import('/experiments/forgeryscope/study-runtime.js');
 try{for(const c of cases){const image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch('/.build/trufor-spatial/'+c.file)).arrayBuffer())},result=await api.analyze(image,{}, {backend:provider==='wasm'?'cpu':'webgpu'});try{const outputs={};for(const name of ['map','confidence','score','noiseprint_pp'])outputs[name]=compare(name==='score'?Float32Array.of(result.data.score):result.data[name],new Float32Array(await(await fetch('/.build/trufor-spatial/'+c.files[name].file)).arrayBuffer()));records.push({case:c.id,outputs,execution:result.metrics});}finally{result.release();api.clearCache();}}}finally{api.dispose();}
 return {records,graphSha256:ref.sha256,memory:budget.snapshot(),passed:records.every(r=>Object.values(r.outputs).every(o=>!o.shapeMismatch&&o.maxError<=1e-4))&&budget.total()===0};
});
