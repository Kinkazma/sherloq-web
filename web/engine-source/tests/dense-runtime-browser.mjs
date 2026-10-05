import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));let isolated=true;
const server=createServer(async(request,response)=>{try{if(isolated){response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');}const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Dense runtime parity</title>');return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('outside');response.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(await fs.readFile(file));}catch{response.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});for(const mode of [true,false]){isolated=mode;const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);const result=await page.evaluate(()=>new Promise((resolve,reject)=>{const worker=new Worker('/tests/dense-runtime-browser-worker.js',{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(JSON.stringify(data.error))):resolve(data.result);};worker.onerror=event=>reject(Error(event.message));worker.postMessage({});}));console.log(JSON.stringify(result));await page.close();}}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
