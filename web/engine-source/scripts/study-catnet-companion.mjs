import {study} from './m2-browser-study.mjs';
await study('catnet-companion',async()=>{
 const {CatnetPreparation}=await import('/src/catnet-preparation.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/catnet/',ref=await(await fetch(base+'reference.json')).json(),budget=new Budget(512*1024**2),factory=(await import(base+'jpeg.mjs')).default,prepare=new CatnetPreparation(budget,factory),records=[];
 try{
  const c=await(await fetch(base+'companion-reference.json')).json(),image={width:c.width,height:c.height,data:new Uint8Array(await(await fetch(base+c.rgb)).arrayBuffer())},encoded=await prepare.companion(image);
  try{
   const output=await prepare.prepare(encoded.data);try{
    const expectedBytes=new Uint8Array(await(await fetch(base+c.jpeg)).arrayBuffer());records.push({jpeg:compare(encoded.data,expectedBytes),image:compare(output.image.data,new Float32Array(await(await fetch(base+c.image)).arrayBuffer())),table:compare(output.table.data,new Float32Array(await(await fetch(base+c.table)).arrayBuffer()))});
   }finally{output.release();}
  }finally{encoded.release();}
 }finally{prepare.dispose();}
 return {records,memory:budget.snapshot(),passed:records.length===1&&Object.values(records[0]).every(x=>!x.shapeMismatch&&x.maxError===0)&&budget.active===0&&budget.retained===0};
});
