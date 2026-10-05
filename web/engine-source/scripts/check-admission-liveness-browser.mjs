// Development regression only; no production calibration or capacity probes.
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),name=process.env.RUNTIME_BROWSER??'chrome',launcher={chrome:chromium,firefox,webkit}[name];
if(!launcher)throw Error('Unknown browser');
const server=createServer(async(request,response)=>{
 try{if(request.url==='/'){response.end('<!doctype html><title>Admission liveness</title>');return;}
  const file=resolve(root,'.'+new URL(request.url,'http://local').pathname);if(!file.startsWith(resolve(root)+sep))throw Error('path');
  response.setHeader('Content-Type','text/javascript');response.end(await readFile(file));
 }catch{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await launcher.launch(name==='chrome'?{channel:'chrome',headless:true}:{headless:true});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const worker=new Worker('/tests/admission-liveness-browser-worker.js',{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(Error('Worker messages were starved by admission'));},10000);
  worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.passed?resolve(data):reject(Error(data.stack??data.message));};
  worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(Error(event.message));};
 }));
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
