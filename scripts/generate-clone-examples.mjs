// Compute example images with the restored web engine; no application UI.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../web/engine-source/node_modules/playwright/index.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=path.join(repo,'web/wordpress/sherloq-browser/assets');
const jobs=JSON.parse(await fs.readFile(path.resolve(repo,'scripts',process.argv[2]??'example-clone-jobs.json')));
const server=createServer(async(req,res)=>{
 try{
  const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Direct engine examples</title>');return;}
  const root=route.startsWith('/examples/')?repo:assets,file=path.resolve(root,'.'+route);
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  const stat=await fs.stat(file);
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream');
  res.setHeader('Content-Length',stat.size);createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const statuses=[];
try{
 for(const job of jobs){
  const context=await browser.newContext(),page=await context.newPage();
  const output=path.join(repo,'scripts/results',job.id);await fs.mkdir(output,{recursive:true});
  await page.exposeFunction('save',async(name,bytes)=>{
   if(path.basename(name)!==name)throw Error('Invalid output name');
   await fs.writeFile(path.join(output,name),Buffer.from(bytes,'base64'));
  });
  let phase='';await page.exposeFunction('progress',p=>{if(p!==phase){phase=p;console.log(job.id+' '+p);}});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const start=Date.now();let timer;
  try{
   const record=await Promise.race([page.evaluate(async job=>{
    if(job.operation==='preparation.text'){
     const {createBatchPreparationClient}=await import('/batch-preparation-client.js');
     const client=await createBatchPreparationClient({computeProfile:'aggressive',memoryBudgetBytes:8*1024**3});
     const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
     try{
      const file=await(await fetch('/'+job.input)).blob();
      const result=await client.prepare(file,{textOnly:true,backend:'cpu',onProgress:p=>window.progress(p.phase??'working')});
      const source=await createImageBitmap(file),canvas=new OffscreenCanvas(source.width,source.height),ctx=canvas.getContext('2d');
      ctx.drawImage(source,0,0);ctx.strokeStyle='#e42d48';ctx.lineWidth=3;
      for(const polygon of result.text.polygons){ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();}
      const png=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer());let binary='';for(let i=0;i<png.length;i+=32768)binary+=String.fromCharCode(...png.subarray(i,i+32768));await window.save('result.png',btoa(binary));
      return {job,inputSha256:await hash(await file.arrayBuffer()),sourceDimensions:[source.width,source.height],sourceCommit:job.sourceCommit,runtime:'Direct shipped batch preparation client in headless Chrome; no application UI',presentation:'Three-pixel red polygon outlines drawn from PP-OCRv6 native text proposals over the unchanged source raster; detection only, not text recognition.',outputs:[{file:'result.png',label:'Text detection proposals',width:source.width,height:source.height,sha256:await hash(png)}],result};
     }finally{await client.dispose();}
    }
    const {createToolClient}=await import('/tool-client.js');
    const {createWorkerEngine}=await import('/unified-engine/src/worker-client.js');
    const {neuralDisplays}=await import('/neural-clone-ui.js');
    const {resultDisplays}=await import('/tool-displays.js');
    const {sparseParameters}=await import('/sparse-controls.js');
    const client=await createToolClient({computeProfile:'aggressive',engineFactory:opts=>createWorkerEngine({...opts,memoryBudgetBytes:8*1024**3,computeProfile:'aggressive',resourceHints:{hardwareConcurrency:4}}),onProgress:p=>window.progress(p.phase??'working')});
    const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
    const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const summarize=v=>ArrayBuffer.isView(v)?{type:v.constructor.name,length:v.length}:Array.isArray(v)?v.length>200?{length:v.length}:v.map(summarize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['pixels','release'].includes(k)).map(([k,x])=>[k,summarize(x)])):typeof v==='string'?v.replaceAll(location.origin+'/',''):v;
    try{
     const file=await(await fetch('/'+job.input)).blob();
     const loaded=await client.load({id:'source',blob:file,name:job.input.split('/').pop()});
     const params=job.rectangles?sparseParameters(job.params,job.rectangles):job.params;
     const result=await client.run({id:job.id,imageId:loaded.id,operation:job.operation,params,view:job.view??{},backend:job.backend??'cpu'},{file});
     if(job.operation==='tampering.copyMove.sparse'&&(result.style.circles||result.style.lines||result.style.points||!result.style.areas))throw Error('Expected native Biomes-only display');
     const displays=resultDisplays(result,{neuralDisplays,language:'en'});
     if(!displays?.length)throw Error('No native display for '+job.id);
     const outputs=[];
     for(const {label,display}of displays){
      if(job.views&&!job.views.includes(display.cloneView??label))continue;
      const pixels=await client.readWindow(display,{x:0,y:0,width:display.width,height:display.height});
      const rgba=new Uint8ClampedArray(pixels.width*pixels.height*4);
      for(let i=0;i<pixels.width*pixels.height;i++){rgba.set(pixels.data.subarray(i*3,i*3+3),i*4);rgba[i*4+3]=255;}
      const canvas=new OffscreenCanvas(pixels.width,pixels.height);canvas.getContext('2d').putImageData(new ImageData(rgba,pixels.width,pixels.height),0,0);
      const png=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      const name=(display.cloneView??(outputs.length?'view-'+outputs.length:'result'))+'.png';await window.save(name,b64(png));
      outputs.push({file:name,label,width:pixels.width,height:pixels.height,sha256:await hash(png),rawRgbSha256:await hash(pixels.data)});
     }
     const scientific=[];
     if(result.operation==='tampering.copyMove.sparse'){
      const convert=v=>ArrayBuffer.isView(v)?Array.from(v):Array.isArray(v)?v.map(convert):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,convert(x)])):v;
      const bytes=new TextEncoder().encode(JSON.stringify(convert(Object.fromEntries(['points','pairs','groups','models','colors','bases','pair_search_regions'].filter(k=>result.data[k]!==undefined).map(k=>[k,result.data[k]]))))+'\n');
      await window.save('matches.json',b64(bytes));scientific.push({file:'matches.json',format:'json',sha256:await hash(bytes)});
     }
     if(result.operation==='ai.clones.segmentation')for(const [field,descriptor]of Object.entries({map:result.surface,...result.planeSurfaces,...result.maskSurfaces})){
      if(!descriptor||!['map','mask','source','target'].includes(field))continue;
      const values=await client.readScalar(descriptor,{x:0,y:0,width:descriptor.width,height:descriptor.height});
      const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),name=field+'.f32';await window.save(name,b64(bytes));
      scientific.push({file:name,field,type:'Float32Array',byteOrder:'little-endian',width:descriptor.width,height:descriptor.height,sha256:await hash(bytes)});
     }
     return {job,inputSha256:loaded.sha256,sourceDimensions:[loaded.width,loaded.height],engine:(await client.capabilities()).version,sourceCommit:job.sourceCommit,runtime:'Direct shipped web computational clients in headless Chrome; no application UI',outputs,scientific,result:summarize(result)};
    }finally{await client.dispose();}
   },job),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Example timed out')),job.timeoutMs??900000);})]);
   await fs.writeFile(path.join(output,'result.json'),JSON.stringify(record,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
   statuses.push({id:job.id,status:'ok',seconds:(Date.now()-start)/1000});
  }catch(error){statuses.push({id:job.id,status:'failed',error:error.message,seconds:(Date.now()-start)/1000});}
  finally{clearTimeout(timer);await context.close();}
  await fs.writeFile(path.join(repo,'scripts/clone-status.json'),JSON.stringify(statuses,null,2)+'\n');
  console.log(JSON.stringify(statuses.at(-1)));
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
