import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M4 dense validation</title>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const proof=await page.evaluate(async()=>{const {plotRendererPagedBrowserTest}=await import('/tests/plot-renderer-paged-browser.js');return plotRendererPagedBrowserTest();});
 await fs.mkdir(new URL('../.build/plot-renderer-paged/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../.build/plot-renderer-paged/preview.png',import.meta.url),Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await globalThis.plotPreview.arrayBuffer())))));
 await fs.writeFile(new URL('../docs/plot-renderer-paged-browser-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
