// Reproduce the live failure using the old installed worker, restart its
// process after replacement, then verify the packaged update in the same
// persistent Chrome profile. No user tab, image or browser profile is touched.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const [previous,current,out]=process.argv.slice(2).map(p=>path.resolve(p));
if(!out)throw Error('Pass previous assets, corrected assets and proof directory');
await fs.mkdir(out,{recursive:true});
const oldHash='d1a3950258a58e242d6ce460b6b02d58281e87fa76318f77e96cc33c14b3fa4b';
let phase='legacy';
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname).replace(/^\/assets\//,'');
  if(!url.pathname.startsWith('/assets/')||name.includes('..')){res.writeHead(404);return res.end();}
  if(name==='probe.html'){
   res.writeHead(200,{...headers,'Content-Type':'text/html'});
   return res.end(`<title>Migration fixture</title><script>
   navigator.serviceWorker.register('./dependency-sw.js?manifest=${oldHash}&release=0.14.5',{scope:'./',updateViaCache:'none'}).then(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));document.title='Legacy controlled';});</script>`);
  }
  if(name.startsWith('dependency-manifest-')&&(phase==='broken'||phase==='retained-only')){res.writeHead(404,headers);return res.end('Removed by directory replacement');}
  const file=name==='app.php'?'app.html':name;
  const base=name==='dependency-sw.js'&&phase!=='corrected'&&phase!=='retained-only'?previous:current;
  const bytes=await fs.readFile(path.join(base,file));
  res.writeHead(200,{...headers,'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404,headers);res.end('Missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'sherloq-worker-migration-'));
let browser;const proof={schema:'sherloq.dependency-migration/1',date:new Date().toISOString()};
try{
 const launch=()=>chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',locale:'fr-FR'});
 browser=await launch();let page=browser.pages()[0];
 await page.goto(origin+'/assets/probe.html');await page.waitForFunction(()=>document.title==='Legacy controlled');
 proof.installedLegacyWorker=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
 await browser.close();browser=null;phase='broken';
 browser=await launch();page=browser.pages()[0];let failure;
 try{await page.goto(origin+'/assets/app.php');}catch(error){failure=error.message;}
 assert.match(failure||'',/ERR_FAILED/);proof.originalFailureReproduced=failure;
 await browser.close();browser=null;phase='corrected';
 browser=await launch();page=browser.pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/assets/app.php');await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true',{},{timeout:90000});
 proof.version=await page.locator('#app-version').textContent();assert.equal(proof.version,'0.15.2');
 proof.updatedWorker=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);assert.match(proof.updatedWorker,/release=0\.15\.2/);
 assert.deepEqual(errors,[]);proof.migratedExistingProfile=true;
 await browser.close();browser=null;phase='retained-only';
 browser=await launch();page=browser.pages()[0];
 await page.goto(origin+'/assets/app.php');await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true',{},{timeout:90000});
 proof.restartedWithAllServerManifestsMissing=true;proof.crossOriginIsolated=await page.evaluate(()=>crossOriginIsolated);assert.equal(proof.crossOriginIsolated,true);
 proof.retainedManifests=await page.evaluate(async()=>{const c=await caches.open('sherloq-dependency-manifests-v1');return (await c.keys()).map(r=>r.url);});assert.ok(proof.retainedManifests.some(u=>u.includes('ae8d78bb')));
 await fs.writeFile(path.join(out,'migration-browser-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});}
