// Blot matcher qualification on real graph with native synthetic descriptors.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),ortRoot=process.env.FORGERYSCOPE_ORT_DIST;
if(!ortRoot)throw Error('Set FORGERYSCOPE_ORT_DIST (read-only ORT dist).');
const provider=process.argv.includes('--gpu')?'webgpu':'wasm';
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Forgeryscope LightGlue study</title>');return;}const base=path.resolve(name.startsWith('/ort/')?ortRoot:root),file=path.resolve(base,'.'+(name.startsWith('/ort/')?name.slice(4):name));if(!file.startsWith(base+path.sep))throw Error('path');res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',x=>{if(x.type()==='error')console.log(x.text());});await page.goto(`http://127.0.0.1:${server.address().port}`);
 const report=await page.evaluate(async provider=>{
  const ort=await import('/ort/'+(provider==='wasm'?'ort.wasm.min.mjs':'ort.webgpu.min.mjs'));ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='/ort/';
  const base='/.build/forgeryscope/',ref=await(await fetch(base+'lightglue-blot-reference.json')).json(),records=[];
  const bytes=new Uint8Array(await(await fetch(base+ref.file)).arrayBuffer()),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==ref.sha256)throw Error('Model identity');
  const session=await ort.InferenceSession.create(bytes,{executionProviders:[provider],graphOptimizationLevel:'all'});
  try{for(const c of ref.cases){
   const feeds={};for(const input of c.inputs)feeds[input.name]=new ort.Tensor('float32',new Float32Array(await(await fetch(base+input.file)).arrayBuffer()),input.shape);
   const start=performance.now(),output=await session.run(feeds);let scoreError=0,matchDifferences=0,matchCount=0;
   for(const [name,tensor]of Object.entries(output)){
    const values=Array.from(tensor.data,Number),expected=c.outputs[name].data;if(values.length!==expected.length)throw Error('Shape mismatch');
    for(let i=0;i<values.length;i++)if(name.startsWith('matches')){matchDifferences+=values[i]!==expected[i];if(name==='matches0'&&values[i]>=0)matchCount++;}else scoreError=Math.max(scoreError,Math.abs(values[i]-expected[i]));
    tensor.dispose();
   }
   for(const t of Object.values(feeds))t.dispose();records.push({case:c.id,scoreError,matchDifferences,matchCount,ms:performance.now()-start});
  }}finally{await session.release();}
  return {provider,scope:ref.scope,modelSha256:ref.sha256,checkpointSha256:ref.checkpointSha256,runtime:ort.env.versions,nativeTorch:ref.torch,records};
 },provider);
 report.browser=browser.version();report.executionNote=provider==='webgpu'?'WebGPU requested; ORT may assign unsupported nodes to CPU. Inspect provider logs; no GPU-only claim.':'CPU/WASM';report.passed=report.records.every(r=>r.matchDifferences===0&&r.scoreError<=1e-4);
 await writeFile(path.join(root,`docs/forgeryscope-lightglue-blot-${provider}-proof.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
