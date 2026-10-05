// Development recipe: useful correlation jobs, pressure, cancellation and exact
// worker-count independence. Never invoked as a product calibration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname;if(name==='/')return res.end('<!doctype html><title>Correlation lifecycle</title>');if(name==='/favicon.ico'){res.statusCode=204;return res.end();}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Path');res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async()=>{
    const {Budget}=await import('/src/cache.js'),{createCmsegCorrelation}=await import('/experiments/segmentation/cmseg-correlation.js');
    const base='/.build/segmentation-models/cmseg-generalization/',reference=await(await fetch(base+'split-reference.json')).json(),row=reference.records.find(r=>r.name==='blobs-copy'),spec=row.features[2];
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const bytes=await(await fetch(base+spec.file)).arrayBuffer();if(await hash(bytes)!==spec.sha256)throw Error('Source identity');
    const input=new Float32Array(bytes),inputHash=await hash(input),records=[];
    const job={input,c:32,h:64,w:64,k:32,alpha:reference.correlation[1].alpha},moduleUrl=new URL('/vendor/segmentation/correlation.js',location.href).href;
    for(const [name,limit,maxWorkers]of [['single',3*1024**3,1],['parallel',3*1024**3,10],['pressure',80*1024**2,10]]){
      const budget=new Budget(limit),pool=createCmsegCorrelation({budget,moduleUrl,maxWorkers});let result;
      try{const start=performance.now();result=await pool.run(job);records.push({name,milliseconds:performance.now()-start,workers:result.workers,outputSha256:await hash(result.data),heapBytes:result.observedHeapBytes});}finally{result?.release();pool.dispose();}
      records.at(-1).memory=budget.snapshot();
    }
    const budget=new Budget(1024**3),pool=createCmsegCorrelation({budget,moduleUrl,maxWorkers:10}),controller=new AbortController();let cancelled=false,recovered=false;
    try{await pool.run(job,{signal:controller.signal,onProgress:e=>{if(e.phase==='cmseg-correlation-statistics')controller.abort();}});}catch(error){cancelled=error.code==='CANCELLED'&&budget.total()===0;}
    const retry=await pool.run(job);try{recovered=await hash(retry.data)===records[0].outputSha256;}finally{retry.release();pool.dispose();}
    const small=new Budget(32*1024**2),refusedPool=createCmsegCorrelation({budget:small,moduleUrl,maxWorkers:10});let refused=false;try{await refusedPool.run(job);}catch(error){refused=error.code==='MEMORY_LIMIT'&&small.total()===0;}finally{refusedPool.dispose();}
    const originalExact=await hash(input)===inputHash,passed=records.every(r=>r.outputSha256===records[0].outputSha256&&r.memory.activeReservationBytes===0)&&records[1].workers===10&&records[2].workers===1&&cancelled&&recovered&&refused&&originalExact&&budget.total()===0;
    return{schema:1,status:passed?'passed':'rejected',scope:'Same full-global64x64 native feature job with1/10 workers and80MiB pressure admission; source immutable, cancellation during statistics, retry and insufficient-memory refusal. One observation per condition with setup/transfers included, no universal speed claim. No startup calibration.',records,cancelled,recovered,refused,originalExact,finalMemory:budget.snapshot()};
  });
  report.browser=browser.version();report.sources={};for(const name of ['experiments/segmentation/cmseg-correlation.js','experiments/segmentation/cmseg-correlation-worker.js','vendor/segmentation/CMSEG-PINNED.json'])report.sources[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  await writeFile(path.join(root,'docs/cmseg-correlation-worker-chrome-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status==='rejected')process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
