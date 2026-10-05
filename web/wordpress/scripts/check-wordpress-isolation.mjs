import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {chromium}=createRequire(new URL('../../web-engine-clone-panel-api/package.json',import.meta.url))('playwright');
import assert from 'node:assert/strict';
const delivery=path.resolve(process.env.DELIVERY||'.build/github-wordpress-0.14.2'),receipt=JSON.parse(await fs.readFile(path.join(delivery,'private/receipt.json'))),archive=path.join(delivery,'private',receipt.installer),unpacked=await fs.mkdtemp(path.join(delivery,'zip-verification-'));
assert.equal(createHash('sha256').update(await fs.readFile(archive)).digest('hex'),receipt.sha256);
execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',archive,unpacked]);
const root=path.join(unpacked,'sherloq-browser');
await fs.writeFile(path.join(root,'parent.php'),`<?php
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Embedder-Policy: require-corp');
?><!doctype html><iframe src="assets/<?php echo isset($_GET['legacy']) ? 'app.html' : 'app.php'; ?>#lang=auto"></iframe>`);
await fs.writeFile(path.join(root,'assets/isolation-probe.js'),"self.postMessage({isolated:crossOriginIsolated,shared:typeof SharedArrayBuffer==='function'})");
const container='sherloq-private-0142-check';
execFileSync('docker',['run','-d','--rm','--name',container,'-p','127.0.0.1::8080','--mount',`type=bind,src=${root},dst=/fixture,readonly`,'--entrypoint','php','wordpress:php8.3-apache','-S','0.0.0.0:8080','-t','/fixture']);
const mapping=execFileSync('docker',['port',container,'8080/tcp'],{encoding:'utf8'}).trim(),origin='http://'+mapping;
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const legacy=await browser.newContext(),legacyPage=await legacy.newPage(),blocked=[];
 legacyPage.on('requestfailed',r=>blocked.push(r.failure()?.errorText));
 await legacyPage.goto(origin+'/parent.php?legacy=1');
 assert.ok(blocked.some(x=>x.includes('ERR_BLOCKED_BY_RESPONSE')),JSON.stringify(blocked));await legacy.close();
 const context=await browser.newContext({locale:'fr-FR'}),page=await context.newPage(),errors=[],remote=[];
 page.on('pageerror',e=>errors.push(e.message));context.on('response',r=>{if(r.url().startsWith(receipt.origin))remote.push({url:r.url(),status:r.status()});});
 await page.goto(origin+'/parent.php');const frame=await(await page.waitForSelector('iframe')).contentFrame();await frame.waitForSelector('#global-loupe',{state:'attached',timeout:90000});const startupRemote=remote.length;
 assert.equal(await frame.evaluate(()=>document.documentElement.lang),'fr');
 const isolation=await frame.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('./isolation-probe.js');w.onmessage=e=>{w.terminate();resolve({page:crossOriginIsolated,worker:e.data});};w.onerror=e=>{w.terminate();reject(Error(e.message));};}));
 assert.deepEqual(isolation,{page:true,worker:{isolated:true,shared:true}});
 const english=await browser.newContext({locale:'en-US'}),englishPage=await english.newPage();await englishPage.goto(origin+'/parent.php');const englishFrame=await(await englishPage.waitForSelector('iframe')).contentFrame();await englishFrame.waitForSelector('#global-loupe',{state:'attached',timeout:90000});assert.equal(await englishFrame.evaluate(()=>document.documentElement.lang),'en');await english.close();
 const proof=await frame.evaluate(async()=>{
  const {createWorkerEngine}=await import('./unified-engine/src/worker-client.js'),engine=createWorkerEngine({memoryBudgetBytes:768*1024**2});
  try{
   const pixels={width:96,height:72,format:'rgb8',data:new Uint8Array(96*72*3).fill(90)},source=await engine.load({id:'test',bytes:Uint8Array.of(1),pixels});
   const window=await engine.readPixels({surfaceId:source.surface.id,revision:source.surface.revision});if(!window.pixels.data.every(v=>v===90))throw Error('pixels');
   const webp=await engine.exportSurface({surfaceId:source.surface.id,revision:1,format:'webp',lossless:true}),head=await engine.readExport({exportId:webp.id,revision:1,length:16});
   if(String.fromCharCode(...head.bytes.slice(0,4))!=='RIFF')throw Error('WebP');
   const {renderSparseCopy}=await import('./unified-engine/src/sparse-copy-view.js');const points=new Float32Array(8*7),pairs=new Float64Array(16);
   for(let i=0;i<4;i++){const x=8+i%2*16,y=10+Math.floor(i/2)*16;points.set([x,y,7,0,1,0,0],i*7);points.set([x+48,y+20,7,0,1,0,0],(i+4)*7);pairs.set([i,i+4,.1,52],i*4);}
   const raw={points,pairs,colors:new Uint8Array(12).fill(180),groups:[new Uint32Array([0,1,2,3])],bases:[[20,160,240]]};
   const render=await renderSparseCopy(pixels,raw,{areas:true,circles:false,lines:false},{reserveMemory:()=>{}});
   if(render.visible.length!==1||!render.pixels.data.some(v=>v!==90))throw Error('dense rendering');
   return {version:(await engine.capabilities()).version,exactPixels:true,webpBytes:webp.byteLength,denseFloat32Rendered:true,uiVersion:document.querySelector('#app-version').textContent};
  }finally{await engine.dispose();}
 });
 assert.equal(proof.version,'0.35.0-export.2');assert.equal(proof.uiVersion,'0.14.2');assert.equal(startupRemote,0);assert.ok(remote.length>0);assert.ok(remote.every(r=>r.status===200));assert.deepEqual(errors,[]);
 const result={date:new Date().toISOString(),installer:receipt.installer,zipSha256:receipt.sha256,origin:receipt.origin,browser:browser.version(),startupRemoteRequests:startupRemote,remoteRequests:remote.length,checks:proof,language:['fr-FR → fr','en-US → en'],legacyBlocked:blocked,isolation,pageErrors:errors,scope:'Extracted private ZIP served by PHP with no static COEP headers, inside isolated iframe; fresh Chrome profiles; dependencies downloaded from actual pinned GitHub origin. Synthetic pixels and native dense drawing. Not a deployment test of the live WordPress host.'};
 await fs.writeFile(path.join(delivery,'private/published-browser-proof.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();execFileSync('docker',['stop',container]);await fs.rm(unpacked,{recursive:true,force:true});}
