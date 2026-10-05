// Isolated synthetic recipe: the app server has NO runtime/model directories.
// Every real engine byte must cross the second, CORS-enabled resource origin.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.resolve(root,process.env.DELIVERY||'.build/github-delivery-100mb');
const browsers=createRequire(new URL('../../web-engine-clone-panel-api/package.json',import.meta.url))('playwright'),kind=process.env.BROWSER||'chrome';
const counts={appBytes:0,remoteBytes:0,remoteRequests:0},remotePaths=[];let offline=false;
function serve(directory,remote=false){return createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 if(remote){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');if(offline){res.writeHead(503).end();return;}}
  const name=new URL(req.url,'http://localhost').pathname,filename=path.resolve(directory,'.'+name);if(!filename.startsWith(directory+path.sep))throw Error('path');
 if(name==='/favicon.ico'){res.writeHead(204).end();return;}
 const stat=await fs.stat(filename);if(!stat.isFile())throw Error('not a file');
 res.setHeader('Content-Type',/\.m?js$/.test(filename)?'text/javascript':filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':'application/octet-stream');
 res.setHeader('Content-Length',stat.size);if(remote){counts.remoteBytes+=stat.size;counts.remoteRequests++;remotePaths.push(name);}else counts.appBytes+=stat.size;
 createReadStream(filename).pipe(res);
 }catch{res.writeHead(404).end();}});}
const resources=serve(path.join(output,'public/web-assets'),true);await new Promise(r=>resources.listen(0,'127.0.0.1',r));
execFileSync('python3',['prepare-distribution.py','--output',output,'--finalize','--origin',`http://127.0.0.1:${resources.address().port}/`,'--local-test'],{cwd:root});
const app=serve(path.join(output,'private/sherloq-browser/assets'));await new Promise(r=>app.listen(0,'127.0.0.1',r));
const browser=await browsers[kind==='chrome'?'chromium':kind].launch({headless:true,...(kind==='chrome'?{channel:'chrome'}:{})});
let phase='startup';const watchdog=setTimeout(()=>{console.error('Dependency recipe timeout',phase,counts,remotePaths.slice(-8));void browser.close();},120000);
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text());});
 page.on('requestfailed',r=>console.log('Request failed',r.url(),r.failure()));
 await page.goto(`http://127.0.0.1:${app.address().port}/app.html#lang=fr`);
 await page.waitForSelector('#global-loupe',{state:'attached',timeout:90000});
 phase='engine';console.log('Startup',counts);
 assert.equal(await page.locator('#dependency-settings').count(),1);
 const startup={...counts};assert.ok(startup.appBytes+startup.remoteBytes<20_000_000,JSON.stringify(startup));
 const manifest=JSON.parse(await fs.readFile(path.join(output,'manifest-template.json'),'utf8'));
 const forbidden=new Set(Object.values(manifest.files).filter(f=>/onnx|octet-stream/.test(f.type)&&f.size>5_000_000).flatMap(f=>f.chunks));
 assert.ok(!remotePaths.some(p=>forbidden.has(p.split('/').pop().replace('.bin',''))),'No large model at startup');
 const largeName=Object.keys(manifest.files).find(n=>n.endsWith('.onnx')&&manifest.files[n].size>200_000_000),largeStart=100_000_000-8;
 const expectedHandle=await fs.open(path.join(root,'sherloq-browser/assets',largeName));const expected=Buffer.alloc(16);await expectedHandle.read(expected,0,16,largeStart);await expectedHandle.close();
 const beforeLarge=counts.remoteRequests;
 const largeRange=await page.evaluate(async({name,start})=>{const r=await fetch('./'+name,{headers:{Range:`bytes=${start}-${start+15}`}});return {status:r.status,data:[...new Uint8Array(await r.arrayBuffer())]};},{name:largeName,start:largeStart});
 assert.equal(largeRange.status,206);assert.deepEqual(largeRange.data,[...expected]);assert.equal(counts.remoteRequests-beforeLarge,2);
 const pixels=await page.evaluate(async()=>{
  const {createWorkerEngine}=await import('./unified-engine/src/worker-client.js'),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
  try{const bytes=Uint8Array.from({length:67*65*3},(_,i)=>i*29),source=await engine.load({id:'synthetic-dependency-delivery',bytes:Uint8Array.of(1),pixels:{width:67,height:65,format:'rgb8',data:bytes}});
   const read=await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile:{x:0,y:0,w:67,h:65,step:1}});
   if(!read.pixels.data.every((v,i)=>v===bytes[i]))throw Error('Source pixel mismatch');
   const exported=await engine.exportSurface({surfaceId:source.surface.id,revision:1,format:'webp',lossless:true});
   const page=await engine.readExport({exportId:exported.id,revision:1,offset:0,length:Math.min(64,exported.byteLength)});
   if(page.bytes.length<16)throw Error('Codec result missing');return {exactPixels:true,webpBytes:exported.byteLength,version:(await engine.capabilities()).version};
  }finally{await engine.dispose();}
 });
 // Reconnect an ordinary file directory after clearing the transport cache.
 // OPFS stands in for the user-picked handle in this isolated automated test.
 const localCopy=await page.evaluate(async()=>{
  const {libraryValue,saveLibraryFile,libraryFile}=await import('./dependency-store.js'),{readDependencyManifest}=await import('./dependency-library.js');
  const config=await(await fetch('./dependency-config.json')).json(),m=await readDependencyManifest(config),name='unified-engine/vendor/libjpeg/jpeg.wasm',f=m.files[name],raw=new Uint8Array(await(await fetch('./'+name)).arrayBuffer());
  const cache=await caches.open('sherloq-dependency-chunks-v1');let mode,stored;
  if(globalThis.showDirectoryPicker){
   const folder=await(await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-standard-library',{create:true});
   let at=0;await saveLibraryFile(folder,name,f,async h=>{const data=raw.slice(at,at+m.chunks[h]);at+=data.length;return data;});
   await libraryValue('folder',folder);stored=await(await libraryFile(folder,name)).getFile();
   for(const h of f.chunks)await cache.delete(new URL('./__dependency_chunks__/'+h,location.href).href);mode='remembered-folder';
  }else{
   stored=new File([raw],'jpeg.wasm');for(const h of f.chunks)await cache.delete(new URL('./__dependency_chunks__/'+h,location.href).href);
   const {importLibraryFile}=await import('./dependency-tar.js');await importLibraryFile(stored,f,m,(h,b)=>cache.put(new URL('./__dependency_chunks__/'+h,location.href).href,new Response(b)));mode='imported-standard-file';
  }
  return {ordinaryFile:stored.name,size:stored.size,mode};
 });
 const online={...counts};phase='offline';offline=true;
 const cached=await page.evaluate(async()=>{const r=await fetch('./unified-engine/vendor/libjpeg/jpeg.wasm');return r.ok&&(await r.arrayBuffer()).byteLength>8;});assert.ok(cached);
 // Cross-origin runtime has the right MIME even when served as a binary chunk.
 const transport=await page.evaluate(async()=>{
  const full=await fetch('./unified-engine/vendor/libjpeg/jpeg.wasm'),all=new Uint8Array(await full.arrayBuffer()),r=await fetch('./unified-engine/vendor/libjpeg/jpeg.wasm',{headers:{Range:'bytes=3-13'}}),range=new Uint8Array(await r.arrayBuffer());
  return {type:full.headers.get('content-type'),rangeStatus:r.status,rangeExact:range.every((v,i)=>v===all[i+3])&&range.length===11};
 });assert.equal(transport.type,'application/wasm');assert.equal(transport.rangeStatus,206);assert.ok(transport.rangeExact);
 assert.deepEqual(errors,[]);
 const tar=await page.evaluate(async()=>{const r=await fetch('./__dependency_download__/resources.tar?file=unified-engine/src/worker-client.js');if(!r.ok)throw Error('TAR download failed');const b=await r.arrayBuffer();return [...new Uint8Array(b)];});
 const tarPath=path.join(output,`standard-library-${kind}.tar`);await fs.writeFile(tarPath,Buffer.from(tar));
 execFileSync('python3',['-c',"import sys,tarfile; t=tarfile.open(sys.argv[1]); assert t.extractfile('unified-engine/src/worker-client.js').read()==open(sys.argv[2],'rb').read()",tarPath,path.join(root,'sherloq-browser/assets/unified-engine/src/worker-client.js')]);
 const proof={date:new Date().toISOString(),browser:browser.version(),startup,online,largeModelRange:{file:largeName,chunksFetched:2,exact:true},standardTar:true,offlineLocalLibrary:localCopy,transport,pixels,errors,scope:'Fresh automated browser, synthetic 67×65 pixels; no user image or existing application tab touched. Two local origins simulate published raw GitHub assets. Ordinary local file reused offline; standard TAR verified independently by Python.'};
 await fs.writeFile(path.join(output,`browser-${kind}-proof.json`),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}finally{clearTimeout(watchdog);await browser.close();app.closeAllConnections();resources.closeAllConnections();await new Promise(r=>app.close(r));await new Promise(r=>resources.close(r));}
