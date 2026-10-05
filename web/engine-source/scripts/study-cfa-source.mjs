import {study} from './m2-browser-study.mjs';
await study('cfa-source-96mp',async provider=>{
 const started=performance.now(),{createM2WorkerClient}=await import('/src/m2-worker-client.js');
 const base='/.build/cfa-m2/',manifest=await(await fetch(base+'program-manifest.json')).json(),assets=Object.fromEntries(manifest.models.map(m=>[m.variant,{...m.weights,url:new URL(base+m.weights.file,location.href).href,checkpointSha256:m.checkpointSha256,program:{...m.program,url:new URL(base+m.program.file,location.href).href}}])),runtimes={wasm:{executor:'cfa',factoryUrl:new URL(base+'operators.mjs',location.href).href,wasmUrl:new URL(base+'operators.wasm',location.href).href}};
 const blob=await(await fetch('/.build/m2-96mp.jpg')).blob(),client=await createM2WorkerClient({memoryBudgetBytes:3*1024**3,resourceHints:{hardwareConcurrency:4},methods:{cfa:{assets,runtimes}}});
 const events=[];let lastPhase='',lastAt=0;
 try{
  const result=await client.analyzeBlob('cfa',blob,{}, {backend:provider==='wasm'?'cpu':'webgpu',onProgress:e=>{if((e.phase!==lastPhase&&!['inference','cfa-tiles','model-load'].includes(e.phase))||performance.now()-lastAt>10000){lastPhase=e.phase;lastAt=performance.now();events.push({...e,elapsedMs:lastAt-started});console.error('CFA96 '+JSON.stringify(events.at(-1)));}}}),analyzeMs=performance.now()-started,metadata=await client.metadata(result);
  const local=await client.readArray(result.id,'local_grid',0,result.fields.local_grid.length),counts=[0,0,0,0];for(const v of local)counts[v]++;
  let finite=true,min=Infinity,max=-Infinity;
  for(let offset=0;offset<result.fields.probabilities.length;offset+=262144){const p=await client.readArray(result.id,'probabilities',offset,Math.min(262144,result.fields.probabilities.length-offset));for(const v of p){finite&&=Number.isFinite(v);min=Math.min(min,v);max=Math.max(max,v);}}
  const views=[];
  for(const rect of [{x:0,y:0,width:257,height:193},{x:5969,y:3977,width:257,height:193},{x:11743,y:7807,width:257,height:193}])for(const mode of [0,1,2]){
   const output=await client.renderWindow(result.id,mode,rect),data=await client.readExport(output.id,0,output.bytes),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');views.push({rect,mode,origin:output.origin,bytes:data.length,sha256});await client.releaseExport(output.id);
  }
  let exportBytes=0,first,last;
  const exported=await client.exportTo(result.id,new WritableStream({write:chunk=>{first??=Array.from(chunk.subarray(0,4));last=Array.from(chunk.subarray(-22,-18));exportBytes+=chunk.length;}}));
  await client.release(result.id);await client.clearCache();const memory=await client.memory();
  return {source:{file:'jpeg-12000x8000.jpg',recipe:'numpy default_rng seed130014 RGB noise JPEG Q90',width:result.width,height:result.height,encodedBytes:blob.size,...metadata.source},analyzeMs,totalMs:performance.now()-started,provider:metadata.provenance.provider,originalSha256:metadata.provenance.originalSourceSha256,gridShape:metadata.gridShape,counts,finite,probabilityRange:[min,max],actualTiles:metadata.metadata.actual_tiles.length,views,export:{bytes:exportBytes,descriptorBytes:exported.bytes,first,last},events,memory,coverage:'All three CFA weights use the same source/tile/postprocess/render/export adapter. Numerical decisions independently qualified on 27 native cases and 9 tiled cases. This run qualifies full original workload, not a native 96MP numerical oracle.',passed:result.width===12000&&result.height===8000&&local.length===374*249&&counts.reduce((a,b)=>a+b,0)===local.length&&finite&&min<max&&metadata.provenance.originalSourceSha256==='f0b7febc57f625bf078dfeb746f5775f4c6efa7379e0f1c469a9330eb094f254'&&exportBytes===exported.bytes&&first.join(',')==='80,75,3,4'&&last.join(',')==='80,75,5,6'&&views.every(v=>v.origin[0]===v.rect.x&&v.origin[1]===v.rect.y)&&memory.retainedBytes===memory.residentCodecBytes&&memory.activeReservationBytes===0&&memory.cacheBytes===0};
 }finally{client.dispose();}
});
