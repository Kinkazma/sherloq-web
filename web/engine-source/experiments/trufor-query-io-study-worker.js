// Development-only timing decomposition of the REAL global query graph.
import {Budget} from '../src/cache.js';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {createTemporarySession} from '../src/opfs-storage.js';
self.onmessage=async()=>{let session,input,target,pool,lease;const budget=new Budget(3*1024**3);try{
 const manifest=await(await fetch('/.build/trufor-segments/manifest.json')).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),name='s1-rgb-b0-query',a=manifest.assets[name],runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
 pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{[name]:{...a,url:new URL('/.build/trufor-segments/'+a.file,location.href).href}},runtimes});session=await createTemporarySession();
 input=await createNeuralTensor(64,2000,3000,{budget,storage:'temporary',temporarySession:session});target=await createNeuralTensor(64,2000,3000,{budget,storage:'temporary',temporarySession:session});
 const keys=93750,c=64,step=156,n=step*64,startAt=6000000-n;lease=budget.reserve(keys*c*8+n*c*4*4);
 const key={data:Float32Array.from({length:keys*c},(_,i)=>Math.sin(i*.13)*.1),dims:[1,1,c,keys]},value={data:Float32Array.from({length:keys*c},(_,i)=>Math.cos(i*.17)*.1),dims:[1,1,keys,c]},source=Float32Array.from({length:n*c},(_,i)=>Math.sin(i*.019));await input.writeTokens(startAt,n,source);
 const run=part=>pool.run(name,{x:{data:part,dims:[1,c,1,step]},key,value},{backend:'webgpu',workspaceBytes:16*1024**2+keys*c*8+step*keys*16+part.byteLength*16,outputBytes:part.byteLength,reusableInputs:{key:'fixed-key',value:'fixed-value'},gpuWasmWorkspaceBytes:32*1024**2+part.byteLength*20});
 const records=[],outputs=[];
 for(const mode of ['direct','buffered']){let readMs=0,writeMs=0,inferenceMs=0,coldMs=0,staged,out;const started=performance.now();
  if(mode==='buffered'){let t=performance.now();staged=await input.readTokens(startAt,n);readMs+=performance.now()-t;out=new Float32Array(n*c);}
  try{for(let offset=0;offset<n;offset+=step){let part,t=performance.now(),owned;
   if(staged){part=new Float32Array(c*step);for(let k=0;k<c;k++)part.set(staged.data.subarray(k*n+offset,k*n+offset+step),k*step);}else{owned=await input.readTokens(startAt+offset,step);part=owned.data;}readMs+=performance.now()-t;
   const r=await run(part);inferenceMs+=r.metrics.milliseconds;if(offset===0&&mode==='direct')coldMs=r.metrics.milliseconds;
   try{t=performance.now();if(out){for(let k=0;k<c;k++)out.set(r.result.result.data.subarray(k*step,(k+1)*step),k*n+offset);}else await target.writeTokens(startAt+offset,step,r.result.result.data);writeMs+=performance.now()-t;}finally{r.release();owned?.release();}
  }if(out){const t=performance.now();await target.writeTokens(startAt,n,out);writeMs+=performance.now()-t;}}
  finally{staged?.release();}
  records.push({mode,readMs,writeMs,inferenceMs,coldMs,totalMs:performance.now()-started});const output=await target.readTokens(startAt,n);outputs.push(output.data);output.release();
 }
 let maxError=0;for(let i=0;i<outputs[0].length;i++)maxError=Math.max(maxError,Math.abs(outputs[0][i]-outputs[1][i]));const storage=session.snapshot();lease();lease=null;pool.dispose();pool=null;await input.dispose();input=null;await target.dispose();target=null;await session.dispose();session=null;
 self.postMessage({records,keys,queries:n,bankDimensions:[1,64,2000,3000],queryOffset:startAt,maxError,storage,memory:budget.snapshot(),passed:maxError===0&&budget.total()===0,scope:'Real global learned query graph and OPFS banks with 96MP stage geometry; only last9984queries timed, not a full96MP qualification. Development only.'});
}catch(e){self.postMessage({error:String(e),stack:e.stack});}finally{lease?.();pool?.dispose();await input?.dispose();await target?.dispose();await session?.dispose();}};
