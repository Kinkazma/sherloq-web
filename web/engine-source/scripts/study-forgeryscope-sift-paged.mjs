import {study} from './m2-browser-study.mjs';
await study(process.argv.includes('--dense-parity')?'forgeryscope-sift-paged-dense-parity':process.argv.includes('--dense')?'forgeryscope-sift-dense-rich':'forgeryscope-sift-paged',async({provider,dense,parity})=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{createForgeryscopeSift}=await import('/src/forgeryscope-sift.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
  const base='/.build/forgeryscope/',ref=await(await fetch(base+'sift-paged-reference.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),m=runtime.providers.wasm;
  const budget=new Budget(3*1024**3),runtimes={wasm:{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.wasm.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}};
  const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{rootsift:{...ref,url:new URL(base+ref.file,location.href).href}},runtimes}),factory=(await import(base+'sift.mjs')).default,sift=createForgeryscopeSift({budget,pool,factory,identity:'study'}),records=[];
  try{
    for(const c of ref.cases){
      const image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+c.rgb)).arrayBuffer())};const result=await sift.extract(image,{backend:provider==='wasm'?'cpu':'webgpu',segmentedSift:!dense,transform:c.transform});
      try{
        const record={case:c.id,execution:result.execution};
        for(const name of ['keypoints','descriptors','keypoint_scores','scales','oris']){
          const expected=new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer());
          record[name]=compare(result[name].data,expected);const a=result[name].data;let worst=0;for(let i=1;i<a.length;i++)if(Math.abs(a[i]-expected[i])>Math.abs(a[worst]-expected[worst]))worst=i;record[name].worst={index:worst,actual:a[worst],expected:expected[worst]};
        }
        if(parity){const control=await sift.extract(image,{backend:'cpu',segmentedSift:false,transform:c.transform});try{record.denseParity=Object.fromEntries(['keypoints','descriptors','keypoint_scores','scales','oris'].map(k=>[k,compare(result[k].data,control[k].data)]));}finally{control.release();}}
        records.push(record);
      }finally{result.release();}
    }
  }finally{sift.dispose();pool.dispose();}
  return {records,memory:budget.snapshot(),passed:records.every(r=>['keypoints','descriptors','keypoint_scores','scales','oris'].every(k=>(parity?r.denseParity[k]:r[k]).maxError<=1e-4))&&budget.active===0&&budget.retained===0};
},{dense:process.argv.includes('--dense'),parity:process.argv.includes('--dense-parity')});
