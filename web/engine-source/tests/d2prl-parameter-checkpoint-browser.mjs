import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),kind=process.env.BROWSER??'chromium';
const weightBytes=72*1024**2,chunk=Buffer.from(Uint8Array.from({length:65536},(_,i)=>i&255)),digest=createHash('sha256');for(let i=0;i<weightBytes;i+=chunk.length)digest.update(chunk);const spec={file:'weight-72m.bin',bytes:weightBytes,sha256:digest.digest('hex'),dtype:'float32',shape:[weightBytes/4]};
const server=createServer(async(req,res)=>{try{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>D2PRL useful allocation recovery</title>');return;}if(name==='/weight-72m.bin'){res.setHeader('Content-Length',weightBytes);for(let i=0;i<weightBytes;i+=chunk.length)if(!res.write(chunk))await once(res,'drain');res.end();return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('outside');res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{browser=await ({chromium,firefox,webkit}[kind]).launch({headless:true,...(kind==='chromium'?{channel:'chrome'}:{})});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);const result=await page.evaluate(spec=>new Promise((resolve,reject)=>{const worker=new Worker('/tests/d2prl-parameter-checkpoint-browser-worker.js',{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(JSON.stringify(data.error))):resolve(data.result);};worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.postMessage({spec});}),spec);console.log(JSON.stringify({browser:kind,result}));}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
