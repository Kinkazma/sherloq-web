// Isolated automated qualification. No live browser profile or user image.
// Requires a prepared candidate and standard archive; never contacts GitHub.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {offlineMime} from '../sherloq-browser/assets/offline-browser-store.js';
const require=createRequire(import.meta.url),playwright=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(process.env.OFFLINE_CANDIDATE||'.build/offline-browser-candidate'),assets=path.join(root,'preview/sherloq-browser/assets'),archive=path.resolve(process.env.OFFLINE_ARCHIVE||'.build/offline-candidate/SHERLOQ-complet.tar');
const kind=process.env.BROWSER||'chrome',external=[],errors=[],requests=[],engineResults=[];
const fixture=`<!doctype html><html lang="fr"><header class="app-toolbar"><span class="toolbar-spacer"></span></header><script type="module">const c=await(await fetch('./dependency-config.json')).json();const {mountOfflineControls}=await import('./offline-kit-ui.js');mountOfflineControls(document,c);</script>`;
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(assets,name);requests.push(name);
 if(!file.startsWith(assets+path.sep))throw Error('path');
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 if(name==='fixture.html'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 const stat=await fs.stat(file);res.setHeader('Content-Length',stat.size);res.setHeader('Content-Type',offlineMime(name));createReadStream(file).pipe(res);
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
const profile=await fs.mkdtemp(path.join(root,kind+'-profile-'));let context,timer;
async function launch(){const c=await playwright[kind==='chrome'?'chromium':kind].launchPersistentContext(profile,{headless:true,acceptDownloads:true,...(kind==='chrome'?{channel:'chrome'}:{})});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 c.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 await c.route(url=>url.origin!==new URL(base).origin,route=>route.abort());return c;}
async function engineCheck(page){
 await page.waitForSelector('[data-workspace-ready="true"]',{state:'attached',timeout:90000});
 assert.equal(await page.locator('#offline-kit-button').textContent(),'Hors ligne');
 const result=await page.evaluate(async()=>{
  const {createWorkerEngine}=await import('./unified-engine/src/worker-client.js'),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
  try{const data=Uint8Array.from({length:67*65*3},(_,i)=>i*29),source=await engine.load({id:'pwa-synthetic',bytes:Uint8Array.of(1),pixels:{width:67,height:65,format:'rgb8',data}});
   const input=await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile:{x:0,y:0,w:67,h:65,step:1}});
   const gradient=await engine.run({id:'pwa-gradient',imageId:'pwa-synthetic',operation:'detail.gradient',params:{mode:3,equalize:false}});
   const output=gradient.surface?await engine.readPixels({surfaceId:gradient.surface.id,revision:gradient.surface.revision}):gradient;
   const exported=await engine.exportSurface({surfaceId:source.surface.id,revision:source.surface.revision,format:'webp',lossless:true}),header=await engine.readExport({exportId:exported.id,revision:1,offset:0,length:16});
   const archiveHead=await fetch('./__dependency_download__/kit.tar',{method:'HEAD'});
   const range=await fetch('./unified-engine/vendor/gradient/gradient.wasm',{headers:{Range:'bytes=0-7'}});
   return {archiveHeadStatus:archiveHead.status,isolated:crossOriginIsolated,sharedMemory:typeof SharedArrayBuffer!=='undefined',inputExact:input.pixels.data.every((x,i)=>x===data[i]),gradientBytes:output.pixels.data.length,webpBytes:exported.byteLength,webpMagic:new TextDecoder().decode(header.bytes.slice(0,4)),rangeStatus:range.status,rangeBytes:[...new Uint8Array(await range.arrayBuffer())],engineVersion:(await engine.capabilities()).version};
  }finally{await engine.dispose();}
 });
 assert.equal(result.archiveHeadStatus,200);assert.equal(result.isolated,true);assert.equal(result.sharedMemory,true);assert.equal(result.inputExact,true);assert.equal(result.gradientBytes,67*65*3);assert.equal(result.webpMagic,'RIFF');assert.equal(result.rangeStatus,206);assert.deepEqual(result.rangeBytes,[0,97,115,109,1,0,0,0]);engineResults.push(result);
}
try{
 context=await launch();const page=await context.newPage();await page.goto(base+'fixture.html');
 const popup=context.waitForEvent('page');await page.locator('#offline-kit-button').click();const setup=await popup;await setup.waitForLoadState();
 await setup.waitForFunction(()=>document.getElementById('choose')&&!document.getElementById('choose').disabled);
 await setup.locator('#archive').setInputFiles(archive);await setup.waitForFunction(()=>document.querySelector('#status').textContent.includes('Archive connectée'),{},{timeout:120000});
 timer=setInterval(()=>setup.locator('#status').textContent().then(s=>console.log(s)).catch(()=>{}),20000);
 await setup.locator('#prepare').click();await setup.waitForFunction(()=>!document.querySelector('#open').hidden||document.querySelector('#status').textContent.startsWith('Impossible'),{},{timeout:900000});
 clearInterval(timer);assert.equal(await setup.locator('#open').isVisible(),true,await setup.locator('#status').textContent());
 // A root page is outside the nested worker scope. Check readiness from the app.
 await setup.locator('#open').click();await engineCheck(setup);
 const status=await setup.evaluate(async()=>await(await fetch('./__offline-status.json')).json());assert.equal(status.complete,true);
 if(kind==='chrome'){
  const session=await context.newCDPSession(setup);const {installabilityErrors:installability}=await session.send('Page.getInstallabilityErrors');assert.deepEqual(installability,[]);
 }
 const version=context.browser()?.version();await context.clearCookies();await context.close();context=null;
 await new Promise(r=>server.close(r));console.log('Server stopped; reopening the saved browser profile without a network.');
 context=await launch();if(kind!=='webkit')await context.setOffline(true);const cold=await context.newPage();await cold.goto(base+'offline/app.html#lang=fr');await engineCheck(cold);
 // Remove one resource. Startup must refuse a false complete status and repair
 // from the selected archive, without registering/downloading another SW.
 const removed=await cold.evaluate(async()=>{const m=await(await fetch('./__manifest.json')).json(),config=await(await fetch('./dependency-config.json')).json(),h=m.files['unified-engine/vendor/gradient/gradient.wasm'].chunks[0],cache=await caches.open('sherloq-dependency-chunks-v1');await cache.delete(new URL('__dependency_chunks__/'+h,config.sourceBase));return h;});
 await cold.reload();await cold.waitForURL(u=>u.pathname.endsWith('/offline/offline-setup.html'));await cold.locator('#archive').setInputFiles(archive);await cold.waitForFunction(()=>document.querySelector('#status').textContent.includes('Archive connectée'),{},{timeout:120000});
 if(process.env.EXPORT_OFFLINE){const pending=cold.waitForEvent('download',{timeout:120000});await cold.locator('#download').click();const download=await pending;await download.saveAs(path.join(root,'pwa-'+kind+'-export.tar'));assert.equal(await download.failure(),null);await cold.waitForFunction(()=>!document.getElementById('prepare').disabled);}
 await cold.locator('#prepare').click();await cold.waitForFunction(()=>!document.querySelector('#open').hidden||document.querySelector('#status').textContent.startsWith('Impossible'),{},{timeout:900000});assert.equal(await cold.locator('#open').isVisible(),true,await cold.locator('#status').textContent());
 await cold.locator('#open').click();await engineCheck(cold);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 const proof={schema:'sherloq.pwa-check/1',browser:kind,version,externalRequests:external.length,pageErrors:errors,serverRequests:requests.length,status,removedAndRestoredChunk:removed,offlineArchiveReexported:!!process.env.EXPORT_OFFLINE,engineResults,steps:['real toolbar opens installer','existing full standard archive reused','all chunks verified and persisted','public PWA manifest installability (Chrome only)','cookies cleared','browser fully closed','server stopped',kind==='webkit'?'server unavailable; external requests forbidden (WebKit offline emulation bypasses SW)':'network disabled','cold start from saved profile','synthetic gradient and lossless WebP','missing chunk refuses ready, restored from archive offline']};
 await fs.writeFile(path.join(root,'pwa-'+kind+'-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(e){console.error('PAGE ERRORS',errors,'EXTERNAL REQUESTS',external);if(context)for(const p of context.pages())console.error(p.url(),await p.locator('body').innerText().catch(()=>''));throw e;}
finally{clearInterval(timer);await context?.close();server.close();if(!process.env.KEEP_TEST_PROFILE)await fs.rm(profile,{recursive:true,force:true});}
