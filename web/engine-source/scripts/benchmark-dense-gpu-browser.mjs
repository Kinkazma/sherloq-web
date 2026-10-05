// Development qualification: every CPU/GPU comparison starts in a new browser.
// No benchmark or reference computation is part of the shipped engine.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const positive=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isSafeInteger(value)||value<1)throw Error(`Invalid ${name}`);return value;};
const settings={width:positive('DENSE_GPU_WIDTH',192),height:positive('DENSE_GPU_HEIGHT',128),iterations:positive('DENSE_GPU_ITERATIONS',4),budgetMiB:positive('DENSE_GPU_BUDGET_MIB',1024),workspaceMiB:positive('DENSE_GPU_WORKSPACE_MIB',384)};
const server=createServer(async(request,response)=>{try{response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Cold dense GPU qualification</title>');return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('outside');response.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(await readFile(file));}catch{response.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const records=[];
try{
 for(const kind of ['full128','compact-sift'])for(const gpu of [false,true]){
  const browser=await chromium.launch({headless:true,channel:'chrome'});try{
   const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);const start=performance.now();
   const record=await page.evaluate(settings=>new Promise((resolve,reject)=>{const worker=new Worker('/tests/dense-gpu-benchmark-worker.js',{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(JSON.stringify(data.error))):resolve(data.result);};worker.onerror=e=>reject(Error(e.message));worker.postMessage(settings);}),{...settings,kind,gpu});
   record.requestWallMs=performance.now()-start;record.browser=browser.version();records.push(record);console.log(JSON.stringify(record));
  }finally{await browser.close();}
 }
 for(const kind of ['full128','compact-sift']){const [cpu,gpu]=records.filter(r=>r.kind===kind);if(JSON.stringify(cpu.hashes)!==JSON.stringify(gpu.hashes)||cpu.comparisons!==gpu.comparisons||cpu.remainingBudgetBytes||gpu.remainingBudgetBytes)throw Error('Scientific parity or disposal failed for '+kind);}
 console.log(JSON.stringify({passed:true,records,note:'Cold useful preparation, solver, shader initialization, transfers, output materialization and worker startup included. No extrapolation to 96 MP.'}));
}finally{await new Promise(resolve=>server.close(resolve));}
