// Development-only hybrid probe. Native feature arrays are operator inputs;
// expected correlation arrays are fetched only after the tested calculation.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),rowsPerJob=Number(process.argv.find(v=>v.startsWith('--rows-per-job='))?.slice(15)??64);
if(![32,64,128,256].includes(rowsPerJob))throw Error('Probe row count');
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local').pathname;if(url==='/')return res.end('<!doctype html><title>CMSeg global correlation hybrid probe</title>');if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async rowsPerJob=>{
    const {Budget}=await import('/src/cache.js'),{createCmsegCorrelation}=await import('/experiments/segmentation/cmseg-correlation.js'),{createCmsegCorrelationGpu}=await import('/experiments/segmentation/cmseg-correlation-gpu.js');
    const base='/.build/segmentation-models/cmseg-generalization/',reference=await(await fetch(base+'split-reference.json')).json(),row=reference.records.find(r=>r.name==='blobs-copy');
    const cpuUrl=new URL('/vendor/segmentation/correlation-fma.js',location.href).href,gpuUrl=new URL('/.build/cmseg-correlation-gpu-post-32m/post.js',location.href).href;
    const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),b=>b.toString(16).padStart(2,'0')).join(''),assert=(v,m)=>{if(!v)throw Error(m);};
    const read=async s=>{const b=await(await fetch(base+s.file)).arrayBuffer();assert(b.byteLength===s.bytes&&await hash(b)===s.sha256,'Native operator fixture identity');return b;};
    const records=[],checks={};let retryJob,retrySha;
    for(const level of [2,1,0]){
      const spec=row.features[level+1],[,c,h,w]=spec.shape,corr=reference.correlation[level],input=new Float32Array(await read(spec)),job={input,c,h,w,k:corr.topk,alpha:corr.alpha},pair=[];
      for(const backend of ['cpu','gpu']){
        const budget=new Budget(2*1024**3),pool=backend==='cpu'?createCmsegCorrelation({budget,moduleUrl:cpuUrl,maxWorkers:10}):createCmsegCorrelationGpu({budget,moduleUrl:gpuUrl,maxWorkers:10,rowsPerJob});let result;
        try{
          const begin=performance.now();result=await pool.run(job);const milliseconds=performance.now()-begin,sha256=await hash(result.data),expected=new Float32Array(await read(row.correlations[level]));
          let maxAbs=0,sumAbs=0,different=0;for(let i=0;i<expected.length;i++){const e=Math.abs(result.data[i]-expected[i]);maxAbs=Math.max(maxAbs,e);sumAbs+=e;different+=result.data[i]!==expected[i];}
          pair.push({backend,milliseconds,workers:result.workers,sha256,shape:result.shape,probability:{maxAbs,meanAbs:sumAbs/expected.length,different},gpu:result.gpu,timings:result.timings});
          if(level===1&&backend==='cpu'){retryJob=job;retrySha=sha256;}
        }finally{result?.release();pool.dispose();}
        pair.at(-1).memory=budget.snapshot();assert(budget.total()===0,'Correlation ownership leak');console.log(corr.name+' '+JSON.stringify(pair.at(-1)));
      }
      assert(pair[0].sha256===pair[1].sha256,'GPU correlation differs from qualified CPU: '+corr.name);assert(await hash(input)===spec.sha256,'Source mutated');records.push({name:corr.name,pair,exactCpu:true});
    }
    const budget=new Budget(2*1024**3),pool=createCmsegCorrelationGpu({budget,moduleUrl:gpuUrl,maxWorkers:10,rowsPerJob}),abort=new AbortController();let submitted=false;
    const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
    try{
      checks.cancelAfterSubmit=await rejected(()=>pool.run(retryJob,{signal:abort.signal,onProgress:e=>{if(e.phase==='cmseg-correlation-dot-gpu'){submitted=true;abort.abort();}}}),'CANCELLED');assert(submitted&&budget.total()===0,'Submitted GPU cancellation cleanup');
      checks.preAbort=await rejected(()=>pool.run(retryJob,{signal:abort.signal}),'CANCELLED');
      checks.geometry=await rejected(()=>pool.run({...retryJob,k:31}),'INVALID_INPUT');
      budget.limit=32*1024**2;checks.memory=await rejected(()=>pool.run(retryJob),'MEMORY_LIMIT');assert(budget.total()===0,'Refusal cleanup');budget.limit=64*1024**2;
      const r=await pool.run(retryJob);try{checks.retry=await hash(r.data)===retrySha;checks.pressureWorkers=r.workers===1;}finally{r.release();}
    }finally{pool.dispose();}
    assert(Object.values(checks).every(Boolean)&&budget.total()===0,'Hybrid lifecycle');
    return{schema:1,status:'passed',productionSelected:false,rowsPerJob,scope:'Three full-global native feature geometries24x128x128,32x64x64,96x32x32. CPU uses existing qualified FMA and10 bounded workers; hybrid uses one ordered GPU and up to10 CPU postprocess workers. Every complete comparison row is computed twice, no distant pair excluded. Native Gaussian/softmax axes/TopK retained, exact comparison to CPU and continuous errors against independent native correlations. Each timing includes setup, normalization, staging/transfers/readback and postprocessing. Shared host, single observation per condition; no production or universal gain claim.',records,checks,memory:budget.snapshot()};
  },rowsPerJob);
  report.browser=browser.version();report.sources={};for(const file of ['scripts/study-cmseg-correlation-gpu.mjs','scripts/build-cmseg-correlation-gpu-post.py','experiments/segmentation/cmseg-correlation-gpu.js','experiments/segmentation/cmseg-correlation-gpu-worker.js','experiments/segmentation/cmseg-correlation.js','experiments/segmentation/cmseg-correlation-worker.js','experiments/segmentation/cmseg-correlation.cpp','experiments/d2prl/convolution-general-gpu.js','vendor/segmentation/correlation-fma.js','vendor/segmentation/correlation-fma.wasm','.build/cmseg-correlation-gpu-post-32m/build.json'])report.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  await writeFile(path.join(root,'docs/cmseg-correlation-gpu-streaming-r'+rowsPerJob+'-32m-probe.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
