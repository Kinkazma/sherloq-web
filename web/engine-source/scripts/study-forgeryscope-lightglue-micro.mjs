// Composed adaptive microscopy matcher, native controls and real ONNX layers.
import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),ortRoot=process.env.FORGERYSCOPE_ORT_DIST;if(!ortRoot)throw Error('Set FORGERYSCOPE_ORT_DIST.');const provider=process.argv.includes('--gpu')?'webgpu':'wasm';
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Adaptive microscopy matcher</title>');return;}const base=path.resolve(name.startsWith('/ort/')?ortRoot:root),file=path.resolve(base,'.'+(name.startsWith('/ort/')?name.slice(4):name));if(!file.startsWith(base+path.sep))throw Error('path');res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',x=>{if(x.type()==='error')console.log(x.text());});await page.goto(`http://127.0.0.1:${server.address().port}`);
 const report=await page.evaluate(async provider=>{
  const ort=await import('/ort/'+(provider==='wasm'?'ort.wasm.min.mjs':'ort.webgpu.min.mjs'));ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='/ort/';
  const {runMicroMatcher}=await import('/src/forgeryscope-micro-matcher.js'),base='/.build/forgeryscope/micro/',ref=await(await fetch(base+'reference.json')).json(),records=[];
  const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
  // One graph session at a time; this development runner does not retain nineteen
  // copies of the native weights or claim a production memory admission policy.
  async function runGraph(id,values){
   const graph=ref.graphs.find(g=>g.id===id);if(!graph)throw Error('Graph missing');
   const bytes=new Uint8Array(await(await fetch(base+graph.file)).arrayBuffer());if(await hash(bytes)!==graph.sha256)throw Error('Graph identity');
   const session=await ort.InferenceSession.create(bytes,{executionProviders:[provider],graphOptimizationLevel:'all'}),feeds={};let output;
   try{for(const[name,t]of Object.entries(values))feeds[name]=new ort.Tensor('float32',t.data,t.dims);output=await session.run(feeds);return Object.fromEntries(Object.entries(output).map(([name,t])=>[name,{data:t.data.slice(),dims:t.dims}]));}
   finally{for(const t of Object.values(feeds))t.dispose();for(const t of Object.values(output??{}))t.dispose();await session.release();}
  }
  for(const c of ref.cases){const features={};for(const i of c.inputs)features[i.name]={data:new Float32Array(await(await fetch(base+i.file)).arrayBuffer()),dims:i.shape};const steps=[],result=await runMicroMatcher(features,{runGraph,onProgress:p=>steps.push(p)});let scoreError=0,decisionDifferences=0;for(const[key,expected]of Object.entries(c.outputs)){const actual=result[key];if(actual.length!==expected.length)throw Error('Shape');for(let i=0;i<actual.length;i++)if(key.startsWith('matching_scores'))scoreError=Math.max(scoreError,Math.abs(actual[i]-expected[i]));else decisionDifferences+=actual[i]!==expected[i];}records.push({case:c.id,kind:c.kind,nativeStop:c.stop,stop:result.stop,decisionDifferences,scoreError,matchCount:result.matches0.reduce((n,x)=>n+(x>=0),0),steps});}
  return {provider,scope:'adaptive microscopy graph composition on native synthetic features; no SIFT extraction/geometry',checkpointSha256:ref.checkpointSha256,graphs:ref.graphs,runtime:ort.env.versions,nativeTorch:ref.torch,records};
 },provider);report.browser=browser.version();report.executionNote=provider==='webgpu'?'WebGPU requested; ORT may assign nodes to CPU. No GPU-only claim.':'CPU/WASM';report.passed=report.records.every(r=>r.stop===r.nativeStop&&r.decisionDifferences===0&&r.scoreError<=1e-4);await writeFile(path.join(root,`docs/forgeryscope-lightglue-micro-${provider}-proof.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({provider,passed:report.passed,records:report.records}));if(!report.passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
