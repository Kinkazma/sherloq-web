import {study} from './m2-browser-study.mjs';
await study('catnet-compact-api',async provider=>{
 const {createCatnetAnalyzer}=await import('/src/catnet-analyzer.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/catnet/',standard=await(await fetch(base+'reference.json')).json(),bounded=await(await fetch(base+'compact-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
 const assets=Object.fromEntries(Object.entries({standard,compact:bounded}).map(([name,asset])=>[name,{...asset,url:new URL(base+asset.file,location.href).href}])),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 const budget=new Budget(4*1024**3),jpegFactory=(await import(base+'jpeg.mjs')).default,api=createCatnetAnalyzer({assets,runtimes,jpegFactory,budget}),c=bounded.cases[1],[height,width]=c.metadata.source_shape,[ph,pw]=c.metadata.padded_shape,pixels=ph*pw,normalized=new Float32Array(await(await fetch(base+c.files.image.file)).arrayBuffer()),data=new Uint8Array(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let ch=0;ch<3;ch++)data[(y*width+x)*3+ch]=Math.round(normalized[ch*pixels+y*pw+x]*127.5+127.5);
 const sourceBytes=new Uint8Array(await(await fetch(base+c.jpeg)).arrayBuffer()),image={width,height,data},params={sourceBytes,memoryBounded:true},options={backend:provider==='wasm'?'cpu':'webgpu'};let first,second;
 try{
  first=await api.analyze(image,params,options);const raw=compare(first.data.native_map,new Float32Array(await(await fetch(base+c.files.native_map.file)).arrayBuffer()));
  const original=first.data.map[0];first.data.map[0]=-1;second=await api.analyze(image,params,options);const isolated=second.data.map[0]===original&&second.metrics.cache.result;
  const rendered=await api.render(image,second,0),renderBytes=rendered.data.length;rendered.release();const exported=api.exportNpz(second),npzBytes=exported.bytes.length;exported.release();
  const changed={...image,data:data.slice()};changed.data[0]^=1;let rejected=false;try{const invalid=await api.analyze(changed,params,options);invalid.release();}catch(e){rejected=e.message.includes('no longer matches');}
  first.release();first=null;second.release();second=null;api.dispose();
  return {provider,raw,cacheIsolated:isolated,rejectsEditedJpeg:rejected,renderBytes,npzBytes,memory:budget.snapshot(),passed:raw.maxError<=1e-4&&isolated&&rejected&&renderBytes===width*height*3&&budget.active===0&&budget.retained===0&&budget.cacheBytes===0};
 }finally{first?.release();second?.release();api.dispose();}
});
