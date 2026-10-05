import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {freezeBrowserRuntime} from './freeze-browser-runtime.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.build/integration');
await fs.mkdir(directory,{recursive:true});
const attempt=await fs.mkdtemp(path.join(directory,'dct-contiguous-attempt-')),frozen=await freezeBrowserRuntime(root,attempt),extra=[];
for(const name of ['tests/m5-dct-contiguous-browser.js','tests/dct-no-opfs-worker.js','tests/source-api-browser.js','docs/m5-dct-contiguous-native-reference.json']){
 const target=path.join(attempt,'runtime',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,name),target);frozen.files.set('/'+name,target);
 const bytes=await fs.readFile(target);extra.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const binding={engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:frozen.proof,extra};
await fs.writeFile(path.join(attempt,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>M5 contiguous DCT IndexedDB regression</title>');}
 const file=name==='/dct-original'?path.join(directory,'dct-contiguous/source.jpg'):frozen.files.get(name==='/dct-reference'?'/docs/m5-dct-contiguous-native-reference.json':name);
 if(!file)throw Error('Unfrozen runtime request');
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',(await fs.stat(file)).size);createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,profile;
try{
 profile=await fs.mkdtemp(path.join(directory,'browser-dct-contiguous-'));browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('console',message=>console.log(message.text()));page.on('pageerror',error=>console.error(error));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const proof=await page.evaluate(async()=>{const {testContiguousDct}=await import('/tests/m5-dct-contiguous-browser.js');return testContiguousDct();});
 Object.assign(proof,binding,{browser:browser.browser().version(),storageContext:'fresh persistent Chrome profile removed after qualification'});
 await fs.writeFile(path.join(root,'docs/m5-dct-contiguous-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,memory:proof.finalMemory,export:proof.export}));
}catch(error){await fs.writeFile(path.join(attempt,'incomplete.json'),JSON.stringify({passed:false,binding,error:{message:error.message,stack:error.stack}},null,2)+'\n');throw error;
}finally{await browser?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
