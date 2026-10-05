// Real CNNs plus bounded global correlation; private conversion and publicable
// synthetic references. No registration or final UI parity claim from this study.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),variant=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'generalization';
const fixture = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const oracleCorrelationInputs=process.argv.includes('--native-features'),diagnose=true,kernel=process.argv.find(a=>a.startsWith('--kernel='))?.slice(9)??'/vendor/segmentation/correlation.js';if(!/^\/(vendor|\.build)\/[a-z0-9/-]+\.js$/.test(kernel))throw Error('Kernel path');
const suffixArg=process.argv.indexOf('--arithmetic'),suffix=suffixArg<0?null:process.argv[suffixArg+1];if(suffix && !/^native-mean(-bn)?$/.test(suffix))throw Error('Arithmetic');
if(!['generalization','addnoise'].includes(variant) || fixture && !/^[a-z-]+$/.test(fixture))throw Error('Variant/fixture');
const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname;if(name==='/')return res.end('<!doctype html><title>Bounded CMSeg candidate</title>');
  if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Path');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async ({variant,fixture,suffix,diagnose,kernel,oracleCorrelationInputs})=>{
    const {Budget}=await import('/src/cache.js'),{createCmsegCorrelation}=await import('/experiments/segmentation/cmseg-correlation.js');
    const {createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js'),ort=await import('/vendor/d2prl/ort.wasm.min.mjs'),runtime=await import('/vendor/d2prl/factory.mjs');
    ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('/vendor/d2prl/factory.mjs',location.href).href,wasm:new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm',location.href).href};
    const base='/.build/cmseg-jpeg-diagnostic/',reference=await(await fetch(base+'reference.json')).json();
    if(suffix)reference.graphs=(await(await fetch(base+suffix+'.json')).json()).graphs;
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const read=async spec=>{const b=await(await fetch(base+spec.file)).arrayBuffer();if(b.byteLength!==spec.bytes||await hash(b)!==spec.sha256)throw Error('Identity');return b;};
    const compare=(a,b)=>{if(a.length!==b.length)throw Error('Shape');let maxAbs=0,different=0;for(let i=0;i<a.length;i++){maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));different+=a[i]!==b[i];}return{maxAbs,different,finite:a.every(Number.isFinite)};};
    const budget=new Budget(3*1024**3),resident=budget.reserve(512*1024**2+3*(reference.graphs.encoder.bytes+reference.graphs.decoder.bytes)),sessions=[],records=[];
    const correlation=createCmsegCorrelation({budget,moduleUrl:new URL(kernel,location.href).href}),prepare=createSegmentationPrepare({budget});
    let failure;
    try{
      for(const name of ['encoder','decoder'])sessions.push(await ort.InferenceSession.create(await read(reference.graphs[name]),{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false}));
      const selected = fixture ? reference.records.filter(r=>r.name===fixture) : reference.records; if(!selected.length)throw Error('Fixture');
      for(const row of selected){
        const [h,w]=row.rgb.shape,prepared=await prepare.run({data:new Uint8Array(await read(row.rgb)),width:w,height:h,side:512}),input=new ort.Tensor('float32',prepared.tensor,[1,3,512,512]);
        let features,output,featureLease;const correlations=[],feeds={},stages=[];
        const started=performance.now();
        try{
          featureLease=budget.reserve(row.features.reduce((n,s)=>n+s.bytes*3,0)+row.probability.bytes*4);
          features=await sessions[0].run({rgb:input});
          const featureErrors=[];for(let i=0;i<5;i++)featureErrors.push(compare(features['x'+(i+1)].data,new Float32Array(await read(row.features[i]))));
          for(let level=0;level<3;level++){
            const feature=features['x'+(level+2)],spec=reference.correlation[level],begin=performance.now();
            const result=await correlation.run({input:oracleCorrelationInputs?new Float32Array(await read(row.features[level+1])):feature.data,c:feature.dims[1],h:feature.dims[2],w:feature.dims[3],k:spec.topk,alpha:spec.alpha});
            correlations.push(result);feeds['c'+(level+2)]=new ort.Tensor('float32',result.data,result.shape);
            stages.push({name:spec.name,milliseconds:performance.now()-begin,workers:result.workers,heapMaximumBytes:result.heapMaximumBytes,observedHeapBytes:result.observedHeapBytes,errors:compare(result.data,new Float32Array(await read(row.correlations[level])))});
          }
          output=await sessions[1].run({...feeds,x1:features.x1,x5:features.x5});
          const probability=compare(output.probability.data,new Float32Array(await read(row.probability))),logits=compare(output.logits.data,new Float32Array(await read(row.logits))),expectedMask=new Uint8Array(await read(row.mask));
          let changes=0,foreground=0;for(let i=0;i<expectedMask.length;i++){const value=Number(output.probability.data[i]>.5);changes+=value!==expectedMask[i];foreground+=value;}
          const diagnostics=[];
          if(diagnose){
            const native={x1:new ort.Tensor('float32',new Float32Array(await read(row.features[0])),row.features[0].shape),x5:new ort.Tensor('float32',new Float32Array(await read(row.features[4])),row.features[4].shape)};
            for(let i=0;i<3;i++)native['c'+(i+2)]=new ort.Tensor('float32',new Float32Array(await read(row.correlations[i])),row.correlations[i].shape);
            try{for(const [name,replacements] of [['native-head',native],['native-correlations',{c2:native.c2,c3:native.c3,c4:native.c4}],['native-bypass-features',{x1:native.x1,x5:native.x5}]]){
              const isolated=await sessions[1].run({...feeds,x1:features.x1,x5:features.x5,...replacements});
              try{diagnostics.push({name,oracleInputsOnlyForLocalization:true,probability:compare(isolated.probability.data,new Float32Array(await read(row.probability))),maskChanges:isolated.probability.data.reduce((n,v,i)=>n+Number(Number(v>.5)!==expectedMask[i]),0)});}finally{Object.values(isolated).forEach(v=>v.dispose());}
            }}finally{Object.values(native).forEach(v=>v.dispose());}
          }
          const record={oracleCorrelationInputs,diagnostics,name:row.name,preparationExact:await hash(prepared.tensor)===row.input.sha256,featureErrors,stages,probability,logits,mask:{changes,foreground,nativeForeground:row.nativeForeground},heapBytes:runtime.heapBytes(),milliseconds:performance.now()-started};records.push(record);console.log(JSON.stringify(record));
        }finally{for(const value of Object.values(feeds))value.dispose();for(const value of Object.values(output??{}))value.dispose();for(const value of Object.values(features??{}))value.dispose();correlations.forEach(v=>v.release());featureLease?.();input.dispose();prepared.release();}
      }
    }catch(error){failure=String(error?.stack??error);}
    finally{for(const session of sessions)await session.release();correlation.dispose();prepare.dispose();resident();}
    const accepted=!failure&&records.length===(fixture?1:reference.records.length)&&records.every(r=>r.preparationExact&&r.probability.finite&&r.probability.maxAbs<=1e-4&&r.mask.changes===0)&&budget.total()===0;
    return{schema:1,status:oracleCorrelationInputs?'diagnostic-with-oracles':accepted?'passed-split-corpus':'rejected',scope:'Real native512 CMSeg encoder/decoder ONNX CPU with bounded global SIMD-WASM correlation; all pair comparisons retained, no approximate neighbour pruning or resize. No common API, source projection, cancellation or UI qualification yet.',variant,weights:reference.weights,graphs:reference.graphs,records,failure,memory:budget.snapshot()};
  },{variant,fixture,suffix,diagnose,kernel,oracleCorrelationInputs});
  report.browser=browser.version();report.kernel={path:kernel,sha256:createHash('sha256').update(await readFile(path.join(root,kernel))).digest('hex'),wasmSha256:createHash('sha256').update(await readFile(path.join(root,kernel.replace(/\.js$/,'.wasm')))).digest('hex')};report.sources={};for(const name of ['scripts/study-cmseg-jpeg.mjs','experiments/segmentation/cmseg-correlation.cpp','experiments/segmentation/cmseg-correlation.js','experiments/segmentation/cmseg-correlation-worker.js','scripts/export-cmseg-split.py'])report.sources[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  await writeFile(path.join(root,'docs/cmseg-jpeg-'+kernel.split('/').slice(-2,-1)[0]+(oracleCorrelationInputs?'-native-features':'')+'-diagnostics.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);if(report.status==='rejected')process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
