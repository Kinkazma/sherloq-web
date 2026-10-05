import {study} from './m2-browser-study.mjs';
await study('trufor-api',async provider=>{
 const {createTruforAnalyzer}=await import('/src/trufor-analyzer.js'),{Budget}=await import('/src/cache.js');
 const base='/.build/trufor-unfused/',ref=await(await fetch(base+'bounded-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const budget=new Budget(3*1024**3),api=createTruforAnalyzer({asset:{...ref,url:new URL(base+ref.file,location.href).href},runtimes,budget}),c=ref.cases[1],image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+c.file)).arrayBuffer())},phases=[];let first,second;
 try{
  first=await api.analyze(image,{}, {backend:provider==='wasm'?'cpu':'webgpu',onProgress:e=>phases.push(e.phase)});
  const value=first.data.map[0];first.data.map[0]=-1;
  second=await api.analyze(image,{}, {backend:provider==='wasm'?'cpu':'webgpu'});
  const cacheIsolated=second.data.map[0]===value&&second.metrics.cache.result;
  const views=[];for(const view of ['map','confidence','noiseprint_pp']){const output=await api.render(second,view);views.push({view,bytes:output.data.length});output.release();}
  const npz=api.exportNpz(second),npzBytes=npz.bytes.length;npz.release();
  first.release();first=null;second.release();second=null;api.dispose();
  return {provider,phases,cacheIsolated,views,npzBytes,memory:budget.snapshot(),passed:cacheIsolated&&views.every(v=>v.bytes===c.width*c.height*3)&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{first?.release();second?.release();api.dispose();}
});
