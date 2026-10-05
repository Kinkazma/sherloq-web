import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local').pathname;
  if(url==='/')return res.end('<!doctype html><title>VIG GPU graph distances</title>');
  if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  const proof=await page.evaluate(async()=>(await import('/tests/vig-distance-gpu-browser.js')).vigDistanceGpuBrowserTest());
  proof.browser=browser.version();proof.sources={};
  for(const file of ['scripts/study-vig-distance.mjs','tests/vig-distance-gpu-browser.js','experiments/segmentation/vig-convolution-gpu.js','experiments/segmentation/vig-distance-gpu.js','vendor/segmentation/vig-math.js','vendor/segmentation/vig-math.wasm','experiments/d2prl/convolution-general-gpu.js'])proof.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  await writeFile(path.join(root,'docs/vig-distance-operations-proof.json'),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
