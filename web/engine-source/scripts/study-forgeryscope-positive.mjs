import {study} from './m2-browser-study.mjs';
await study('forgeryscope-positive',async provider=>{
  const {createForgeryscopeAnalyzer}=await import('/src/forgeryscope-analyzer.js'),{Budget}=await import('/src/cache.js');
  const base='/.build/forgeryscope/',ref=await(await fetch(base+'positive-reference.json')).json(),manifest=await(await fetch(base+'manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json();
  const assets=Object.fromEntries(Object.entries(manifest.assets).map(([k,v])=>[k,{...v,url:new URL(base+v.file,location.href).href}]));
  const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
  const budget=new Budget(3*1024**3),factory=(await import(base+'prepare.mjs')).default,engine=createForgeryscopeAnalyzer({budget,assets,runtimes,preparationFactory:factory,siftFactory:(await import(base+'sift.mjs')).default,siftIdentity:'native-sift'}),records=[];
  try{
    for(const c of ref.cases){
      const image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+c.file)).arrayBuffer())};
      const params={profile:c.id,...(c.panels?{panels:c.panels}:{})};
      const result=await engine.analyze(image,params,{backend:provider==='wasm'?'cpu':'webgpu'});
      try{
        const record={case:c.id,status:result.metadata.status,nativeStatus:c.metadata.status,fields:{},comparisons:result.metadata.comparisons.length,nativeComparisons:c.metadata.comparisons.length,laneSearch:result.metadata.lane_search,nativeLaneSearch:c.metadata.lane_search,laneMatches:result.metadata.lane_matches,nativeLaneMatches:c.metadata.lane_matches};
        for(const [name,item]of Object.entries(c.fields)){
          const expected=new (item.dtype==='float32'?Float32Array:Uint8Array)(await(await fetch(base+item.file)).arrayBuffer()),actual=result[name];
          let differences=0;for(let i=0;i<expected.length;i++)differences+=expected[i]!==actual[i];
          record.fields[name]={values:expected.length,differences};
        }
        records.push(record);
      }finally{result.release();}
    }
  }finally{engine.dispose();}
  return {provider,records,memory:budget.snapshot(),passed:records.every(r=>r.status===r.nativeStatus&&r.comparisons===r.nativeComparisons&&r.laneSearch===r.nativeLaneSearch&&r.laneMatches===r.nativeLaneMatches&&Object.values(r.fields).every(f=>f.differences===0))&&budget.active===0&&budget.retained===0};
});
