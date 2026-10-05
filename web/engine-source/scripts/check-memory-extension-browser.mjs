// Installs only into a disposable validation profile, never the user's Chrome.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),profile=await mkdtemp(path.join(root,'.build/memory-extension-'));
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<title>Memory bridge qualification</title>');return;}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(path.join(root,'src')+path.sep))throw Error('path');res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:path.join(root,'extensions/memory-bridge')});
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async id=>{const {readExtensionMemoryHints}=await import('/src/browser-memory.js'),{resolveComputeProfile}=await import('/src/profiles.js');const hints=await readExtensionMemoryHints(id);return {hints,profile:resolveComputeProfile('maximum',{...hints,hardwareConcurrency:navigator.hardwareConcurrency})};},id);
 assert.ok(result.hints.systemMemoryCapacityBytes>0);assert.ok(result.hints.systemMemoryAvailableBytes>=0);assert.equal(result.profile.memoryBudgetSource,'system-available-snapshot');
 console.log(JSON.stringify({passed:true,browser:context.browser().version(),...result,scope:'Fresh throwaway profile; metadata only; extension not installed into user profile.'}));
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
