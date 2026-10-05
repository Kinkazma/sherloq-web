// Development-only useful jobs, on cold browsers, with no runtime canary.
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),fixtures=process.env.NEURAL_GPU_FIXTURES,browserName=process.env.BROWSER??'chromium';
if(!fixtures||!['chromium','firefox','webkit'].includes(browserName))throw Error('Set NEURAL_GPU_FIXTURES; BROWSER is chromium, firefox or webkit.');
const varint=value=>{const bytes=[];do{bytes.push((value&127)|(value>127?128:0));value=Math.floor(value/128);}while(value);return Buffer.from(bytes);};
const integer=(field,value)=>Buffer.concat([varint(field*8),varint(value)]),message=(field,value)=>{const bytes=typeof value==='string'?Buffer.from(value):value;return Buffer.concat([varint(field*8+2),varint(bytes.length),bytes]);};
const shape=message(1,integer(1,4)),value=name=>Buffer.concat([message(1,name),message(2,message(1,Buffer.concat([integer(1,1),message(2,shape)])))]);
const graph=Buffer.concat([message(1,Buffer.concat([message(1,'x'),message(1,'x'),message(2,'y'),message(4,'Add')])),message(2,'elastic-cpu-regression'),message(11,value('x')),message(12,value('y'))]),model=Buffer.concat([integer(1,8),message(2,'sherloq-development-test'),message(7,graph),message(8,integer(2,13))]);
const server=createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Useful CPU thread elasticity</title>');return;}
 if(name==='/add.onnx'){res.end(model);return;}
 const base=path.resolve(name.startsWith('/fixtures/')?fixtures:root),file=path.resolve(base,'.'+(name.startsWith('/fixtures/')?name.slice(9):name));if(!file.startsWith(base+path.sep))throw Error('path');
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await ({chromium,firefox,webkit})[browserName].launch(browserName==='chromium'?{channel:'chrome',headless:true}:{headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{getExecutionScheduler}=await import('/src/execution-scheduler.js');
  const bytes=new Uint8Array(await(await fetch('/add.onnx')).arrayBuffer()),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),budget=new Budget(512*1024**2),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),pool=new NeuralGraphPool(budget,{maxWorkers:4},{assets:{add:{url:new URL('/add.onnx',location.href).href,bytes:bytes.length,sha256}},runtimes:{wasm:{factoryUrl:new URL('/fixtures/m2-neural-runtime/wasm-factory.mjs',location.href).href,ortUrl:new URL('/vendor/d2prl/ort.wasm.min.mjs',location.href).href,wasmUrl:new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm',location.href).href}}}),records=[];
  let held=await scheduler.acquire({cpu:3});
  try{for(let index=0;index<3;index++){
   const numbers=Float32Array.from([index+1,2,3,4]),result=await pool.run('add',{x:{data:numbers,dims:[4]}},{backend:'cpu',workspaceBytes:1024**2,outputBytes:16});
   try{records.push({values:[...result.result.y.data],expected:[...numbers].map(x=>x*2),...result.metrics});}finally{result.release();}
   if(index===0){held.release();held=null;}
  }}finally{held?.release();pool.dispose();}
  return {records,isolated:crossOriginIsolated,budgetBytes:budget.total(),scheduler:scheduler.snapshot(),passed:budget.total()===0&&records.every(r=>r.values.every((x,i)=>x===r.expected[i]))&&records[0].threads===1&&records[1].threads===(crossOriginIsolated?4:1)&&records[2].threads===(crossOriginIsolated?4:1)};
 });console.log(JSON.stringify({browser:browserName,version:browser.version(),...result}));if(!result.passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
