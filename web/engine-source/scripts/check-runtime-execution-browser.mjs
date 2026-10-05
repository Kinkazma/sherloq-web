// Development-only integration regressions; production starts requested work directly.
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),name=process.env.RUNTIME_BROWSER??'chrome';
const launcher={chrome:chromium,firefox,webkit}[name];if(!launcher)throw Error('Unknown test browser');
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Execution regression</title>');return;}
  const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');
  res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(file)]??'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await launcher.launch(name==='chrome'?{channel:'chrome',headless:true}:{headless:true});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const suites=[['quality-pool-browser.js','qualityPoolBrowserTest'],['segmented-recompression-pool-browser.js','segmentedRecompressionPoolBrowserTest'],['zero-stream-pool-browser.js','zeroStreamPoolBrowserTest'],['energy-stream-pool-browser.js','energyStreamPoolBrowserTest'],['ghost-stream-pool-browser.js','ghostStreamPoolBrowserTest']];
 for(const [file,fn]of suites){
  const result=await page.evaluate(async({file,fn})=>{const module=await import('/tests/'+file);return module[fn]();},{file,fn});
  console.log(JSON.stringify({suite:fn,browser:browser.version(),result}));
 }
 const execution=await page.evaluate(async()=>{
  const {createWorkerEngine}=await import('/src/worker-client.js');
  const engine=createWorkerEngine({cpuKernel:'single',resourceHints:{hardwareConcurrency:8}});
  try{const state=await engine.capabilities();if(state.execution.capacity.cpu!==1||state.execution.preflightExecutions!==0)throw Error('Single CPU mode ignored');return state.execution;}finally{engine.dispose();}
 });
 console.log(JSON.stringify({browser:browser.version(),execution,passed:true}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
