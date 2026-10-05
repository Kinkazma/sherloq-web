// Production CMSeg inference, generated RGB and final native decisions. Expected
// arrays are fetched only after computation and never supplied to the engine.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const compareBackends=process.argv.includes('--compare-backends');
const tag=process.argv.find(v=>v.startsWith('--tag='))?.slice(6)??'';if(tag&&!/^[a-z0-9-]+$/.test(tag))throw Error('Proof tag');
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local').pathname;
  if(url==='/')return res.end('<!doctype html><title>CMSeg GPU qualification</title>');
  if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
  res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='log')console.log(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async({compareBackends})=>{
    const {Budget}=await import('/src/cache.js');
    const {createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js');
    const {createSegmentationInference}=await import('/experiments/segmentation/inference.js');
    const {SEGMENTATION_MODELS}=await import('/experiments/segmentation/models.js');
    const base='/.build/segmentation-models/cmseg-generalization/';
    const reference=await(await fetch(base+'split-reference.json')).json(),records=[];
    const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const read=async spec=>{const response=await fetch(base+spec.file);if(!response.ok)throw Error('Fixture read');const b=await response.arrayBuffer();if(b.byteLength!==spec.bytes||await hash(b)!==spec.sha256)throw Error('Fixture identity');return b;};
    const rows=compareBackends?reference.records.filter(r=>r.name==='blobs-copy'):reference.records;
    if(!rows.length)throw Error('Missing positive reference');
    for(const row of rows)for(const backend of compareBackends?['cpu','webgpu']:['webgpu']){
      const budget=new Budget(1024**3),prepare=createSegmentationPrepare({budget});let inference,prepared,output;
      const record={name:row.name,backend};records.push(record);
      try{
        const began=performance.now();
        prepared=await prepare.run({data:new Uint8Array(await read(row.rgb)),width:row.rgb.shape[1],height:row.rgb.shape[0],side:512});
        record.preparationMs=performance.now()-began;record.preparationExact=await hash(prepared.tensor)===row.input.sha256;
        const start=performance.now();
        inference=createSegmentationInference({variant:'cmseg-generalization',budget,backend,model:SEGMENTATION_MODELS['cmseg-generalization'],modelUrl:new URL('/.build/cmseg-backbone-candidate/bundle.json',location.href).href});
        output=await inference.run(prepared.tensor);
        Object.assign(record,{milliseconds:performance.now()-start,sha256:await hash(output.raw),gpu:output.gpu,workers:output.workers,timings:output.timings,memoryBeforeRelease:budget.snapshot()});
        const expected=new Float32Array(await read(row.probability)),mask=new Uint8Array(await read(row.mask));
        let maxAbs=0,sumAbs=0,different=0,maskChanges=0,foreground=0;
        for(let i=0;i<output.raw.length;i++){const delta=Math.abs(output.raw[i]-expected[i]);maxAbs=Math.max(maxAbs,delta);sumAbs+=delta;different+=output.raw[i]!==expected[i];maskChanges+=Number(output.raw[i]>.5)!==mask[i];foreground+=output.raw[i]>.5;}
        Object.assign(record,{probability:{maxAbs,meanAbs:sumAbs/output.raw.length,different,finite:output.raw.every(Number.isFinite)},maskChanges,foreground});
      }finally{output?.release();prepared?.release();inference?.dispose();prepare.dispose();}
      record.memoryAfterRelease=budget.snapshot();if(budget.total()!==0)throw Error('CMSeg ownership leak');
      console.log(JSON.stringify(record));
    }
    const accepted=records.every(r=>r.preparationExact&&r.probability.finite&&r.probability.maxAbs<=1e-4&&r.maskChanges===0);
    return{schema:1,status:accepted?'passed':'rejected',scope:'Same production CMSeg backbone, checkpoint, native512 preparation, global correlations and decoder. GPU replaces ordered non-Winograd convolutions and streams complete dot-product rows for the128x128 global correlation, retaining its normalized input on GPU; both smaller correlations and all Gaussian/softmax/TopK remain CPU. Native final probabilities and masks compared. Fresh helpers, serial runs in one browser context with identical1GiB budgets; OS/driver caches not flushed. Component timings exclude source decoding, projection/export/UI; those have separate API recipes.',records};
  },{compareBackends});
  report.browser=browser.version();report.sources={};
  for(const file of ['experiments/segmentation/cmseg-dot-gpu.js','experiments/segmentation/inference.js','experiments/segmentation/models.js','experiments/segmentation/cmseg-correlation-gpu.js','experiments/segmentation/cmseg-correlation-gpu-worker.js','vendor/segmentation/cmseg-correlation-gpu/post.js','vendor/segmentation/cmseg-correlation-gpu/post.wasm','scripts/study-cmseg-correlation-model.mjs','experiments/segmentation/cmseg-backbone.js','experiments/segmentation/cmseg-inference.js','experiments/segmentation/cmseg-inference-worker.js','experiments/segmentation/cmseg-correlation.js','experiments/segmentation/cmseg-correlation-worker.js','experiments/segmentation/prepare.js','experiments/d2prl/convolution-general-gpu.js','vendor/segmentation/CMSEG-EXACT-PINNED.json'])report.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  await writeFile(path.join(root,'docs/cmseg-'+(compareBackends?'correlation-backend-comparison':'correlation-model-corpus')+(tag?'-'+tag:'')+'-proof.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.status);if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
