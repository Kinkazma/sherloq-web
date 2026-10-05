import {freezeBrowserRuntime} from './freeze-browser-runtime.mjs';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const variant=process.env.M5_DENSE_CACHE_VARIANT??'initial';if(!['initial','phase'].includes(variant))throw Error('Unknown cache qualification variant');
const stem=variant==='phase'?'m5-dense-cache-phase-96mp':'m5-dense-cache-96mp';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.build/integration',variant==='phase'?'dense-cache-phase-96mp':'dense-cache-96mp');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim())throw Error('Commit the candidate before96MP qualification');
await fs.mkdir(directory,{recursive:true});
const runtime=await freezeBrowserRuntime(root,directory),workerFile='tests/m5-dense-cache-96mp-worker.js';
const recipe=await fs.readFile(path.join(root,workerFile)),workerSnapshot=path.join(directory,'runtime',workerFile);await fs.mkdir(path.dirname(workerSnapshot),{recursive:true});await fs.writeFile(workerSnapshot,recipe);runtime.files.set('/'+workerFile,workerSnapshot);
const binding={variant,engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:runtime.proof,recipeSha256:createHash('sha256').update(recipe).digest('hex')};
await fs.writeFile(path.join(directory,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const part=path.join(directory,'complete.npz.part'),output=await fs.open(part,'wx');let delivered=0,context,interrupted=false;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname==='/output'){
  if(Number(url.searchParams.get('offset'))!==delivered)throw Error('Archive offset');
  for await(const chunk of req){await output.write(chunk,0,chunk.length,delivered);delivered+=chunk.length;}
  res.end('ok');return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M5 adaptive dense cache96MP</title>');return;}
 const file=runtime.files.get(url.pathname)??(url.pathname==='/.build/integration/dense-cache-96mp/copy-6000.jpg'?path.join(root,'.build/integration/dense-cache-96mp/copy-6000.jpg'):null);
 if(!file)throw Error('Unfrozen path');const stat=await fs.stat(file);res.setHeader('Content-Length',stat.size);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');createReadStream(file).pipe(res);
 }catch(error){console.error('SERVE',error.message);res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await fs.mkdtemp(path.join(directory,'chrome-')),interrupt=()=>{interrupted=true;void context?.close();};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
try{
 context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome'});const page=await context.newPage();
 await page.exposeFunction('report',async value=>{console.log(JSON.stringify(value));await fs.appendFile(path.join(directory,'progress.jsonl'),JSON.stringify(value)+'\n');});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/tests/m5-dense-cache-96mp-worker.js',{type:'module'});w.onmessage=({data})=>{if(data.progress){window.report(data.progress);return;}w.terminate();resolve(data);};w.onerror=e=>{w.terminate();reject(Error(e.message));};w.postMessage({});}));
 if(result.error)throw Error(JSON.stringify(result));
 if(delivered!==result.result.export.byteLength)throw Error('Incomplete archive delivery');await output.close();await fs.rename(part,path.join(directory,'complete.npz'));
 await fs.writeFile(path.join(root,'docs',stem+'-proof.json'),JSON.stringify({...result,binding,browser:context.browser()?.version()},null,2)+'\n');console.log(JSON.stringify({passed:true,elapsedMs:result.result.elapsedMs,delivered}));
}catch(error){await fs.writeFile(path.join(directory,'incomplete.json'),JSON.stringify({binding,interrupted,delivered,error:{message:error.message,stack:error.stack}},null,2)+'\n');throw error;}
finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);await context?.close();await output.close();await fs.rm(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
