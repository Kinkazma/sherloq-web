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
const attempt=await fs.mkdtemp(path.join(directory,'formats-attempt-')),frozen=await freezeBrowserRuntime(root,attempt),extra=[];
for(const name of ['tests/m5-formats-96mp-browser.js','tests/source-api-browser.js','docs/m5-formats-96mp-native-reference.json']){
 const target=path.join(attempt,'runtime',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,name),target);frozen.files.set('/'+name,target);
 extra.push({file:name,sha256:createHash('sha256').update(await fs.readFile(target)).digest('hex')});
}
const binding={engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:frozen.proof,extra};
await fs.writeFile(path.join(attempt,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const parts=[0,1].map(index=>path.join(attempt,index+'.png.part')),handles=await Promise.all(parts.map(part=>fs.open(part,'w'))),delivered=[0,0];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(name==='/png-part'&&req.method==='POST'){
  const index=Number(url.searchParams.get('index'));if(![0,1].includes(index)||Number(url.searchParams.get('offset'))!==delivered[index])throw Error('PNG offset');let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>4*1024**2)throw Error('PNG chunk size');chunks.push(chunk);}
  await handles[index].writeFile(Buffer.concat(chunks));delivered[index]+=size;res.statusCode=204;return res.end();
 }
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>M5 formats96MP</title>');}
 const sourceFiles=['adam7-rgb16.png','tiles-rgb16-bigtiff.tiff'];const file=sourceFiles.some(file=>name==='/format/'+file)?path.join(directory,'formats-96mp',name.slice(8)):frozen.files.get(name==='/formats-reference'?'/docs/m5-formats-96mp-native-reference.json':name);
 if(!file)throw Error('Unfrozen runtime request: '+name);
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',(await fs.stat(file)).size);createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,profile;
try{
 profile=await fs.mkdtemp(path.join(directory,'browser-formats96-'));browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('console',message=>console.log(message.text()));page.on('pageerror',error=>console.error(error));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const proof=await page.evaluate(async()=>{const {testFormats96mp}=await import('/tests/m5-formats-96mp-browser.js');return testFormats96mp();});
 for(let index=0;index<2;index++){if(delivered[index]!==proof.cases[index].archive.byteLength)throw Error('Incomplete PNG');await handles[index].close();await fs.rename(parts[index],path.join(directory,'m5-formats-96mp-'+index+'.png'));}
 Object.assign(proof,binding,{browser:browser.browser().version(),storageContext:'fresh persistent Chrome profile removed after qualification'});
 await fs.writeFile(path.join(root,'docs/m5-formats-96mp-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,cases:proof.cases.map(item=>({file:item.file,times:item.times,memory:item.finalMemory,archive:item.archive}))}));
}catch(error){await fs.writeFile(path.join(attempt,'incomplete.json'),JSON.stringify({passed:false,binding,delivered,error:{message:error.message,stack:error.stack}},null,2)+'\n');throw error;
}finally{await Promise.all(handles.map(handle=>handle.close()));await browser?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
