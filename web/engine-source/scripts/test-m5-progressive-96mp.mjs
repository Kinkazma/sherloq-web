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
const variant=process.env.M5_PROGRESSIVE_VARIANT??'';if(!/^[a-z0-9-]*$/.test(variant))throw Error('Invalid proof variant');const basename='m5-progressive-96mp'+(variant?'-'+variant:'');
await fs.mkdir(directory,{recursive:true});
const attempt=await fs.mkdtemp(path.join(directory,'progressive-attempt-')),frozen=await freezeBrowserRuntime(root,attempt),extra=[];
for(const name of ['tests/m5-progressive-96mp-browser.js','tests/source-api-browser.js','docs/m5-progressive-96mp-native-reference.json']){
 const target=path.join(attempt,'runtime',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,name),target);frozen.files.set('/'+name,target);
 extra.push({file:name,sha256:createHash('sha256').update(await fs.readFile(target)).digest('hex')});
}
const binding={engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:frozen.proof,extra};
await fs.writeFile(path.join(attempt,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const part=path.join(attempt,'original.png.part'),handle=await fs.open(part,'w');let delivered=0;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(name==='/png-part'&&req.method==='POST'){
  if(Number(url.searchParams.get('offset'))!==delivered)throw Error('PNG offset');let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>4*1024**2)throw Error('PNG chunk size');chunks.push(chunk);}
  await handle.writeFile(Buffer.concat(chunks));delivered+=size;res.statusCode=204;return res.end();
 }
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>M5 progressive96MP</title>');}
 const file=name==='/progressive-original'?path.join(directory,'progressive-96mp/source.jpg'):frozen.files.get(name==='/progressive-reference'?'/docs/m5-progressive-96mp-native-reference.json':name);
 if(!file)throw Error('Unfrozen runtime request: '+name);
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',(await fs.stat(file)).size);createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,profile;
try{
 profile=await fs.mkdtemp(path.join(directory,'browser-progressive96-'));browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('console',message=>console.log(message.text()));page.on('pageerror',error=>console.error(error));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const proof=await page.evaluate(async variant=>{const {testProgressive96mp}=await import('/tests/m5-progressive-96mp-browser.js');return testProgressive96mp({requireOrientationCache:variant==='oriented-cache'});},variant);
 if(delivered!==proof.archive.byteLength)throw Error('Incomplete PNG');await handle.close();await fs.rename(part,path.join(directory,basename+'.png'));
 Object.assign(proof,binding,{browser:browser.browser().version(),storageContext:'fresh persistent Chrome profile removed after qualification'});
 await fs.writeFile(path.join(root,'docs',basename+'-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,memory:proof.finalMemory,archive:proof.archive}));
}catch(error){await fs.writeFile(path.join(attempt,'incomplete.json'),JSON.stringify({passed:false,binding,delivered,error:{message:error.message,stack:error.stack}},null,2)+'\n');throw error;
}finally{await handle.close();await browser?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
