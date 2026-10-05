// Exact native inputs below isolate a defect; they never enter production.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname;if(name==='/')return res.end('<!doctype html><title>TNT stage diagnostic</title>');if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Path');res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async()=>{
    const ort=await import('/vendor/d2prl/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('/.build/segmentation-ort-1024/factory.mjs',location.href).href,wasm:new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm',location.href).href};
    const base='/.build/segmentation-models/mgcfdn-tnt/',fixture=base+'stages/',reference=await(await fetch(fixture+'reference.json')).json();
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const read=async(spec,prefix=fixture)=>{const res=await fetch(prefix+spec.file);if(!res.ok)throw Error('Fixture missing');const bytes=await res.arrayBuffer();if(bytes.byteLength!==spec.bytes||await hash(bytes)!==spec.sha256)throw Error('Fixture identity');return bytes;};
    const stats=(a,b)=>{let different=0,maxAbs=0;for(let i=0;i<a.length;i++){different+=a[i]!==b[i];maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));}return{different,maxAbs,finite:a.every(Number.isFinite)};};
    const expected=new Float32Array(await read(reference.probability,base)),expectedLogits=new Float32Array(await read(reference.logits,base)),records=[];
    for(const [label,spec]of Object.entries(reference.graphs)){
      const session=await ort.InferenceSession.create(await read(spec),{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});let input,output;
      try{
        const entry=label==='full'?reference.input:reference.stages[label];input=new ort.Tensor('float32',new Float32Array(await read(entry,label==='full'?base:fixture)),entry.shape);output=await session.run({[label==='full'?'rgb':entry.name]:input});
        const changed=[];for(let i=0;i<expected.length;i++)if((output.probability.data[i]>.5)!==(expected[i]>.5))changed.push({x:i%256,y:Math.floor(i/256),native:expected[i],browser:output.probability.data[i],nativeLogit:expectedLogits[i],browserLogit:output.logits.data[i]});
        const stages={};if(label==='full')for(const [name,entry]of Object.entries(reference.stages))stages[name]=stats(output[entry.name].data,new Float32Array(await read(entry)));
        records.push({input:label==='full'?'actual-rgb':'diagnostic-native-'+label,probability:stats(output.probability.data,expected),logits:stats(output.logits.data,expectedLogits),maskChanges:changed.length,examples:changed.slice(0,16),stages});
      }finally{input?.dispose();for(const value of Object.values(output??{}))value.dispose();await session.release();}
    }
    return{schema:1,status:'diagnostic-only',scope:'TNT actual full network followed by isolated downstream subgraphs on exact native tensors; oracle inputs locate a defect only, never qualify the model.',sourceModelSha256:reference.sourceModelSha256,case:reference.case,records};
  });
  report.browser=browser.version();report.sources={};for(const name of ['scripts/export-segmentation-stage-diagnostics.py','scripts/study-segmentation-stage-diagnostics.mjs'])report.sources[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  await writeFile(path.join(root,'docs/segmentation-tnt-stages-diagnostic.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
