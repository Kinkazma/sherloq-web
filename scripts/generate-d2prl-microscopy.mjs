// Direct calls to the shipped computational clients. No application UI is loaded.
import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {chromium} from '../web/engine-source/node_modules/playwright/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),assets=path.resolve(here,'../web/wordpress/sherloq-browser/assets'),repo=path.resolve(here,'..');
const server=createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');if(route==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>SHERLOQ batch engine</title>');}const root=route.startsWith('/examples/')?repo:assets,file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep))throw Error('path');const stat=await fs.stat(file);res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream');res.setHeader('Accept-Ranges','bytes');const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');if(range){const start=+range[1],end=range[2]?Math.min(+range[2],stat.size-1):stat.size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});createReadStream(file,{start,end}).pipe(res);}else{res.setHeader('Content-Length',stat.size);createReadStream(file).pipe(res);}}catch(e){res.writeHead(404);res.end('not found');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const out=path.join(here,'results/microscopy-d2prl-automatic-zones');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage();page.setDefaultTimeout(0);
 let phase='',lastWrite=0;
 const sourceIdentity=JSON.parse(await fs.readFile(path.join(repo,'docs/SOURCE-IDENTITY.json')));
 await page.exposeFunction('sourceIdentity',()=>sourceIdentity);
 await page.exposeFunction('progress',async p=>{const now=Date.now();if(now-lastWrite>2000){lastWrite=now;await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({at:new Date().toISOString(),...p}));}const key=p.zone+':'+p.phase;if(key!==phase&&['inference','zone-complete'].includes(p.phase)){phase=key;console.log(new Date().toISOString(),JSON.stringify(p));}});
 await page.exposeFunction('save',async(name,value,encoded=false)=>{await fs.writeFile(path.join(out,name),encoded?Buffer.from(value,'base64'):JSON.stringify(value,null,2)+'\n');});
 await page.exposeFunction('done',value=>console.log(new Date().toISOString(),JSON.stringify(value)));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(async()=>{
  const {createToolClient}=await import('/tool-client.js'),{createWorkerEngine}=await import('/unified-engine/src/worker-client.js');
  let engine;
  const client=await createToolClient({computeProfile:'aggressive',engineFactory:opts=>engine=createWorkerEngine({...opts,memoryBudgetBytes:8*1024**3,computeProfile:'aggressive',resourceHints:{hardwareConcurrency:8}}),onProgress:p=>window.progress(p)});
  const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  try {
   const file=await(await fetch('/examples/microscopy/input.png')).blob();
   const loaded=await client.load({id:'microscopy',blob:file,name:'microscopy.png'});
   const detected=await client.detectSubimages();
   const zones=detected.regions.map((r,i)=>({...r,id:'panel-'+String(i+1).padStart(2,'0'),kind:'region'}));
   if(zones.length!==16)throw Error('Expected 16 automatic panels, received '+zones.length);
   const bounds=[Math.min(...zones.map(r=>r.bounds[0])),Math.min(...zones.map(r=>r.bounds[1])),Math.max(...zones.map(r=>r.bounds[2])),Math.max(...zones.map(r=>r.bounds[3]))];
   const envelope={id:'global-zone',kind:'envelope',bounds};
   await window.save('input.json',{input:'examples/microscopy/input.png',sha256:loaded.sha256,width:loaded.width,height:loaded.height,minimum:100,sourceIdentity:await window.sourceIdentity(),detected,envelope,engine:(await client.capabilities()).version});
   await window.done({detected:zones.length,envelope});
   for(const zone of [envelope,...zones]){
    const start=performance.now();
    const r=await client.run({id:'microscopy-'+zone.id,imageId:loaded.id,operation:'ai.clones.d2prl',params:{minimum:100,selectionPresent:true},regions:[zone],backend:'auto'});
    const mask=r.maskSurfaces.mask;
    const {mask:pixels}=await engine.readMask({surfaceId:mask.id,revision:mask.revision,rect:{x:0,y:0,width:loaded.width,height:loaded.height}});
    await window.save(zone.id+'-mask.bin',b64(pixels.data),true);
    const raw=await engine.readD2prlRaw({imageId:loaded.id,resultId:r.data.metadata.resultId});
    for(let i=0;i<raw.data.rawGrids.length;i++)await window.save(zone.id+'-raw-'+i+'.bin',b64(new Uint8Array(raw.data.rawGrids[i].raw.buffer)),true);
    const record={zone,width:loaded.width,height:loaded.height,seconds:(performance.now()-start)/1000,maskPixels:pixels.data.reduce((a,b)=>a+(b?1:0),0),metadata:r.data.metadata,provenance:r.provenance,metrics:r.metrics};
    await window.save(zone.id+'.json',record);await window.done({zone:zone.id,seconds:record.seconds,maskPixels:record.maskPixels});
   }
  }finally{await client.dispose();}
 });
 console.log('ALL DONE');
}finally{await browser.close();await new Promise(r=>server.close(r));}
