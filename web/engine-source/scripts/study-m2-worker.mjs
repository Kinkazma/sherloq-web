import {study} from './m2-browser-study.mjs';
await study('m2-worker',async()=>{
 const {createM2WorkerClient}=await import('/src/m2-worker-client.js');
 const base='/.build/cfa-m2/',manifest=await(await fetch(base+'program-manifest.json')).json(),ref=await(await fetch(base+'reference.json')).json(),assets=Object.fromEntries(manifest.models.map(m=>[m.variant,{...m.weights,url:new URL(base+m.weights.file,location.href).href,checkpointSha256:m.checkpointSha256,program:{...m.program,url:new URL(base+m.program.file,location.href).href},wasmMaximumBytes:2*1024**3}])),runtimes={wasm:{executor:'cfa',factoryUrl:new URL(base+'operators.mjs',location.href).href,wasmUrl:new URL(base+'operators.wasm',location.href).href}};
 const c=ref.models[0].cases.find(x=>x.label==='noise'),input=new Float32Array(await(await fetch(base+c.inputFile)).arrayBuffer()),height=c.inputShape[2],width=c.inputShape[3],data=new Uint8Array(width*height*3);for(let i=0;i<width*height;i++)for(let ch=0;ch<3;ch++)data[i*3+ch]=Math.round(input[ch*width*height+i]*255);
 const image={width,height,data},client=await createM2WorkerClient({memoryBudgetBytes:512*1024**2,resourceHints:{hardwareConcurrency:4},methods:{cfa:{assets,runtimes}}}),events=[];
 try{
  const first=await client.analyze('cfa',image,{}, {backend:'cpu',onProgress:e=>events.push(e.phase)}),metadata=await client.metadata(first),local=await client.readArray(first.id,'local_grid',0,first.fields.local_grid.length),decisions=local.every((x,i)=>x===c.local[i]);
  const isolated=(await client.readArray(first.id,'local_grid',0,1))[0];local[0]=255;const isolatedCopy=(await client.readArray(first.id,'local_grid',0,1))[0]===isolated;
  const rendered=await client.render(first.id,2),raster=await client.readExport(rendered.id,0,rendered.bytes);await client.releaseExport(rendered.id);
  const chunks=[];const exported=await client.exportTo(first.id,new WritableStream({write:value=>chunks.push(value)}));const zipBytes=chunks.reduce((n,c)=>n+c.length,0),signature=chunks[0].slice(0,4).join(',');
  const busyController=new AbortController();const pending=client.analyze('cfa',image,{block:16},{backend:'cpu',signal:busyController.signal,onProgress:e=>{if(e.phase==='inference')busyController.abort();}});let busy=false,cancelled=false;try{await client.analyze('cfa',image);}catch(e){busy=e.code==='BUSY';}try{await pending;}catch(e){cancelled=e.code==='CANCELLED';}
  const exportAbort=new AbortController();let exportCancelled=false;
  try{const late=await client.beginExport(first.id,{signal:exportAbort.signal,onProgress:()=>exportAbort.abort()});await client.releaseExport(late.id);}catch(e){exportCancelled=e.code==='CANCELLED';}
  const pinned=await client.beginExport(first.id);await client.release(first.id);await client.clearCache();
  const pinnedMemory=await client.memory(),pinnedSignature=(await client.readExport(pinned.id,0,4)).join(',');await client.releaseExport(pinned.id);const memory=await client.memory();
  return {decisions,isolatedCopy,busy,cancelled,exportCancelled,pinnedMemory,pinnedSignature,metadataMethod:metadata.metadata.method,rasterBytes:raster.length,zipBytes,signature,events,memory,passed:exportCancelled&&pinnedSignature===signature&&pinnedMemory.activeReservationBytes>0&&decisions&&isolatedCopy&&busy&&cancelled&&raster.length===width*height*3&&zipBytes===exported.bytes&&signature==='80,75,3,4'&&memory.retainedBytes===0&&memory.activeReservationBytes===0&&memory.cacheBytes===0};
 }finally{client.dispose();}
});
