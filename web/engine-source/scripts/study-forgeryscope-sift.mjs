import {study} from './m2-browser-study.mjs';
await study('forgeryscope-sift',async()=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{createForgeryscopeSift}=await import('/src/forgeryscope-sift.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
  const base='/.build/forgeryscope/',ref=await(await fetch(base+'rootsift-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),m=runtime.providers.wasm;
  const budget=new Budget(512*1024**2),runtimes={wasm:{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.wasm.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}};
  const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{rootsift:{...ref,url:new URL(base+ref.file,location.href).href}},runtimes}),factory=(await import(base+'sift.mjs')).default,sift=createForgeryscopeSift({budget,pool,factory,identity:'study'}),records=[];
  try{
    for(const c of ref.cases){
      const result=await sift.extract({width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+c.rgb)).arrayBuffer())},{backend:'cpu'});
      try{
        const record={case:c.id};
        for(const name of ['keypoints','descriptors','keypoint_scores','scales','oris']){
          const expected=new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer());
          record[name]=compare(result[name].data,expected);
        }
        records.push(record);
      }finally{result.release();}
    }
  }finally{sift.dispose();pool.dispose();}
  return {records,memory:budget.snapshot(),passed:records.every(r=>['keypoints','descriptors','keypoint_scores','scales','oris'].every(k=>r[k].maxError<=1e-4))&&budget.active===0&&budget.retained===0};
});
