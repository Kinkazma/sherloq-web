// Synthetic engine qualification, separate from the user's live browser/images.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const base=process.env.OFFLINE_URL,results=[];
if(!base)throw Error('Set OFFLINE_URL to the base URL printed by your test launcher (ending with /).');
for(const kind of (process.env.BROWSER?[process.env.BROWSER]:['chrome','webkit'])){
 const browser=await playwright[kind==='chrome'?'chromium':kind].launch({headless:true,...(kind==='chrome'?{channel:'chrome'}:{})});
 try{
  const context=await browser.newContext(),page=await context.newPage(),external=[],errors=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(base).origin){external.push(route.request().url());return route.abort();}return route.continue();});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'app.html#lang=fr');await page.waitForSelector('[data-workspace-ready="true"]',{state:'attached',timeout:60000});
  assert.equal(await page.locator('#offline-kit-button').textContent(),'Hors ligne');
  const result=await page.evaluate(async()=>{
   const {createWorkerEngine}=await import('./unified-engine/src/worker-client.js'),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
   try{
    const data=Uint8Array.from({length:67*65*3},(_,i)=>i*29),source=await engine.load({id:'offline-synthetic',bytes:Uint8Array.of(1),pixels:{width:67,height:65,format:'rgb8',data}});
    const input=await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile:{x:0,y:0,w:67,h:65,step:1}});
    const gradient=await engine.run({id:'offline-gradient',imageId:'offline-synthetic',operation:'detail.gradient',params:{mode:3,equalize:false}});
    const output=gradient.surface?await engine.readPixels({surfaceId:gradient.surface.id,revision:gradient.surface.revision}):gradient;
    const exported=await engine.exportSurface({surfaceId:source.surface.id,revision:source.surface.revision,format:'webp',lossless:true});
    const header=await engine.readExport({exportId:exported.id,revision:1,offset:0,length:16});
    const wasm=new URL('./unified-engine/vendor/gradient/gradient.wasm',location.href);const range=await fetch(wasm,{headers:{Range:'bytes=0-7'}});
    return {isolated:crossOriginIsolated,sharedMemory:typeof SharedArrayBuffer!=='undefined',inputExact:input.pixels.data.every((x,i)=>x===data[i]),gradientBytes:output.pixels.data.length,webpBytes:exported.byteLength,webpMagic:new TextDecoder().decode(header.bytes.slice(0,4)),rangeStatus:range.status,rangeBytes:[...new Uint8Array(await range.arrayBuffer())],engineVersion:(await engine.capabilities()).version};
   }finally{await engine.dispose();}
  });
  assert.equal(result.isolated,true);assert.equal(result.sharedMemory,true);assert.equal(result.inputExact,true);assert.equal(result.gradientBytes,67*65*3);assert.equal(result.webpMagic,'RIFF');assert.equal(result.rangeStatus,206);assert.deepEqual(result.rangeBytes,[0,97,115,109,1,0,0,0]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const record={browser:kind,version:browser.version(),...result,externalRequests:external.length,pageErrors:errors};results.push(record);console.log(JSON.stringify(record));
 }finally{await browser.close();}
}
await fs.writeFile(new URL('../.build/offline-candidate/'+(process.env.BROWSER?'browser-'+process.env.BROWSER+'-proof.json':'browser-proof.json'),import.meta.url),JSON.stringify({scope:'Native local helper, full standard archive, synthetic input; all non-loopback browser requests forbidden. No user image or live browser session.',results},null,2)+'\n');
