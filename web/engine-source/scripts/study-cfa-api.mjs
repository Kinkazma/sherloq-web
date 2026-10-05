import {study} from './m2-browser-study.mjs';
await study('cfa-api',async provider=>{
 const {createCfaAnalyzer}=await import('/src/cfa-analyzer.js'),{Budget}=await import('/src/cache.js');
 const base='/.build/cfa-m2/',manifest=await(await fetch(base+'program-manifest.json')).json(),ref=await(await fetch(base+'reference.json')).json(),assets=Object.fromEntries(manifest.models.map(m=>[m.variant,{...m.weights,url:new URL(base+m.weights.file,location.href).href,checkpointSha256:m.checkpointSha256,program:{...m.program,url:new URL(base+m.program.file,location.href).href},wasmMaximumBytes:2*1024**3}])),runtimes={wasm:{executor:'cfa',factoryUrl:new URL(base+'operators.mjs',location.href).href,wasmUrl:new URL(base+'operators.wasm',location.href).href}};
 const budget=new Budget(512*1024**2),api=createCfaAnalyzer({assets,runtimes,budget,resourceHints:{hardwareConcurrency:4}}),c=ref.models[0].cases.find(x=>x.label==='noise'),input=new Float32Array(await(await fetch(base+c.inputFile)).arrayBuffer()),height=c.inputShape[2],width=c.inputShape[3],data=new Uint8Array(width*height*3);for(let i=0;i<width*height;i++)for(let ch=0;ch<3;ch++)data[i*3+ch]=Math.round(input[ch*width*height+i]*255);
 const image={width,height,data},events=[],backend=provider==='webgpu'?'webgpu':'cpu';let first,second;
 try{
  first=await api.analyze(image,{}, {backend,onProgress:x=>events.push(x.phase)});const original=first.data.probabilities[0];first.data.probabilities[0]=-1;second=await api.analyze(image,{}, {backend});const isolated=second.data.probabilities[0]===original&&second.metrics.cache.result;
  const rendered=await api.render(image,second,2),renderBytes=rendered.data.length;rendered.release();const exported=api.exportNpz(second),npzBytes=exported.bytes.length;exported.release();
  const localDifferences=second.data.local_grid.reduce((n,x,i)=>n+(x!==c.local[i]),0),maxSuspicionError=Math.max(...second.data.suspicion.map((x,i)=>Math.abs(x-c.suspicion[i])));
  first.release();first=null;second.release();second=null;api.clearCache();
  const controller=new AbortController();let cancelled=false;try{const r=await api.analyze(image,{}, {backend,signal:controller.signal,onProgress:e=>{if(e.phase==='inference')controller.abort();}});r.release();}catch(e){cancelled=e.code==='CANCELLED';}
  api.dispose();return {case:c.label,cacheIsolated:isolated,cancelled,localDifferences,maxSuspicionError,renderBytes,npzBytes,events,memory:budget.snapshot(),provider,scope:'Actual requested component lifecycle; public decision corpus separately reported.',passed:isolated&&cancelled&&localDifferences===0&&renderBytes===data.length&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{first?.release();second?.release();api.dispose();}
});
