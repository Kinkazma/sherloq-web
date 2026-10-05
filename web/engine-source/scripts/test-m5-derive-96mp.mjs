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
const attempt=await fs.mkdtemp(path.join(directory,'derive-attempt-')),frozen=await freezeBrowserRuntime(root,attempt),extra=[];
for(const name of ['tests/m5-derive-96mp-browser.js','tests/source-api-browser.js','docs/m5-derive-96mp-native-reference.json']){
 const target=path.join(attempt,'runtime',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,name),target);frozen.files.set('/'+name,target);
 const bytes=await fs.readFile(target);extra.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const binding={engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:frozen.proof,extra};
await fs.writeFile(path.join(attempt,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const reference=JSON.parse(await fs.readFile(path.join(root,'docs/m5-derive-96mp-native-reference.json')));let outputProof;
const outputFile=path.join(directory,'m5-derived-96mp.bin');
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/derived-output'&&req.method==='POST'){
  const hash=createHash('sha256'),handle=await fs.open(outputFile,'w');let bytes=0;
  try{for await(const chunk of req){bytes+=chunk.length;if(bytes>reference.derivedBytes)throw Error('Oversized derived output');hash.update(chunk);await handle.writeFile(chunk);}}finally{await handle.close();}
  const sha256=hash.digest('hex');if(bytes!==reference.derivedBytes||sha256!==reference.derivedSha256)throw Error('Independent full output mismatch');outputProof={bytes,sha256,fullRead:true};res.statusCode=204;return res.end();
 }
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>M5 derive96MP</title>');}
 const file=name==='/derive-original'?path.resolve(root,'../web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'):frozen.files.get(name==='/derive-reference'?'/docs/m5-derive-96mp-native-reference.json':name);
 if(!file)throw Error('Unfrozen runtime request');
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',(await fs.stat(file)).size);createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,profile;
try{
 profile=await fs.mkdtemp(path.join(directory,'browser-derive96-'));browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('console',message=>console.log(message.text()));page.on('pageerror',error=>console.error(error));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const proof=await page.evaluate(async()=>{const {testDerive96mp}=await import('/tests/m5-derive-96mp-browser.js');return testDerive96mp();});
 if(!outputProof)throw Error('No derived output delivered');Object.assign(proof,{independentDelivery:outputProof},binding,{browser:browser.browser().version(),storageContext:'fresh persistent Chrome profile removed after qualification'});
 await fs.writeFile(path.join(root,'docs/m5-derive-96mp-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,memory:proof.finalMemory,derived:proof.derived}));
}catch(error){await fs.writeFile(path.join(attempt,'incomplete.json'),JSON.stringify({passed:false,binding,error:{message:error.message,stack:error.stack}},null,2)+'\n');throw error;
}finally{await browser?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
