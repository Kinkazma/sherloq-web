// Exercise the actual offline dialog and its service-worker streaming export.
// No user images or existing browser profile; the fixture omits engine startup.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {offlineMime} from '../sherloq-browser/assets/offline-browser-store.js';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(process.env.OFFLINE_CANDIDATE||'.build/offline-browser-candidate'),assets=path.join(root,'preview/sherloq-browser/assets'),external=[],errors=[];
const fixture=`<!doctype html><html lang="fr"><header class="app-toolbar"><span class="toolbar-spacer"></span></header><script type="module">
const c=await(await fetch('./dependency-config.json')).json();
const {mountOfflineControls}=await import('./offline-kit-ui.js');mountOfflineControls(document,c);
</script>`;
const server=http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(assets,pathname);
 if(!file.startsWith(assets+path.sep))throw Error('path');
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 if(pathname==='fixture.html'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 const stat=await fs.stat(file);res.setHeader('Content-Length',stat.size);res.setHeader('Content-Type',offlineMime(pathname));createReadStream(file).pipe(res);
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
let browser;
try{
 browser=await playwright.chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({acceptDownloads:true});
 await context.route(url=>url.origin!==new URL(base).origin,route=>{external.push(route.request().url());return route.abort();});
 context.on('request',request=>{if(new URL(request.url()).origin!==new URL(base).origin&&!external.includes(request.url()))external.push(request.url());});
 const original=await context.newPage();original.on('pageerror',e=>errors.push(e.message));await original.goto(base+'fixture.html');const popup=context.waitForEvent('page');await original.locator('#offline-kit-button').click();const page=await popup;page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>document.getElementById('choose')&&!document.getElementById('choose').disabled);
 await page.locator('#archive').setInputFiles(path.resolve(process.env.OFFLINE_ARCHIVE||'.build/offline-candidate/SHERLOQ-complet.tar'));
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Archive connectée'),{},{timeout:120000});
 const pending=page.waitForEvent('download',{timeout:120000});await page.locator('#download').click();const download=await pending;
 assert.equal(download.suggestedFilename(),'SHERLOQ-complet.tar');const timer=setInterval(async()=>console.log(await page.locator('#status').textContent()),15000);
 try{await download.saveAs(path.join(root,'UI-built.tar'));assert.equal(await download.failure(),null);}catch(e){console.error(JSON.stringify({status:await page.locator('#status').textContent(),external,errors}));throw e;}finally{clearInterval(timer);}
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 const proof={schema:'sherloq.offline-download-check/1',browser:browser.version(),archiveBytes:(await fs.stat(path.join(root,'UI-built.tar'))).size,externalRequests:external.length,pageErrors:errors,steps:['select full existing archive','open browser installation flow','stream complete archive through actual service worker without remote fetch']};
 await fs.writeFile(path.join(root,'download-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(e){if(browser)for(const c of browser.contexts())for(const p of c.pages())console.error(p.url(),await p.locator('body').innerText().catch(()=>''));throw e;}finally{await browser?.close();server.close();}
