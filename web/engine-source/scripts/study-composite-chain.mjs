import {study} from './m2-browser-study.mjs';
await study('composite-chain',async provider=>{
 const {createCompositeAnalyzer}=await import('/src/composite-analyzer.js'),{Budget}=await import('/src/cache.js');
 const ref=await(await fetch('/.build/noiseprint/manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),scientific=await(await fetch('/.build/pyodide/manifest.json')).json();
 const assets=Object.fromEntries(Object.entries(ref.assets).map(([k,v])=>[k,{...v,url:new URL('/.build/noiseprint/'+v.file,location.href).href}])),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const statisticsRuntime={downloadBytes:scientific.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:scientific.files.find(x=>x.file==='noiseprint-statistics.zip').sha256};
 const chain=await(await fetch('/.build/composite/chain-reference.json')).json(),budget=new Budget(2*1024**3),api=createCompositeAnalyzer({assets,runtimes,statisticsRuntime,budget}),data=new Uint8Array(await(await fetch('/.build/composite/'+chain.files.rgb.file)).arrayBuffer());let result;
 const {compare}=await import('/experiments/forgeryscope/study-runtime.js');
 try{
  result=await api.analyze({width:chain.width,height:chain.height,data},{quality:chain.quality,stage:'map'},{backend:provider==='wasm'?'cpu':'webgpu'});
  const records={};for(const name of ['noise','map','valid','raster','map_rgb']){
   if(!result.data[name]){records[name]={missing:true};continue;}
   const file=chain.files[name],Type=file.dtype==='float32'?Float32Array:file.dtype==='float64'?Float64Array:Uint8Array;
   records[name]=compare(result.data[name],new Type(await(await fetch('/.build/composite/'+file.file)).arrayBuffer()));
  }
  const exported=api.exportNpz(result),exportBytes=exported.bytes.length;exported.release();const mapError=result.mapError;
  result.release();result=null;api.dispose();
  return {provider,records,mapError,exportBytes,memory:budget.snapshot(),passed:!mapError&&Object.entries(records).every(([k,r])=>!r.missing&&!r.shapeMismatch&&r.maxError<=(['map_rgb','raster','valid'].includes(k)?0:1e-4))&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{result?.release();api.dispose();}
});
