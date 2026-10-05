import {summarizeRecordedMemory} from './proof-memory.mjs';
import {chromium,firefox,webkit} from 'playwright';import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=process.argv.find(a=>a.startsWith('--runtime-root='))?.slice(15),name=process.argv.find(a=>a.startsWith('--browser='))?.slice(10)??'chrome';
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local').pathname;if(url==='/')return res.end('<!doctype html><title>Segmented magnifier qualification</title>');if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');const relative=path.relative(root,file),asset=runtime&&/^(src|vendor|experiments)\//.test(relative)?path.resolve(runtime,relative):file;
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(asset));
 }catch{res.statusCode=404;res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 const launcher={chrome:chromium,firefox,webkit}[name];if(!launcher)throw Error('Unknown browser');browser=await launcher.launch(name==='chrome'?{channel:'chrome',headless:true}:{headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async()=>(await import('/tests/segmented-magnifier-browser.js')).segmentedMagnifierBrowserTest());if(errors.length)throw Error(errors.join('\n'));
 report.memorySummary=summarizeRecordedMemory(report);report.browser=browser.version();report.extractedRuntime=!!runtime;report.engineSources={};for(const file of ['src/segmented-magnifier.js','src/magnifier.js','src/index.js'])report.engineSources[file]=createHash('sha256').update(await readFile(path.join(runtime??root,file))).digest('hex');
 report.recipeSources={};for(const file of ['scripts/proof-memory.mjs','scripts/generate-large-magnifier.py','scripts/study-segmented-magnifier.mjs','tests/segmented-magnifier-browser.js'])report.recipeSources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 await writeFile(path.join(root,'docs/segmented-magnifier-'+name+(runtime?'-extracted':'')+'-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,browser:report.browser,loadMs:report.loadMs,cancellation:report.cancellation,memory:report.memory}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
