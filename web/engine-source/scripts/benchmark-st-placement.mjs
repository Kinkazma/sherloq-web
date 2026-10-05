// Actual multi-zone common API comparison; no product probes or cache bypass.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),variant='mgcfdn-st',runtimeArg=process.argv.find(a=>a.startsWith('--runtime-root='))?.slice(15),runtime=runtimeArg??root,tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)??'m1-44-candidate';
if(!/^[a-z0-9-]+$/.test(tag))throw Error('Tag');
if(!['mgcfdn','mgcfdn-st'].includes(variant))throw Error('Variant');
let requests=0,modelBytes=0;
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/')return res.end('<!doctype html><title>MGCF three useful zones</title><canvas id="preview"></canvas>');
 if(name==='/counts')return res.end(JSON.stringify({requests,bytes:modelBytes}));
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 const relative=name.slice(1),file=path.resolve(/^(src|vendor|experiments)\//.test(relative)?runtime:root,relative);if(!file.startsWith(root+path.sep))throw Error('Path');
 const bytes=await readFile(file);if(file.endsWith('.onnx')||file.endsWith('gpu-split-bundle.json')){requests++;modelBytes+=bytes.length;}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);
}catch(e){res.statusCode=404;res.end();console.error(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const conditions=[];
 for(const budgetGiB of [2,3])for(const backend of ['auto']){
  const context=await browser.newContext(),page=await context.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
  try{conditions.push(await page.evaluate(async({variant,backend,budgetGiB})=>{
   const {createWorkerEngine}=await import('/src/worker-client.js'),{SEGMENTATION_MODEL_IDENTITIES}=await import('/src/index.js');
   const base='/.build/segmentation-zones-'+variant+'/',inputsBase='/.build/mgcf-zone-benchmark/'+variant+'/',referenceBytes=await(await fetch(base+'reference.json')).arrayBuffer(),reference=JSON.parse(new TextDecoder().decode(referenceBytes)),inputs=await(await fetch(inputsBase+'inputs.json')).json();
   const assert=(ok,message)=>{if(!ok)throw Error(message);},hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');assert(await hash(referenceBytes)===inputs.referenceSha256,'Reference identity');
   const read=async spec=>{const b=await(await fetch(base+spec.file)).arrayBuffer();assert(b.byteLength===spec.bytes&&await hash(b)===spec.sha256,'Oracle identity');return b;};
   const expected={};for(const[name,spec]of Object.entries(reference.result))expected[name]=spec.dtype==='float32'?new Float32Array(await read(spec)):new Uint8Array(await read(spec));
   const expectedRaw=await Promise.all(reference.zones.map(async z=>new Float32Array(await read(z.raw))));
   const compare=(a,b)=>{assert(a.length===b.length,'Shape');let maxAbs=0,sum=0,different=0,nonzero=0;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);maxAbs=Math.max(maxAbs,e);sum+=e;different+=a[i]!==b[i];nonzero+=a[i]!==0;}return{maxAbs,meanAbs:sum/a.length,different,nonzero,finite:a.every(Number.isFinite)};};
   const engine=createWorkerEngine({memoryBudgetBytes:budgetGiB*1024**3,computeProfile:'aggressive'}),model=SEGMENTATION_MODEL_IDENTITIES[variant],tolerance=backend==='webgpu'?model.gpu.probabilityTolerance??1e-4:1e-4,records=[];
   try{
    await engine.loadSegmentationModel({variant,bytes:model.bytes,sha256:model.sha256,url:new URL('/.build/segmentation-models/'+variant+(variant==='mgcfdn-st'?'/native-mean.onnx':'/unfolded.onnx'),location.href).href,gpu:{...model.gpu,url:new URL('/.build/segmentation-models/'+variant+'/gpu-split-bundle.json',location.href).href}});
    for(const spec of inputs.records){
     const before=await(await fetch('/counts')).json(),acquire=performance.now(),bytes=new Uint8Array(await(await fetch(inputsBase+spec.file)).arrayBuffer());assert(bytes.length===spec.bytes&&await hash(bytes)===spec.sha256,'Input identity');const start=performance.now(),imageId='input-'+spec.run;
     await engine.load({id:imageId,bytes});const loaded=performance.now();
     const result=await engine.run({id:imageId,imageId,operation:'ai.clones.segmentation',backend,params:{variant},regions:reference.zones.map(({id,kind,bounds})=>({id,kind,bounds}))});const returned=performance.now();
     assert(result.metrics.execution.backend===(budgetGiB===3?'cpu':'webgpu-cpu'),'Workload-aware automatic backend');assert(result.provenance.backendSelection===(budgetGiB===3?'parallel-cpu-zones-fit-preference':'qualified-hybrid-gpu-with-budget'),'Selection reason');assert(result.data.metadata.pixelSha256===spec.pixelSha256,'Decoded pixels');assert(result.metrics.inferences===3&&result.metrics.cache.rawGrids===0,'Three actual new inferences');
     const canvas=document.getElementById('preview');canvas.width=result.data.width;canvas.height=result.data.height;const rgba=new Uint8ClampedArray(result.data.mask.length*4);for(let i=0;i<result.data.mask.length;i++){const value=result.data.mask[i]*255;rgba.set([value,value,value,255],i*4);}canvas.getContext('2d').putImageData(new ImageData(rgba,canvas.width,canvas.height),0,0);await new Promise(requestAnimationFrame);const displayed=performance.now();
     const raw=await engine.readSegmentationRaw({imageId,resultId:result.data.metadata.resultId}),rawRead=performance.now(),npz=await engine.exportResult(result,{format:'npz',maxBytes:8*1024**2}),exported=performance.now(),after=await(await fetch('/counts')).json();
     const outputs={},arrayHashes={};for(const[name,oracle]of Object.entries(expected)){outputs[name]=compare(result.data[name],oracle);arrayHashes[name]=await hash(result.data[name]);}
     const record={run:spec.run,kind:spec.run?'warm':'cold',source:spec,milliseconds:{sourceAcquisition:start-acquire,load:loaded-start,analysis:returned-loaded,presentation:displayed-returned,rawRead:rawRead-displayed,npz:exported-rawRead,loadThroughExport:exported-start},inferences:result.metrics.inferences,cacheHits:result.metrics.cache.rawGrids,execution:result.metrics.execution,selection:result.provenance.backendSelection,timings:result.metrics.timings,modelRequests:after.requests-before.requests,modelBytes:after.bytes-before.bytes,outputs,arrayHashes,rawErrors:raw.data.rawGrids.map((g,i)=>compare(g.raw,expectedRaw[i])),rawSha256:await Promise.all(raw.data.rawGrids.map(g=>hash(g.raw))),npzBytes:npz.bytes.length,memory:result.metrics.memory};records.push(record);console.log(JSON.stringify({variant,backend,budgetGiB,run:spec.run,analysisMs:record.milliseconds.analysis,lanes:record.execution.independentZones,modelRequests:record.modelRequests}));
    }
    for(const spec of inputs.records)await engine.unload('input-'+spec.run);await engine.unloadSegmentationModel();const final=await engine.capabilities();
    const accepted=records.every(r=>r.inferences===3&&!r.cacheHits&&r.rawErrors.every(v=>v.finite&&v.maxAbs<=tolerance)&&Object.entries(r.outputs).every(([name,v])=>v.finite&&(name==='map'||name==='target'||name==='source'?v.maxAbs<=tolerance:v.different===0)))&&final.memory.activeReservationBytes+final.memory.retainedBytes+final.memory.cacheBytes===0;
    return{backend,budgetGiB,status:accepted?'passed':'rejected',version:final.version,continuousTolerance:tolerance,hardwareConcurrency:navigator.hardwareConcurrency,records,memory:final.memory};
   }finally{await engine.dispose();}
  },{variant,backend,budgetGiB}));}finally{await context.close();}
 }
 const manifest=await readFile(path.join(runtime,'runtime-manifest.json')),report={schema:1,status:conditions.every(c=>c.status==='passed')?'passed':'rejected',variant,browser:browser.version(),version:conditions[0].version,extractedRuntime:!!runtimeArg,...(runtimeArg?{runtimeManifestSha256:createHash('sha256').update(manifest).digest('hex')}:{}),scope:'Actual common-worker automatic ST selection with both mirrors configured: three CPU zones at3GiB and hybrid at2GiB, cold plus two genuinely recomputed warm tasks. Counterpart explicit .42 CPU/GPU costs are separate retained evidence. One cold then two useful warm tasks per condition; synthetic pixels differ only outside all native crops to force real inference. Native oracles reused, all outputs and raw probabilities checked. Source load, projection, headless Canvas and NPZ costs included/separate. Fresh contexts, shared host/driver caches; neither96MP nor WordPress qualification, no user calibration.',conditions,sources:{}};
 for(const file of ['scripts/benchmark-st-placement.mjs','scripts/generate-mgcf-zone-warm.py','src/segmentation-adapter.js','experiments/segmentation/analysis.js','experiments/segmentation/zone-scheduler.js','experiments/segmentation/inference.js','experiments/segmentation/models.js','experiments/segmentation/backend.js'])report.sources[file]=createHash('sha256').update(await readFile(path.join(file.startsWith('scripts/')?root:runtime,file))).digest('hex');
 await writeFile(path.join(root,'docs/mgcf-st-auto-placement-'+tag+'-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
