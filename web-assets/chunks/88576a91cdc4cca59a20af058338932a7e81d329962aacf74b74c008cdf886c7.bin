// Development-only qualification of the changed attention allocation path.
import {Budget} from '../src/cache.js';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {createTemporarySession} from '../src/opfs-storage.js';
import {truforQueryPlan} from '../src/trufor-query-plan.js';
self.onmessage=async({data:{allCandidates=false}={}})=>{
 const budget=new Budget(3*1024**3),records=[];let session,pool,input,target,release;
 try{
  const base='/.build/trufor-split-value/',manifest=await(await fetch(base+(allCandidates?'all-candidates-manifest.json':'manifest.json'))).json(),runtime=await(await fetch('/.build/m2-neural-runtime/manifest.json')).json(),assets=Object.fromEntries(Object.entries(manifest.assets).map(([k,a])=>[k,{...a,url:new URL(base+a.file,location.href).href}])),runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/.build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
  pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets,runtimes});session=await createTemporarySession();
  for(let stage=0;stage<4;stage++)for(const stream of manifest.stages[stage].streams){
   const c=manifest.stages[stage].channels,h=Math.ceil(8000/(4*2**stage)),w=Math.ceil(12000/(4*2**stage)),block=stream.blocks[0],keys=Math.floor(h/block.sr)*Math.floor(w/block.sr),heads=block.heads,d=c/heads;
   if(!block.querySplitValue)continue;
   const plans={direct:truforQueryPlan({...block,querySplitValue:undefined},keys,c,256*1024**2,{backend:'webgpu',gpuAvailable:true}),split:truforQueryPlan(block,keys,c,256*1024**2,{backend:'webgpu',gpuAvailable:true})},n=plans.direct.queries*8,start=h*w-n;
   input=await createNeuralTensor(c,h,w,{budget,storage:'temporary',temporarySession:session});target=await createNeuralTensor(c,h,w,{budget,storage:'temporary',temporarySession:session});
   release=budget.reserve(keys*c*8+n*c*16);
   const key={data:Float32Array.from({length:keys*c},(_,i)=>Math.sin(i*.13)*3),dims:[1,heads,d,keys]},value={data:Float32Array.from({length:keys*c},(_,i)=>Math.cos(i*.17)),dims:[1,heads,keys,d]},source=Float32Array.from({length:n*c},(_,i)=>Math.sin(i*.019)*3);await input.writeTokens(start,n,source);
   const runs={},outputs={};
   for(const [mode,plan]of Object.entries(plans)){
    pool.clear();const times=[];let reusedInputBytes=0;const begun=performance.now();
    for(let at=0;at<n;at+=plan.queries){const count=Math.min(plan.queries,n-at),part=await input.readTokens(start+at,count);let result;
     try{result=await pool.run(plan.name,{x:{data:part.data,dims:part.dims},key,value},{backend:'webgpu',workspaceBytes:16*1024**2+plan.workspaceBytes(count),outputBytes:part.data.byteLength,reusableInputs:{key:block.query+'/key',value:block.query+'/value'},gpuWasmWorkspaceBytes:32*1024**2+part.data.byteLength*20});times.push({queries:count,ms:result.metrics.milliseconds});reusedInputBytes+=result.metrics.reusedInputBytes;await target.writeTokens(start+at,count,result.result.result.data);}finally{result?.release();part.release();}
    }
    runs[mode]={queriesPerCall:plan.queries,totalMs:performance.now()-begun,coldMs:times[0].ms,warmMs:times.slice(1).filter(x=>x.queries===plan.queries).reduce((s,x)=>s+x.ms,0),warmQueries:times.slice(1).filter(x=>x.queries===plan.queries).reduce((s,x)=>s+x.queries,0),reusedInputBytes,times};
    const part=await target.readTokens(start,n);outputs[mode]=part.data;part.release();
   }
   let maxError=0,sum=0,finite=true;for(let i=0;i<outputs.direct.length;i++){const e=Math.abs(outputs.direct[i]-outputs.split[i]);maxError=Math.max(maxError,e);sum+=e;finite&&=Number.isFinite(outputs.split[i]);}
   records.push({stage:stage+1,graph:block.query,dimensions:[1,c,h,w],keys,heads,queryOffset:start,queries:n,maxError,meanError:sum/outputs.direct.length,finite,runs});self.postMessage({progress:{stage:stage+1,graph:block.query,maxError,runs:Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,{warmUsPerQuery:r.warmMs/r.warmQueries*1000,totalMs:r.totalMs}]))}});
   pool.clear();release();release=null;await input.dispose();input=null;await target.dispose();target=null;
  }
  const storage=session.snapshot();await session.dispose();session=null;pool.dispose();pool=null;
  const root=await navigator.storage.getDirectory(),remaining=[];try{const dir=await root.getDirectoryHandle('sherloq-temporary-v1');for await(const k of dir.keys())remaining.push(k);}catch(e){if(e.name!=='NotFoundError')throw e;}
  self.postMessage({checkpointSha256:manifest.checkpointSha256,assets:Object.fromEntries(records.flatMap(r=>[r.graph,r.graph+'-split-value']).map(name=>[name,{bytes:assets[name].bytes,sha256:assets[name].sha256}])),records,storage,remainingTemporary:remaining,memory:budget.snapshot(),passed:records.length===(allCandidates?8:6)&&records.every(r=>r.finite&&r.maxError<1e-4&&r.runs.split.reusedInputBytes>0)&&budget.total()===0&&remaining.length===0,allCandidates,scope:'Changed learned query path only: both branches at selected actual96MP stage shapes, all93750keys, OPFS source/target at final offsets, original vs split graph. Synthetic finite feature values; no new end-to-end96MP source/time claim. Full source/output/export proof reuses prior96MP qualification; small native full chain separately qualifies new32learned queries.'});
 }catch(e){self.postMessage({error:String(e),stack:e.stack});}finally{release?.();pool?.dispose();await input?.dispose();await target?.dispose();await session?.dispose();}
};
