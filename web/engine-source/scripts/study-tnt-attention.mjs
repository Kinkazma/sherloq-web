import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const measureCpu=!process.argv.includes('--correctness-only');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local').pathname;
  if(url==='/')return res.end('<!doctype html><title>TNT GPU attention</title>');
  if(url==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+url);if(!file.startsWith(root))throw Error('Path');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  const proof=await page.evaluate(async measureCpu=>(await import('/tests/tnt-attention-gpu-browser.js')).tntAttentionGpuBrowserTest({measureCpu}),measureCpu);
  proof.browser=browser.version();proof.sources={};
  for(const file of ['scripts/study-tnt-attention.mjs','tests/tnt-attention-gpu-browser.js','experiments/segmentation/tnt-linear-gpu.js','experiments/segmentation/tnt-attention-gpu.js','vendor/segmentation/tnt-math.js','vendor/segmentation/tnt-math.wasm','experiments/d2prl/convolution-general-gpu.js'])proof.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  await writeFile(path.join(root,'docs/tnt-attention-operations'+(measureCpu?'':'-correctness')+'-proof.json'),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
