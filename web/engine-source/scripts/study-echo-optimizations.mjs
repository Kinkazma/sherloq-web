import {summarizeRecordedMemory} from './proof-memory.mjs';
import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));let variant=0;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local').pathname;if(url==='/')return res.end('<!doctype html><title>Echo optimization comparison</title>');if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');const relative=path.relative(root,file),asset=/^vendor\/echo\/echo\.(js|wasm)$/.test(relative)?path.join(root,'.build/echo-candidates/'+variant,path.basename(file)):file;
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(asset));
 }catch{res.statusCode=404;res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const cases=[];
 for(const flags of (process.env.ECHO_FLAGS??'0,1,3,7').split(',').map(Number)){
  variant=flags;const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  try{const record=await page.evaluate(async()=>(await import('/tests/echo-optimization-browser.js')).echoOptimizationBrowser());if(errors.length)throw Error(errors.join('\n'));const identity=JSON.parse(await readFile(path.join(root,'.build/echo-candidates/'+flags+'/PINNED.json'))),parity=await readFile(path.join(root,'.build/echo-candidates/'+flags+'/native-parity.log'),'utf8');if(!parity.includes('# pass 1')||!parity.includes('# fail 0'))throw Error('Native900 qualification missing');cases.push({flags,identity,nativeCases:900,...record});console.log(JSON.stringify({flags,samples:record.samples.map(s=>({temperature:s.temperature,rpcMs:s.rpcMs,chainMs:s.chainMs,renderMs:s.metrics.renderMs,derivativesMs:s.metrics.derivativesMs}))}));}finally{await page.close();}
 }
 const report={schema:1,status:'passed',scope:'Offline developer comparison only; one cold and one warm requested 12.612623 MP task per condition, one main CPU worker, 256 MiB shared admission. Flags0=baseline,1=interior reflect fast path,3=plus vertical border indices once per row,7=plus exact integer-domain horizontal FMA;5=interior fast path and horizontal FMA without vertical-index table. No runtime calibration. Small257x63 derived Canvas presentation is not WordPress/full-image display; Blob fetch and final complete-image verification are outside timed chain.',browser:browser.version(),cases,sources:{}};
 report.memorySummary=summarizeRecordedMemory(report);
 for(const file of ['native/echo.cpp','scripts/build-echo.sh','scripts/study-echo-optimizations.mjs','tests/echo-optimization-browser.js','src/echo-math.js','src/segmented-echo.js','src/index.js'])report.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 await writeFile(path.join(root,process.env.ECHO_PROOF??'docs/echo-optimizations-chrome-proof.json'),JSON.stringify(report,null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
