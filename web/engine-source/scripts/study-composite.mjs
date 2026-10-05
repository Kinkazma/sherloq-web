import {study} from './m2-browser-study.mjs';
await study('composite-statistics',async()=>{
 const {NativeStatistics}=await import('/src/native-statistics.js'),{Budget}=await import('/src/cache.js'),{compare}=await import('/experiments/forgeryscope/study-runtime.js');
 const base='/.build/composite/',ref=await(await fetch(base+'reference.json')).json(),manifest=await(await fetch('/.build/pyodide/manifest.json')).json(),budget=new Budget(2*1024**3);
 const runtime={downloadBytes:manifest.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:manifest.files.find(x=>x.file==='noiseprint-statistics.zip').sha256},stats=new NativeStatistics(budget,runtime),inputs={};
 for(const name of ['gray','noise'])inputs[name]={data:new Float32Array(await(await fetch(base+ref.files[name].file)).arrayBuffer()),dims:[ref.height,ref.width]};
 let output;const phases=[];
 try{
  output=await stats.run('composite',inputs,{workspaceBytes:256*1024**2,outputBytes:4*1024**2,onProgress:e=>phases.push(e.phase)});
  const records={};for(const [name,t]of Object.entries(output.result)){
   const file=ref.files[name];if(!file)continue;const Type=file.dtype==='float64'?Float64Array:file.dtype==='float32'?Float32Array:file.dtype==='int64'?BigInt64Array:Uint8Array;
   records[name]=compare(t.data,new Type(await(await fetch(base+file.file)).arrayBuffer()));
  }
  output.release();output=null;stats.dispose();
  return {records,phases,packages:manifest.packages,memory:budget.snapshot(),passed:Object.entries(records).every(([k,r])=>!r.shapeMismatch&&r.maxError<=(['raster','map_rgb','valid'].includes(k)?0:1e-4))&&budget.active===0&&budget.retained===0};
 }finally{output?.release();stats.dispose();}
});
