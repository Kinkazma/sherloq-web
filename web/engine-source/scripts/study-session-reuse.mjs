import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const variant=arg('variant')??'mgcfdn-vig',label=arg('label')??'candidate',runtime=arg('runtime-root'),pressure=process.argv.includes('--pressure'),budgetMiB=Number(arg('budget-mib')??2048);
if(!['mgcfdn-tnt','mgcfdn-vig','cmseg-generalization'].includes(variant)||!/^[a-z0-9-]+$/.test(label))throw Error('Study arguments');
if(![1024,2048,3072].includes(budgetMiB))throw Error('Study budget');
let parameterRequests=0,parameterBytes=0,modelRequests=0,modelBytes=0;
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local').pathname;
  if(url==='/')return res.end('<!doctype html><title>Session reuse on actual inference</title>');
  if(url==='/counts'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({requests:parameterRequests,bytes:parameterBytes,modelRequests,modelBytes}));}
  if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');const relative=path.relative(root,file);
  const asset=runtime&&/^(src|vendor|experiments)\//.test(relative)?path.resolve(runtime,relative):file,bytes=await readFile(asset);
  if(url.includes('/parameters/')&&url.endsWith('.bin')){parameterRequests++;parameterBytes+=bytes.length;}
  if(url.endsWith('.onnx')){modelRequests++;modelBytes+=bytes.length;}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async({variant,pressure,budgetMiB})=>{
    const {Budget}=await import('/src/cache.js'),{createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js'),{createSegmentationInference}=await import('/experiments/segmentation/inference.js'),{SEGMENTATION_MODELS}=await import('/experiments/segmentation/models.js');
    const model=SEGMENTATION_MODELS[variant],cmseg=model.family==='cmseg',base='/.build/segmentation-models/'+variant+'/';
    const reference=await(await fetch(base+(cmseg?'split-reference.json':'reference.json'))).json(),row=reference.records.find(r=>r.name===(cmseg?'blobs-copy':'paired-spots'));
    const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const read=async s=>{const r=await fetch(base+s.file);if(!r.ok)throw Error('Fixture read');const b=await r.arrayBuffer();if(b.byteLength!==s.bytes||await hash(b)!==s.sha256)throw Error('Fixture identity');return b;};
    const budget=new Budget(budgetMiB*1024**2),prepare=createSegmentationPrepare({budget}),records=[];let prepared,inference,afterPressure;
    try{
      prepared=await prepare.run({data:new Uint8Array(await read(row.rgb)),width:row.rgb.shape[1],height:row.rgb.shape[0],side:model.side});
      if(await hash(prepared.tensor)!==row.input.sha256)throw Error('Preparation differs');
      inference=createSegmentationInference({budget,variant,backend:'webgpu',modelUrl:new URL('/.build/'+(cmseg?'cmseg':model.family)+'-backbone-candidate/bundle.json',location.href).href});
      for(let run=0;run<(pressure?4:3);run++){
        if(run===3){budget.limit=6*1024**2;budget.room(0);afterPressure=budget.snapshot();budget.limit=budgetMiB*1024**2;}
        const before=await(await fetch('/counts')).json(),began=performance.now();let output;
        try{
          output=await inference.run(prepared.tensor);const milliseconds=performance.now()-began,after=await(await fetch('/counts')).json();
          const expected=new Float32Array(await read(row.probability)),mask=new Uint8Array(await read(cmseg?row.mask:row.gridMask));
          let maxAbs=0,sumAbs=0,maskChanges=0,foreground=0;
          for(let i=0;i<output.raw.length;i++){const e=Math.abs(output.raw[i]-expected[i]);maxAbs=Math.max(maxAbs,e);sumAbs+=e;maskChanges+=Number(output.raw[i]>.5)!==mask[i];foreground+=output.raw[i]>.5;}
          const record={run,kind:run===0?'cold':run===3?'after-pressure':'warm',milliseconds,sha256:await hash(output.raw),parameterRequests:after.requests-before.requests,parameterBytes:after.bytes-before.bytes,parameterCache:output.parameterCache,sessionCache:output.sessionCache,modelRequests:after.modelRequests-before.modelRequests,modelBytes:after.modelBytes-before.modelBytes,timings:output.timings,workers:output.workers,probability:{maxAbs,meanAbs:sumAbs/output.raw.length,finite:output.raw.every(Number.isFinite)},maskChanges,foreground,memory:budget.snapshot()};
          records.push(record);console.log(variant+' '+JSON.stringify(record));
        }finally{output?.release();}
      }
    }finally{inference?.dispose();prepared?.release();prepare.dispose();}
    if(budget.total()!==0)throw Error('Inference/cache ownership leak');
    const accepted=records.length===(pressure?4:3)&&records.every(r=>r.sha256===records[0].sha256&&r.probability.finite&&r.probability.maxAbs<=1e-4&&r.maskChanges===0);
    return{schema:1,status:accepted?'passed':'rejected',variant,pressure,budgetMiB,scope:'Repeated actual GPU inference through the production component, never an analysis/raw-grid cache. Same pinned positive RGB, preparation, model and declared budget. Parameter retention is present in both conditions; only idle model-session reuse changes versus immutable M1.36. Fresh browser per condition, OS/driver caches not flushed. HTTP parameter and ONNX model requests/bytes counted by the local fixture server. Optional final run follows an actual6MiB idle-budget pressure and re-admission.',records,afterPressure,memory:budget.snapshot()};
  },{variant,pressure,budgetMiB});
  report.browser=browser.version();report.label=label;report.extractedRuntime=!!runtime;report.sources={};
  for(const file of ['experiments/segmentation/session-cache.js','experiments/segmentation/parameter-cache.js','experiments/segmentation/'+(variant==='cmseg-generalization'?'cmseg':variant.slice(7))+'-inference.js','experiments/segmentation/cmseg-correlation.js','experiments/segmentation/inference.js','experiments/segmentation/models.js']){
    try{report.sources[file]=createHash('sha256').update(await readFile(path.join(runtime??root,file))).digest('hex');}catch(e){if(!(runtime&&file.endsWith('session-cache.js')&&e.code==='ENOENT'))throw e;}
  }
  report.recipeSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  if(runtime)report.runtimeManifestSha256=createHash('sha256').update(await readFile(path.join(runtime,'runtime-manifest.json'))).digest('hex');
  await writeFile(path.join(root,'docs/session-reuse-'+variant+'-'+label+'-proof.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.status);if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
