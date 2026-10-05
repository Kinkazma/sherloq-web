import {study} from './m2-browser-study.mjs';
await study('composite-prepare',async()=>{
 const {NativeStatistics}=await import('/src/native-statistics.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/composite/',cases=await(await fetch(base+'prepare-reference.json')).json(),manifest=await(await fetch('/.build/pyodide/manifest.json')).json(),budget=new Budget(2*1024**3);
 const runtime={downloadBytes:manifest.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:manifest.files.find(x=>x.file==='noiseprint-statistics.zip').sha256},stats=new NativeStatistics(budget,runtime),records=[];
 const read=async c=>new ({float32:Float32Array,float64:Float64Array,uint8:Uint8Array}[c.dtype])(await(await fetch(base+c.file)).arrayBuffer());
 try{
  for(const c of cases){
   let output=await stats.run('prepare',{rgb:{data:await read(c.files.rgb),dims:c.files.rgb.shape},automatic:{data:new Uint8Array([1]),dims:[1]}},{workspaceBytes:16*1024**2,outputBytes:4*c.width*c.height+8192});
   const record={case:c.id,model:output.result.model.data[0],nativeModel:c.model,gray:compare(output.result.gray.data,await read(c.files.gray)),curve:compare(output.result.curve.data,await read(c.files.curve))};output.release();
   output=await stats.run('display',{noise:{data:await read(c.files.noise),dims:c.files.noise.shape}},{workspaceBytes:16*1024**2,outputBytes:3*c.width*c.height});record.display=compare(output.result.noise_rgb.data,await read(c.files.noise_rgb));output.release();records.push(record);
  }
 }finally{stats.dispose();}
 return {records,memory:budget.snapshot(),passed:records.length===2&&records.every(r=>r.model===r.nativeModel&&[r.gray,r.curve,r.display].every(x=>x.maxError===0))&&budget.active===0&&budget.retained===0};
});
