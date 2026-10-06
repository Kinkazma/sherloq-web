// Direct calls to the shipped computational clients. No application UI is loaded.
import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {chromium} from '../web/engine-source/node_modules/playwright/index.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const here=path.dirname(fileURLToPath(import.meta.url)),assets=path.resolve(here,'../web/wordpress/sherloq-browser/assets'),repo=path.resolve(here,'..');
const server=createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');if(route==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>SHERLOQ batch engine</title>');}const root=route.startsWith('/raw/')?path.join(here,'results/microscopy-d2prl-automatic-zones'):route.startsWith('/examples/')?repo:assets,file=path.resolve(root,'.'+(route.startsWith('/raw/')?route.slice(4):route));if(!file.startsWith(root+path.sep))throw Error('path');const stat=await fs.stat(file);res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream');res.setHeader('Accept-Ranges','bytes');const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');if(range){const start=+range[1],end=range[2]?Math.min(+range[2],stat.size-1):stat.size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});createReadStream(file,{start,end}).pipe(res);}else{res.setHeader('Content-Length',stat.size);createReadStream(file).pipe(res);}}catch(e){res.writeHead(404);res.end('not found');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const out=path.join(here,'results/microscopy-d2prl-automatic-zones'),browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage();page.setDefaultTimeout(0);
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const id of ['global-zone',...Array.from({length:16},(_,i)=>'panel-'+String(i+1).padStart(2,'0'))]){
  while(!(await fs.stat(path.join(out,id+'.json')).catch(()=>null)))await delay(2000);
  const source=JSON.parse(await fs.readFile(path.join(out,id+'.json')));
  const result=await page.evaluate(async source=>{
   const {Budget}=await import('/unified-engine/src/cache.js'),{createPostprocess}=await import('/unified-engine/experiments/d2prl/postprocess.js'),{createSpatial}=await import('/unified-engine/experiments/d2prl/spatial.js'),{createD2prlZones}=await import('/unified-engine/experiments/d2prl/zones.js');
   const budget=new Budget(1024**3),postprocess=createPostprocess({budget,moduleUrl:new URL('/unified-engine/vendor/d2prl/postprocess.js',location).href}),spatial=createSpatial({budget,moduleUrl:new URL('/unified-engine/vendor/d2prl/spatial.js',location).href});
   const projection=createD2prlZones({budget,postprocess,spatial}),raw=new Float32Array(await(await fetch('/raw/'+source.zone.id+'-raw-0.bin')).arrayBuffer());
   const original=new Uint8Array(await(await fetch('/raw/'+source.zone.id+'-mask.bin')).arrayBuffer());
   const request={width:source.width,height:source.height,zones:[{...source.zone,raw}],mode:'regions',exclusions:[]};
   try {
    const reference=await projection.run({...request,minimum:100});
    try{if(reference.mask.length!==original.length||reference.mask.some((v,i)=>v!==original[i]))throw Error('100-pixel reconstruction differs from exported web-engine mask');}finally{reference.release();}
    const filtered=await projection.run({...request,minimum:10});
    try{
     if(original.some((v,i)=>v&&!filtered.mask[i]))throw Error('10-pixel mask lost pixels selected at 100');
     let s='';for(let i=0;i<filtered.mask.length;i+=32768)s+=String.fromCharCode(...filtered.mask.subarray(i,i+32768));
     return {bytes:btoa(s),metadata:filtered.metadata,maskPixels:filtered.mask.reduce((a,b)=>a+(b?1:0),0),minimum100MatchesExportExactly:true,minimum10ContainsMinimum100:true,additionalInferences:0};
    }finally{filtered.release();}
   }finally{postprocess.dispose();spatial.dispose();}
  },source);
  await fs.writeFile(path.join(out,id+'-mask-10.bin'),Buffer.from(result.bytes,'base64'));delete result.bytes;
  await fs.writeFile(path.join(out,id+'-refilter-10.json'),JSON.stringify(result,null,2)+'\n');
  console.log(id,JSON.stringify({maskPixels:result.maskPixels,additionalInferences:0,verified100:true}));
 }
 const combined=await page.evaluate(async()=>{
  const {Budget}=await import('/unified-engine/src/cache.js'),{createPostprocess}=await import('/unified-engine/experiments/d2prl/postprocess.js'),{createSpatial}=await import('/unified-engine/experiments/d2prl/spatial.js'),{createD2prlZones}=await import('/unified-engine/experiments/d2prl/zones.js');
  const budget=new Budget(1024**3),postprocess=createPostprocess({budget,moduleUrl:new URL('/unified-engine/vendor/d2prl/postprocess.js',location).href}),spatial=createSpatial({budget,moduleUrl:new URL('/unified-engine/vendor/d2prl/spatial.js',location).href});
  const projection=createD2prlZones({budget,postprocess,spatial}),input=await(await fetch('/raw/input.json')).json(),zones=[];
  for(const id of ['global-zone',...Array.from({length:16},(_,i)=>'panel-'+String(i+1).padStart(2,'0'))]){
   const row=await(await fetch('/raw/'+id+'.json')).json();
   zones.push({...row.zone,raw:new Float32Array(await(await fetch('/raw/'+id+'-raw-0.bin')).arrayBuffer())});
  }
  const outputs=[];
  try{
   for(const minimum of [100,10]){
    const r=await projection.run({width:input.width,height:input.height,zones,mode:'regions',exclusions:[],minimum});
    try{let s='';for(let i=0;i<r.mask.length;i+=32768)s+=String.fromCharCode(...r.mask.subarray(i,i+32768));outputs.push({minimum,maskPixels:r.mask.reduce((a,b)=>a+(b?1:0),0),bytes:btoa(s),metadata:r.metadata,additionalInferences:0});}finally{r.release();}
   }
  }finally{postprocess.dispose();spatial.dispose();}
  return outputs;
 });
 for(const r of combined){await fs.writeFile(path.join(out,'combined-web-'+r.minimum+'.bin'),Buffer.from(r.bytes,'base64'));delete r.bytes;}
 await fs.writeFile(path.join(out,'combined-postprocess.json'),JSON.stringify(combined,null,2)+'\n');
 console.log('Combined 17-zone masks exported at 100 and 10 without inference');
}finally{await browser.close();await new Promise(r=>server.close(r));}
