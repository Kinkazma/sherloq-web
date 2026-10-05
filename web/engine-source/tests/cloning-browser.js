import {createWorkerEngine} from '../src/worker-client.js';
import {cloningFixture,compareCloning,ensure} from './cloning-reference.js';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const fetchBytes=async path=>{const r=await fetch(path);ensure(r.ok,'Fixture '+path);return new Uint8Array(await r.arrayBuffer());};
export async function cloningBrowserTest(large=false,cpuKernel='single',algorithm='ORB'){
  ensure(algorithm==='ORB'||algorithm==='AKAZE','Explicit detector');
  const study=algorithm==='ORB'?'cloning-study':'akaze-pipeline-study',fixture=algorithm==='ORB'?'cloning':'akaze';
  const runtimeFiles={};for(const file of ['src/index.js','src/pixel-operations.js','src/cloning.js','src/cloning-post.js','src/cloning-math.js','src/cloning-group-pool.js','src/cloning-group-worker.js','vendor/cloning/cloning.js','vendor/cloning/cloning.wasm'])runtimeFiles[file]=await hash(await fetchBytes('/'+file));
  let reference,payload,cases,nativeSourceSha256,payloadSha256;
  if(large){reference=JSON.parse(new TextDecoder().decode(await fetchBytes('/.build/'+study+'/reference.json')));cases=[...JSON.parse(new TextDecoder().decode(await fetchBytes('/.build/'+study+'/api-reference.json'))),...JSON.parse(new TextDecoder().decode(await fetchBytes('/.build/'+study+'/original-reference.json')))].filter(r=>r.image.startsWith('large-'));nativeSourceSha256=reference.sourceSha256;}
  else{
    reference=JSON.parse(new TextDecoder().decode(await fetchBytes('/fixtures/'+fixture+'/reference.json')));
    const compressed=await fetchBytes('/fixtures/'+fixture+'/reference.bin.gz');ensure(await hash(compressed)===reference.payload.compressedSha256,'Compressed reference identity');
    payload=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());payloadSha256=await hash(payload);ensure(payloadSha256===reference.payload.sha256,'Reference payload identity');cases=reference.cases;nativeSourceSha256=reference.nativeSourceSha256;
  }
  const read=async(file,Type=Uint8Array)=>{
    if(!large)return cloningFixture(reference,payload,file,Type);
    const bytes=await fetchBytes('/.build/'+study+'/'+file);return new Type(bytes.buffer,bytes.byteOffset,bytes.byteLength/Type.BYTES_PER_ELEMENT);
  };
  const engine=createWorkerEngine({memoryBudgetBytes:1024**3,cpuKernel}),task={id:algorithm.toLowerCase(),imageId:'image',operation:'tampering.copyMove.'+algorithm.toLowerCase()},records=[];
  let image,mask,source,maskSource,loadInput,lastMaskLoad,admittedHeap=0;
  try{
    for(const item of cases){
      if(item.image!==image){
        if(mask&&mask!=='all')await engine.unload('mask');if(image)await engine.unload('image');
        loadInput={id:'image',blob:new Blob([await read(item.inputFile??item.image+'.png')])};source=await engine.loadBlob(loadInput);image=item.image;mask='all';
      }
      if(item.mask!==mask){
        if(mask!=='all')await engine.unload('mask');
        if(item.mask!=='all'){maskSource={id:'mask',blob:new Blob([await read(item.image+'-'+item.mask+'-mask.png')])};lastMaskLoad=await engine.loadBlob(maskSource);}mask=item.mask;
      }
      const params={...item.params,maskImageId:item.mask==='all'?null:'mask'},progress=[],started=performance.now();
      if(item.error){
        let failure;try{await engine.run({...task,params});}catch(error){failure=error;}
        ensure(failure?.code==='MEMORY_LIMIT','Native resource refusal');ensure((await engine.capabilities()).memory.activeReservationBytes===0,'Native refusal cleanup');records.push({image,mask,params,nativeError:item.error,error:failure.code,metrics:{memory:(await engine.capabilities()).memory}});continue;
      }
      const result=await engine.run({...task,params},{onProgress:e=>progress.push(e.fraction)}),expected=new Map();
      for(const [suffix,Type]of [['-points.f64',Float64Array],['-filtered.f64',Float64Array],['-lengths.u32',Uint32Array],['-groups.u32',Uint32Array],['.rgb',Uint8Array]])expected.set(item.prefix+suffix,await read(item.prefix+suffix,Type));
      const expectedRead=file=>expected.get(file);compareCloning(result,item,expectedRead,algorithm);
      admittedHeap=Math.max(admittedHeap,result.pixels.width*result.pixels.height*(algorithm==='AKAZE'?256:192)+160*1024**2);
      ensure(result.metrics.memory.cloningHeapCapacityBytes<=admittedHeap,'Actual detector heap within admission bound');
      ensure(progress.every((v,i)=>!i||v>=progress[i-1]),'Monotonic useful progress');ensure(result.provenance.originalSha256===source.sha256,'Original source provenance');
      if(item.mask!=='all')ensure(result.provenance.references[0].originalSha256===lastMaskLoad.sha256,'Mask provenance');
      if(item.params.showPoints&&item.params.hideLines){
        let exportedBytes;
        try{exportedBytes=(await engine.exportResult(result)).bytes;}catch(error){
          ensure(large&&error.code==='MEMORY_LIMIT','Expected bounded large JSON refusal');
          ensure((await engine.capabilities()).memory.activeReservationBytes===0,'Refused export cleanup');
          exportedBytes=(await engine.exportResult(result,{maxBytes:128*1024**2})).bytes;
        }
        const exported=JSON.parse(new TextDecoder().decode(exportedBytes));ensure(exported.data.algorithm===algorithm&&exported.provenance.originalSha256===source.sha256,'JSON provenance');
      }
      records.push({image,mask,params,stats:result.data.stats,rpcAndVerificationMs:performance.now()-started,metrics:result.metrics});
      if(item.mask==='all'&&item.params.response===90&&item.params.matching===20&&item.params.distance===15&&item.params.minimum===5&&!item.params.showPoints&&!item.params.hideLines){
        result.data.points.fill(9);result.data.groupIndices.fill(9);result.pixels.data.fill(9);
        const cached=await engine.run({...task,params});ensure(cached.metrics.cache.result,'Analysis cache');compareCloning(cached,item,expectedRead,algorithm);
        const style=await engine.run({...task,params:{...params,hideLines:true}});ensure(style.metrics.cache.result,'Style cache');
        const minimum=await engine.run({...task,params:{...params,minimum:1}});ensure(minimum.metrics.cloningClusteringMs===0,'Minimum reuses geometry');
      }
    }
    if(mask!=='all')await engine.unload('mask');await engine.unload('image');const cleanup=(await engine.capabilities()).memory;
    ensure(cleanup.retainedBytes+cleanup.cacheBytes+cleanup.activeReservationBytes===0,'Unloaded images and caches');
    // Cancel during useful analysis, then reload both originals into a fresh
    // worker; never silently drop the detection mask after a hard cancellation.
    const final=cases.findLast(x=>x.mask!=='all');ensure(final,'Masked cancellation reference');
    loadInput={id:'image',blob:new Blob([await read(final.inputFile??final.image+'.png')])};maskSource={id:'mask',blob:new Blob([await read(final.image+'-'+final.mask+'-mask.png')])};
    await engine.loadBlob(loadInput);await engine.loadBlob(maskSource);
    const controller=new AbortController();let cancellation;
    const finalParams={...final.params,maskImageId:'mask'};
    try{await engine.run({...task,params:finalParams},{signal:controller.signal,onProgress:e=>{if(e.fraction>=(algorithm==='AKAZE'?.08:.2)&&e.fraction<1)controller.abort();}});}catch(error){cancellation=error;}
    ensure(cancellation?.code==='CANCELLED'&&cancellation.imagesCleared,'Hard cancellation');ensure(!(await engine.capabilities()).memory.retainedBytes,'Cancelled images cleared');
    await engine.loadBlob(loadInput);await engine.loadBlob(maskSource);
    const resumed=await engine.run({...task,params:finalParams}),expected=new Map();
    for(const [suffix,Type]of [['-points.f64',Float64Array],['-filtered.f64',Float64Array],['-lengths.u32',Uint32Array],['-groups.u32',Uint32Array],['.rgb',Uint8Array]])expected.set(final.prefix+suffix,await read(final.prefix+suffix,Type));
    compareCloning(resumed,final,file=>expected.get(file),algorithm);
    for(const [file,expected]of Object.entries(runtimeFiles))ensure(await hash(await fetchBytes('/'+file))===expected,'Runtime changed during qualification: '+file);
    return {schema:1,status:'passed',algorithm,large,cpuKernel,runtimeFiles,nativeSourceSha256,payloadSha256,cases:records.length,records,cleanup,cancellation:'Hard worker termination followed by original image and mask reload; exact result reproduced',limitations:`Explicit ${algorithm} only; full-memory admission; no BRISK/GPU or physical mobile/Safari qualification; no WordPress integration. Functional timings include verification and are not benchmarks.`};
  }finally{await engine.dispose();}
}
