import {study} from './m2-browser-study.mjs';
await study('composite-api',async provider=>{
 const {createCompositeAnalyzer}=await import('/src/composite-analyzer.js'),{Budget}=await import('/src/cache.js');
 const ref=await(await fetch('/.build/noiseprint/manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),scientific=await(await fetch('/.build/pyodide/manifest.json')).json();
 const assets=Object.fromEntries(Object.entries(ref.assets).map(([k,v])=>[k,{...v,url:new URL('/.build/noiseprint/'+v.file,location.href).href}])),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const statisticsRuntime={downloadBytes:scientific.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:scientific.files.find(x=>x.file==='noiseprint-statistics.zip').sha256};
 const budget=new Budget(2*1024**3),api=createCompositeAnalyzer({assets,runtimes,statisticsRuntime,budget}),width=96,height=96,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*37+Math.floor(i/113)*19)%256);let first,second;
 try{
  first=await api.analyze({width,height,data},{quality:95,stage:'noise'},{backend:provider==='wasm'?'cpu':'webgpu'});const value=first.data.noise[0];first.data.noise[0]=-999;
  second=await api.analyze({width,height,data},{quality:95,stage:'map'},{backend:provider==='wasm'?'cpu':'webgpu'});
  const cacheIsolated=second.data.noise[0]===value,retainsNoise=second.mapError?.message.includes('100 × 100')&&second.data.noise_rgb.length===width*height*3;
  first.release();first=null;second.release();second=null;api.dispose();
  return {provider,cacheIsolated,retainsNoise,memory:budget.snapshot(),passed:cacheIsolated&&retainsNoise&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{first?.release();second?.release();api.dispose();}
});
