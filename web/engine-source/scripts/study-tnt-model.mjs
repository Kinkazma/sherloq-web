// Real component inference or isolated useful-worker comparison. All sources are
// generated RGB and all expected arrays are read only after actual computation.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),benchmark=process.argv.includes('--benchmark');
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local').pathname;if(url==='/')return res.end('<!doctype html><title>TNT CPU qualification</title>');if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async benchmark=>{
  const {Budget}=await import('/src/cache.js'),{createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js'),{createSegmentationInference}=await import('/experiments/segmentation/inference.js'),{createTntBackbone}=await import('/experiments/segmentation/tnt-backbone.js'),{readVerifiedModelAsset}=await import('/experiments/d2prl/model.js');
  const base='/.build/segmentation-models/mgcfdn-tnt/',assets='/.build/tnt-backbone-candidate/',reference=await(await fetch(base+'reference.json')).json(),records=[];
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
  const read=async spec=>{const response=await fetch(base+spec.file);if(!response.ok)throw Error('Fixture read');const b=await response.arrayBuffer();if(b.byteLength!==spec.bytes||await hash(b)!==spec.sha256)throw Error('Fixture identity');return b;};
  for(const row of benchmark?reference.records.slice(0,1):reference.records){
   for(const maxWorkers of benchmark?[1,10]:[10]){
    const budget=new Budget(1024**3),prepare=createSegmentationPrepare({budget});let inference,backbone,prepared,output;
    try{
     prepared=await prepare.run({data:new Uint8Array(await read(row.rgb)),width:row.rgb.shape[1],height:row.rgb.shape[0],side:256});const preparationExact=await hash(prepared.tensor)===row.input.sha256;
     const start=performance.now();let setupMs=0;
     if(benchmark){const graph=await(await fetch(assets+'backbone.json')).json();backbone=await createTntBackbone({budget,graph,maxWorkers,read:(spec,hooks)=>readVerifiedModelAsset(new URL(assets+spec.file,location.href).href,spec,hooks)});setupMs=performance.now()-start;output=await backbone.run(prepared.tensor);}
     else{inference=createSegmentationInference({budget,variant:'mgcfdn-tnt',modelUrl:new URL(assets+'bundle.json',location.href).href});output=await inference.run(prepared.tensor,{onProgress:p=>{if(p.phase==='tnt-backbone')console.log(row.name+' '+p.completed+'/'+p.total);}});}
     const milliseconds=performance.now()-start,a=benchmark?output.data:output.raw,sha256=await hash(a),record={name:row.name,maxWorkers,workers:output.workers,preparationExact,sha256,milliseconds,setupMs,timings:output.timings,memoryBeforeRelease:budget.snapshot()};
     if(!benchmark){const b=new Float32Array(await read(row.probability)),mask=new Uint8Array(await read(row.gridMask));let maxAbs=0,different=0,maskChanges=0,foreground=0;for(let i=0;i<a.length;i++){maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));different+=a[i]!==b[i];maskChanges+=Number(a[i]>.5)!==mask[i];foreground+=a[i]>.5;}Object.assign(record,{probability:{maxAbs,different,finite:a.every(Number.isFinite)},maskChanges,foreground});}
     records.push(record);console.log(JSON.stringify(record));
    }finally{output?.release();prepared?.release();inference?.dispose();backbone?.dispose();prepare.dispose();}
    records.at(-1).memoryAfterRelease=budget.snapshot();if(budget.total()!==0)throw Error('TNT ownership leak');
   }
  }
  const accepted=records.every(r=>r.preparationExact&&(benchmark||r.probability.finite&&r.probability.maxAbs<=1e-4&&r.maskChanges===0))&&(!benchmark||records[0].sha256===records[1].sha256);
  return{schema:1,status:accepted?'passed':'rejected',scope:benchmark?'Same backbone, staging, float32 arithmetic, checkpoint, input and 1GiB budget; only useful-worker ceiling changes. Serial runs in one development browser, fresh helpers each time; OS caches not flushed. Preparation excluded, setup/parameter reads separate, no decoder/export/UI speed claim.':'Actual RGB preparation, lazy checkpoint backbone and unchanged ONNX consistency/decoder through production component; masks are native threshold decisions, no native activation substitution.',records};
 },benchmark);
 report.browser=browser.version();report.sources={};for(const file of ['scripts/study-tnt-model.mjs','scripts/export-tnt-backbone.py','experiments/segmentation/tnt-backbone.js','experiments/segmentation/tnt-linear.js','experiments/segmentation/tnt-linear-worker.js','experiments/segmentation/tnt-inference.js','experiments/segmentation/tnt-math.cpp','vendor/segmentation/TNT-PINNED.json'])report.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 await writeFile(path.join(root,'docs/tnt-'+(benchmark?'useful-workers':'model-corpus')+'-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
