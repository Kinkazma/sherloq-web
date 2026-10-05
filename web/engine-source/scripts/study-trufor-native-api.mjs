import {study} from './m2-browser-study.mjs';
await study('trufor-native-api',async provider=>{
 const {createTruforAnalyzer}=await import('/src/trufor-analyzer.js'),{Budget}=await import('/src/cache.js');
 const base='/.build/trufor-streamed/',ref=await(await fetch(base+'native-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const npp=await(await fetch('/.build/trufor-npp/native-manifest.json')).json();const noiseprint={asset:{...npp.weights,url:new URL('/.build/trufor-npp/'+npp.weights.file,location.href).href,program:{...npp.program,url:new URL('/.build/trufor-npp/'+npp.program.file,location.href).href}},runtime:{executor:'noiseprint-plus',factoryUrl:new URL('/.build/cfa-m2/operators.mjs',location.href).href,wasmUrl:new URL('/.build/cfa-m2/operators.wasm',location.href).href}};
 const budget=new Budget(3*1024**3),api=createTruforAnalyzer({asset:{...ref,url:new URL(base+ref.file,location.href).href},runtimes,noiseprint,budget}),c=ref.cases[1],image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+ref.referenceDirectory+c.file)).arrayBuffer())},phases=[];let first,second;
 try{
  first=await api.analyze(image,{}, {backend:provider==='wasm'?'cpu':'webgpu',onProgress:e=>phases.push(e.phase)});
  const value=first.data.map[0];first.data.map[0]=-1;
  second=await api.analyze(image,{}, {backend:provider==='wasm'?'cpu':'webgpu'});
  const cacheIsolated=second.data.map[0]===value&&second.metrics.cache.result;
  const views=[];for(const view of ['map','confidence','noiseprint_pp']){const output=await api.render(second,view);views.push({view,bytes:output.data.length});output.release();}
  const npz=api.exportNpz(second),npzBytes=npz.bytes.length;npz.release();
  first.release();first=null;second.release();second=null;api.clearCache();const controller=new AbortController();let cancelled=false;try{await api.analyze(image,{}, {backend:'cpu',signal:controller.signal,onProgress:e=>{if(e.phase==='inference')controller.abort();}});}catch(e){cancelled=e.code==='CANCELLED';}api.dispose();
  return {provider,phases,cacheIsolated,cancelled,views,npzBytes,memory:budget.snapshot(),passed:cancelled&&cacheIsolated&&views.every(v=>v.bytes===c.width*c.height*3)&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{first?.release();second?.release();api.dispose();}
});
