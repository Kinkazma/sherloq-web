import {study} from './m2-browser-study.mjs';
await study('catnet-prepare',async()=>{
 const {CatnetPreparation}=await import('/src/catnet-preparation.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/catnet/',ref=await(await fetch(base+'reference.json')).json(),budget=new Budget(512*1024**2),factory=(await import(base+'jpeg.mjs')).default,prepare=new CatnetPreparation(budget,factory),records=[];
 try{for(const c of ref.cases){const bytes=new Uint8Array(await(await fetch(base+c.jpeg)).arrayBuffer()),output=await prepare.prepare(bytes);try{
  const record={case:c.id,metadata:output.metadata,outputs:{}};
  for(const name of ['image','table'])record.outputs[name]=compare(output[name].data,new Float32Array(await(await fetch(base+c.files[name].file)).arrayBuffer()));records.push(record);
 }finally{output.release();}}}finally{prepare.dispose();}
 return {records,memory:budget.snapshot(),passed:records.length===2&&records.every(r=>Object.values(r.outputs).every(x=>x.maxError===0))&&budget.active===0&&budget.retained===0};
});
