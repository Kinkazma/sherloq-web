import {study} from './m2-browser-study.mjs';
await study('forgeryscope-blot-chain',async provider=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{ForgeryscopePreparation}=await import('/src/forgeryscope-preparation.js'),{ForgeryscopeNetworks}=await import('/src/forgeryscope-networks.js');
  const base='/.build/forgeryscope/',ref=await(await fetch(base+'blot-chain-reference.json')).json(),manifest=await(await fetch(base+'manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
  const assets=Object.fromEntries(Object.entries(manifest.assets).map(([k,v])=>[k,{...v,url:new URL(base+v.file,location.href).href}]));
  const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
  const budget=new Budget(1024**3),pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets,runtimes}),factory=(await import(base+'prepare.mjs')).default,preparation=new ForgeryscopePreparation(budget,factory),networks=new ForgeryscopeNetworks({pool,preparation,budget,assets}),records=[];
  try{
    for(const c of ref.cases){
      const images=[];for(const im of c.images)images.push({...im,data:new Uint8Array(await(await fetch(base+im.file)).arrayBuffer())});
      const actual=await networks.match(...images,'Blots',{backend:provider==='wasm'?'cpu':'webgpu'}),expected=c.expected;
      const record={case:c.id,error:actual.error,inliers:actual.inliers,nativeInliers:expected.inliers,matches:actual.total_matches,nativeMatches:expected.total_matches,scoreError:Math.abs(actual.mean_match_score-expected.mean_match_score)};
      if(actual.H&&expected.H)record.affineMaxError=Math.max(...actual.H.map((v,i)=>Math.abs(v-expected.H.flat()[i])));
      records.push(record);
    }
  }finally{pool.dispose();preparation.dispose();}
  return {provider,records,memory:budget.snapshot(),passed:records.every(r=>!r.error&&r.inliers===r.nativeInliers&&r.matches===r.nativeMatches&&r.scoreError<=1e-4&&r.affineMaxError<=1e-4)&&budget.active===0&&budget.retained===0};
});
