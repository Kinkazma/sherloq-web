import {study} from './m2-browser-study.mjs';
await study('cfa-hybrid',async()=>{
 const create=(await import('/.build/cfa-m2/operators.mjs')).default,{runCfaProgram,runCfaProgramHybrid}=await import('/src/cfa-program.js'),{createCfaGPU}=await import('/src/cfa-gpu.js'),{cfaPostprocess}=await import('/src/cfa-postprocess.js');
 const base='/.build/cfa-m2/',json=async file=>(await fetch(base+file)).json(),floats=async file=>new Float32Array(await(await fetch(base+file)).arrayBuffer()),manifest=await json('program-manifest.json'),ref=await json('reference.json'),module=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:16384})}),gpu=await createCfaGPU(),records=[];
 const error=(a,b)=>{let max=0,total=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);max=Math.max(max,delta);total+=delta;}return {max,mean:total/a.length};};
 try{for(const m of manifest.models){const program=await json(m.program.file),weights=await floats(m.weights.file),reference=ref.models.find(x=>x.variant===m.variant);
  for(const c of reference.cases){const input={dims:c.inputShape,data:await floats(c.inputFile)},t0=performance.now(),result=await runCfaProgramHybrid(module,program,weights,input,gpu),ms=performance.now()-t0,probabilities=Float32Array.from(result.data,x=>Math.exp(x)),post=cfaPostprocess(probabilities,c.local.length);
   records.push({variant:m.variant,case:c.label,hybridConvolutions:result.hybridConvolutions,milliseconds:ms,probability:error(probabilities,c.probabilities),grid:error(post.grids,c.grids),suspicion:error(post.suspicion,c.suspicion),localDifferences:post.local.reduce((s,x,i)=>s+(x!==c.local[i]),0),best:post.best,nativeBest:c.metadata.best_grid});
  }
 }
 const m=manifest.models[0],program=await json(m.program.file),weights=await floats(m.weights.file),side=264,data=Float32Array.from({length:3*side*side},(_,i)=>((i*47+i%197)%256)/255),input={dims:[1,3,side,side],data};let t=performance.now();const cpu=runCfaProgram(module,program,weights,input);const cpuMs=performance.now()-t;t=performance.now();const accelerated=await runCfaProgramHybrid(module,program,weights,input,gpu);const gpuMs=performance.now()-t,comparison=error(accelerated.data,cpu.data),timing={side,cpuMs,hybridMs:gpuMs,speedup:cpuMs/gpuMs,logError:comparison,developmentOnly:true};
 return {records,timing,passed:records.every(r=>r.probability.max<=1e-3&&r.grid.max<=1e-3&&r.suspicion.max<=1e-3&&r.localDifferences===0&&r.best===r.nativeBest),scope:'Public probabilities [0,1], exact grid decisions; no startup calibration.'};
 }finally{gpu.dispose();}
});
