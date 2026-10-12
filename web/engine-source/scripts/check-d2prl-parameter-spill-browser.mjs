import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),validateOnly=args.includes('--validate-only');
const outputArg=args.find(arg=>arg.startsWith('--output='));
const playwrightArg=args.find(arg=>arg.startsWith('--playwright-module='));
if(args.some(arg=>arg!=='--validate-only'&&!arg.startsWith('--output=')&&!arg.startsWith('--playwright-module=')))throw new Error('Use --validate-only, --output=PATH or --playwright-module=PATH');
const output=outputArg?path.resolve(outputArg.slice(9)):path.join(root,'docs/d2prl-parameter-spill-chrome-proof.json');
const sources=['scripts/check-d2prl-parameter-spill-browser.mjs','tests/d2prl-parameter-spill-browser-worker.js','experiments/d2prl/parameter-store.js','experiments/d2prl/parameter-spill.js','src/migration-workspace.js','src/temporary-storage.js','src/opfs-storage.js','src/indexeddb-storage.js','src/segmented-bytes.js'];
for(const file of sources)execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
if(validateOnly){console.log(JSON.stringify({status:'validated',mode:'syntax-only',browserStarted:false,checkedSources:sources}));process.exit(0);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,hash(await readFile(path.join(root,file)))])));
const values=Float32Array.from({length:256*1024/4},(_,index)=>((index%251)-125)/128),asset=Buffer.from(values.buffer),sha256=hash(asset),assetPath='/assets/'+sha256+'.bin';
const spec={file:assetPath.slice(1),bytes:asset.length,sha256,dtype:'float32',shape:[values.length]};
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>D2PRL bounded parameter storage qualification</title>');return;}
  if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  if(pathname===assetPath){res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',asset.length);for(let at=0;at<asset.length;at+=65536)res.write(asset.subarray(at,at+65536));res.end();return;}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root))throw new Error('Outside source root');res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.writeHead(404).end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,context,page;
const report={schema:1,status:'running',createdAt:new Date().toISOString(),browser:null,deviceScope:'Real isolated desktop Chromium, not a phone',systemExclusiveEstablished:false,macroBenchmarkOverlap:false,concurrencyEvidence:'Orchestrator schedules this functional check before the macrobenchmark; external process load is not measured.',benchmark:false,syntheticAsset:spec,sources:sourceHashes,runs:[],ownedSessions:[]};
try{
 const playwrightModule=playwrightArg?pathToFileURL(path.resolve(playwrightArg.slice(20))).href:'playwright';const {chromium}=await import(playwrightModule);report.playwrightModule=playwrightModule;browser=await chromium.launch({headless:true,channel:'chrome'});context=await browser.newContext();page=await context.newPage();report.browser=browser.version();
 await page.exposeFunction('recordSpillProgress',event=>{if(event.sessionId)report.ownedSessions.push({backend:event.backend,id:event.sessionId});if(event.phase==='case-complete')console.log(JSON.stringify({phase:event.phase,backend:event.backend,mode:event.mode,status:event.status}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 for(const backend of ['opfs','indexeddb'])report.runs.push(await page.evaluate(({backend,spec})=>new Promise((resolve,reject)=>{
  const worker=new Worker('/tests/d2prl-parameter-spill-browser-worker.js',{type:'module'});let complete=false;
  const timeout=setTimeout(()=>finish(new Error('Bounded storage worker timed out')),60000);
  function finish(error,result){if(complete)return;complete=true;clearTimeout(timeout);worker.terminate();error?reject(error):resolve(result);}
  worker.onerror=event=>finish(new Error(event.message));worker.onmessage=({data})=>{if(!data.done){window.recordSpillProgress(data);return;}data.error?finish(Object.assign(new Error(data.error.message),data.error)):finish(null,data.result);};worker.postMessage({backend,spec});
 }),{backend,spec}));
 const afterHashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,hash(await readFile(path.join(root,file)))])));if(JSON.stringify(afterHashes)!==JSON.stringify(sourceHashes))throw new Error('Qualification sources changed during the run');
 report.status='passed';report.scope='Eight sequential real dedicated-worker OPFS/IndexedDB cases with a 256 KiB synthetic parameter. Exact pinned-SHA roundtrip, simulated policy pressure, explicit logical quota and I/O/cancellation injections, owned session and backing cleanup. External process load is not measured; no isolated performance claim.';
}catch(error){report.status='failed';report.error={code:error.code??'TEST_FAILED',message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 if(page)try{report.emergencyCleanup=await page.evaluate(async sessions=>{const {removeTerminatedTemporarySession}=await import('/src/temporary-storage.js');const outcomes=[];for(const session of sessions)try{await removeTerminatedTemporarySession(session.id,session.backend);outcomes.push({...session,ownedCleanup:'complete'});}catch(error){outcomes.push({...session,ownedCleanup:'failed',code:error.code,message:error.message});}return outcomes;},report.ownedSessions);}catch(error){report.cleanupError=error.message;report.status='failed';process.exitCode=1;}
 if(report.emergencyCleanup?.some(value=>value.ownedCleanup==='failed')){report.status='failed';process.exitCode=1;}
 await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.runs.reduce((sum,run)=>sum+run.cases.length,0),report:output,browser:report.browser,benchmark:false,error:report.error?.message}));
}
