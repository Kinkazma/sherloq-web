import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local').pathname;if(url==='/')return res.end('<!doctype html><title>ST first head divergence</title>');if(url==='/favicon.ico'){res.statusCode=204;return res.end();}const p=path.resolve(root,'.'+url);if(!p.startsWith(root))throw Error('Path');res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async()=>{
  const{Budget}=await import('/src/cache.js'),{boundGpuAdapter}=await import('/experiments/segmentation/gpu-budget.js'),{createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js');
  const base='/.build/segmentation-models/mgcfdn-st/',split=await(await fetch(base+'gpu-split.json')).json(),diagnostic=await(await fetch(base+'gpu-pool-diagnostic.json')).json(),ref=await(await fetch(base+'reference.json')).json(),row=ref.records.find(r=>r.name==='paired-spots');
  const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
  const read=async s=>{const b=await(await fetch(base+s.file)).arrayBuffer();if(b.byteLength!==s.bytes||await sha(b)!==s.sha256)throw Error('Identity');return b;};
  const budget=new Budget(3*1024**3),prepare=createSegmentationPrepare({budget}),release=budget.reserve(2*512*1024**2+3*(split.stages[0].bytes+2*diagnostic.bytes)+256*1024**2),gpu=boundGpuAdapter(await navigator.gpu.requestAdapter({powerPreference:'high-performance'}),new Budget(512*1024**2)),records=[];
  // GPU512MiB is reserved globally and enforced locally for every buffer.
  let encoder,cpu,gpuSession,prepared,input,intermediate,cpuOutputs,gpuOutputs,failure;
  try{
   const ort=await import('/.build/segmentation-ort-gpu-bounded-cache/ort.all.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('/.build/segmentation-ort-gpu/factory.mjs',location.href).href,wasm:new URL('/.build/ort130/package/dist/ort-wasm-simd-threaded.jsep.wasm',location.href).href};ort.env.webgpu.adapter=gpu.adapter;
   const opts={graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false};encoder=await ort.InferenceSession.create(await read(split.stages[0]),{...opts,executionProviders:['wasm']});cpu=await ort.InferenceSession.create(await read(diagnostic),{...opts,executionProviders:['wasm']});gpuSession=await ort.InferenceSession.create(await read(diagnostic),{...opts,executionProviders:['webgpu','wasm']});
   prepared=await prepare.run({data:new Uint8Array(await read(row.rgb)),width:row.rgb.shape[1],height:row.rgb.shape[0],side:256});if(await sha(prepared.tensor)!==row.input.sha256)throw Error('Preparation');input=new ort.Tensor('float32',prepared.tensor,prepared.shape);intermediate=await encoder.run({rgb:input});cpuOutputs=await cpu.run(intermediate);await gpu.begin();gpuOutputs=await gpuSession.run(intermediate);await gpu.end();
   for(const name of diagnostic.outputs){const a=gpuOutputs[name].data,b=cpuOutputs[name].data;let maxAbs=0,sumAbs=0,finite=true,different=0,at=0;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);if(e>maxAbs){maxAbs=e;at=i;}sumAbs+=e;different+=a[i]!==b[i];finite&&=Number.isFinite(a[i]);}records.push({name,shape:cpuOutputs[name].dims,maxAbs,meanAbs:sumAbs/a.length,different,finite,largest:{index:at,cpu:b[at],gpu:a[at]}});}
  }catch(e){failure=String(e.stack??e);}
  finally{for(const outputs of [cpuOutputs,gpuOutputs,intermediate])for(const v of Object.values(outputs??{}))v.dispose();input?.dispose();prepared?.release();prepare.dispose();await gpuSession?.release();await cpu?.release();await encoder?.release();await gpu.dispose();release();}
  return{schema:1,status:failure?'failed-diagnostic':'completed-diagnostic',scope:'Same prepared paired-spots RGB and same CPU encoder tensors passed to CPU/GPU heads. Additional existing outputs identify first divergence; no substitution or native expected tensor feeds. Development diagnostic, not memory/performance qualification or runtime routing.',records,failure,memory:budget.snapshot(),gpu:gpu.snapshot()};
 });report.browser=browser.version();report.sources={};for(const f of ['scripts/study-mgcf-pool-diagnostics.mjs','scripts/export-mgcf-pool-diagnostics.py','.build/segmentation-models/mgcfdn-st/gpu-pool-diagnostic.json','.build/segmentation-ort-gpu-bounded-cache/build.json'])report.sources[f]=createHash('sha256').update(await readFile(path.join(root,f))).digest('hex');await writeFile(path.join(root,'docs/mgcf-st-pool-diagnostic-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
